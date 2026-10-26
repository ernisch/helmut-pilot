"use strict";

// Durable within one shared HOME filesystem. Not a cross-machine provider cap.
// Fails closed on missing/corrupt/locked state. Reservations survive crashes.
const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const DAILY_LIMIT_MICRO_USD = 2000000; // Local ceiling: 2.00 USD per UTC day.
const VERSION = 1;

function usdToMicro(value) {
  if (!Number.isFinite(value) || value < 0) throw new Error("deepseek-budget-invalid-amount");
  // Avoid floating-point noise at exact micro-USD boundaries (e.g. 0.25).
  return Math.ceil(value * 1000000 - 1e-7);
}

function defaultDir(env = process.env) {
  const home = env.HOME || os.homedir();
  if (!path.isAbsolute(home)) throw new Error("deepseek-budget-home-not-absolute");
  return path.join(home, ".local", "state", "helmut-deepseek-router");
}

function checkDir(dir) {
  const stat = fs.lstatSync(dir);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077)) {
    throw new Error("deepseek-budget-directory-unsafe");
  }
}

function readState(dir) {
  const location = path.join(dir, "budget.json");
  let fd;
  try {
    fd = fs.openSync(location, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
  } catch (error) {
    if (error.code === "ENOENT") {
      throw new Error("deepseek-budget-journal-missing; no-provider-call");
    }
    throw error;
  }
  try {
    const st = fs.fstatSync(fd);
    if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) || st.size > 1048576) {
      throw new Error("deepseek-budget-state-unsafe");
    }
    const parsed = JSON.parse(fs.readFileSync(fd, "utf8"));
    if (!parsed || parsed.version !== VERSION || !parsed.days ||
        Array.isArray(parsed.days) || typeof parsed.days !== "object") {
      throw new Error("deepseek-budget-state-invalid");
    }
    for (const [day, tickets] of Object.entries(parsed.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(tickets)) {
        throw new Error("deepseek-budget-state-invalid");
      }
      for (const t of tickets) {
        if (!t || typeof t.id !== "string" || !Number.isSafeInteger(t.micro) ||
            t.micro < 0 || t.micro > 10000000 || !["reserved", "settled"].includes(t.state)) {
          throw new Error("deepseek-budget-ticket-invalid");
        }
      }
    }
    return parsed;
  } finally {
    fs.closeSync(fd);
  }
}

function saveState(dir, state) {
  const tmp = path.join(dir, ".budget-" + crypto.randomUUID() + ".tmp");
  try {
    fs.writeFileSync(tmp, JSON.stringify(state) + "\n", { flag: "wx", mode: 0o600 });
    const fd = fs.openSync(tmp, "r");
    try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(tmp, path.join(dir, "budget.json"));
    const fdDir = fs.openSync(dir, "r");
    try { fs.fsyncSync(fdDir); } finally { fs.closeSync(fdDir); }
  } finally {
    try { fs.unlinkSync(tmp); } catch (error) { if (error.code !== "ENOENT") throw error; }
  }
}

function withLock(dir, action) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  checkDir(dir);
  const lock = path.join(dir, ".lock");
  try {
    fs.mkdirSync(lock, { mode: 0o700 });
  } catch (error) {
    if (error.code === "EEXIST") throw new Error("deepseek-budget-locked; no-provider-call");
    throw error;
  }
  try {
    const marker = path.join(dir, ".initialized");
    const journal = path.join(dir, "budget.json");
    let initialized = false;
    try {
      const fd = fs.openSync(marker, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW);
      try {
        const st = fs.fstatSync(fd);
        if (!st.isFile() || st.nlink !== 1 || (st.mode & 0o077) || st.size === 0 || st.size > 128) {
          throw new Error("deepseek-budget-initialization-unsafe");
        }
      } finally { fs.closeSync(fd); }
      initialized = true;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
    if (!initialized) {
      if (fs.existsSync(journal)) {
        throw new Error("deepseek-budget-unmarked-journal; manual-recovery-required");
      }
      // Persist the independent initialization marker FIRST. A crash before
      // creating budget.json then fails closed instead of resetting spending.
      fs.writeFileSync(marker, crypto.randomUUID() + "\n", { flag: "wx", mode: 0o600 });
      const fd = fs.openSync(marker, "r");
      try { fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
      const dfd = fs.openSync(dir, "r");
      try { fs.fsyncSync(dfd); } finally { fs.closeSync(dfd); }
      saveState(dir, { version: VERSION, days: {} });
    }
    return action();
  } finally {
    fs.rmdirSync(lock);
  }
}

function usedMicro(tickets) {
  return tickets.reduce((sum, t) => sum + t.micro, 0);
}

function reserve({ estimateUsd, model, env = process.env, dir = defaultDir(env), now = new Date() }) {
  const amount = usdToMicro(estimateUsd);
  if (!amount || amount > DAILY_LIMIT_MICRO_USD) throw new Error("deepseek-budget-per-call-too-large");
  const day = now.toISOString().slice(0, 10);
  return withLock(dir, () => {
    const state = readState(dir);
    const tickets = state.days[day] || [];
    const used = usedMicro(tickets);
    if (used + amount > DAILY_LIMIT_MICRO_USD) {
      throw new Error("deepseek-budget-daily-cap; no-provider-call");
    }
    const receipt = { id: crypto.randomUUID(), state: "reserved", micro: amount, model };
    tickets.push(receipt);
    state.days[day] = tickets;
    saveState(dir, state);
    return { day, id: receipt.id, reservedMicro: amount, dir };
  });
}

function settle(receipt, actualUsd) {
  if (actualUsd === null || actualUsd === undefined) return false;
  const actualMicro = usdToMicro(actualUsd);
  return withLock(receipt.dir, () => {
    const state = readState(receipt.dir);
    const ticket = (state.days[receipt.day] || []).find(t => t.id === receipt.id);
    if (!ticket || ticket.state !== "reserved") throw new Error("deepseek-budget-settlement-invalid");
    // Even if true provider consumption exceeds the predicted cap, record it
    // faithfully and reject all subsequent requests when the day is exhausted.
    ticket.micro = actualMicro;
    ticket.state = "settled";
    saveState(receipt.dir, state);
    return true;
  });
}

function snapshot({ dir, day = new Date().toISOString().slice(0, 10) }) {
  const state = readState(dir);
  const tickets = state.days[day] || [];
  return {
    day,
    amountMicro: usedMicro(tickets),
    pending: tickets.filter(t => t.state === "reserved").length,
    count: tickets.length,
    limitMicro: DAILY_LIMIT_MICRO_USD,
  };
}

module.exports = { DAILY_LIMIT_MICRO_USD, defaultDir, reserve, settle, snapshot, usdToMicro };