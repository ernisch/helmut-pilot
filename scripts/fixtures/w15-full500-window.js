"use strict";

// Pure calculation only. The caller supplies its freshly read real UTC clock.
const ACTIVE_MS = 3 * 60 * 60 * 1000;
const COMPLETION_MS = ACTIVE_MS + 30 * 60 * 1000;
const FIRST_RUN_DAY = "2026-10-28";
const LAST_ORDER_DAY = "2026-10-31";
const berlin = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit"
});
function requireThat(condition, reason) {
  if (!condition) throw Error("w15-full500-window-" + reason);
}
function berlinDay(value) {
  const parts = Object.fromEntries(berlin.formatToParts(value).map(x => [x.type, x.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}
function window(nowISO) {
  requireThat(typeof nowISO === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(nowISO), "utc-iso-required");
  const now = Date.parse(nowISO);
  requireThat(Number.isFinite(now), "invalid-clock");
  requireThat(new Date(now).toISOString().slice(0, 19) === nowISO.slice(0, 19), "invalid-calendar-date");
  const utcDay = new Date(now).toISOString().slice(0, 10), localDay = berlinDay(now);
  requireThat(utcDay >= FIRST_RUN_DAY && utcDay <= LAST_ORDER_DAY && localDay <= LAST_ORDER_DAY, "order-date");
  const values = [now + 1, now + ACTIVE_MS, now + COMPLETION_MS];
  for (const value of values) {
    requireThat(new Date(value).toISOString().slice(0, 10) === utcDay, "utc-day-crossing");
    requireThat(berlinDay(value) === localDay, "berlin-day-crossing");
  }
  return { startsAtUTC: new Date(values[0]).toISOString(), endsAtUTC: new Date(values[1]).toISOString(),
    completionDeadlineUTC: new Date(values[2]).toISOString() };
}
module.exports = Object.freeze({ window });
