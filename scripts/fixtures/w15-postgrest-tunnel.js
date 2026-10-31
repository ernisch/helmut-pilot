"use strict";

// Transparent local test transport only. No HTTP parsing, response generation,
// credentials, SQL or authority decisions. Docker forwards the byte streams to
// the existing network-none container's own PostgREST loopback listener.
const net = require("node:net");
const { spawn } = require("node:child_process");
const IDLE_MS = 60000;
const FORWARDER = String.raw`
use strict;
use warnings;
use Fcntl qw(F_GETFL F_SETFL O_NONBLOCK);
use Errno qw(EAGAIN EWOULDBLOCK EINTR);
use Socket qw(SHUT_WR);
$SIG{PIPE} = 'IGNORE';
my $port = shift @ARGV;
die "local-forwarder-port" unless defined($port) && $port =~ /^[0-9]+$/ && $port > 0 && $port < 65536;
my $remote = IO::Socket::INET->new(PeerAddr => '127.0.0.1', PeerPort => $port,
  Proto => 'tcp', Timeout => 10) or exit 1;
my $input = \*STDIN;
my $output = \*STDOUT;
binmode($input); binmode($output);
for my $fh ($input, $output, $remote) {
  my $flags = fcntl($fh, F_GETFL, 0);
  defined($flags) && defined(fcntl($fh, F_SETFL, $flags | O_NONBLOCK)) or exit 1;
}
my ($to_remote, $to_output) = ('', '');
my ($input_eof, $remote_eof, $write_closed) = (0, 0, 0);
while (1) {
  if ($input_eof && !length($to_remote) && !$write_closed) {
    shutdown($remote, SHUT_WR); $write_closed = 1;
  }
  last if $remote_eof && !length($to_output);
  my $read = IO::Select->new(); my $write = IO::Select->new();
  $read->add($input) unless $input_eof || length($to_remote) >= 262144;
  $read->add($remote) unless $remote_eof || length($to_output) >= 262144;
  $write->add($remote) if !$remote_eof && length($to_remote);
  $write->add($output) if length($to_output);
  my ($ready_read, $ready_write) = IO::Select->select($read, $write, undef, 60);
  last unless $ready_read && $ready_write && (@$ready_read || @$ready_write);
  for my $fh (@$ready_read) {
    my $chunk = ''; my $n = sysread($fh, $chunk, 65536);
    if (!defined($n)) { next if $! == EAGAIN || $! == EWOULDBLOCK || $! == EINTR; exit 1; }
    if (fileno($fh) == fileno($input)) {
      if ($n == 0) { $input_eof = 1; } else { $to_remote .= $chunk; }
    } else {
      if ($n == 0) { $remote_eof = 1; $input_eof = 1; $to_remote = ''; }
      else { $to_output .= $chunk; }
    }
  }
  for my $fh (@$ready_write) {
    my $to_stdout = fileno($fh) == fileno($output);
    next if !$to_stdout && $remote_eof;
    my $n = $to_stdout ? syswrite($fh, $to_output) : syswrite($fh, $to_remote);
    if (!defined($n)) { next if $! == EAGAIN || $! == EWOULDBLOCK || $! == EINTR; exit 1; }
    exit 1 unless $n > 0;
    if ($to_stdout) { substr($to_output, 0, $n, ''); }
    else { substr($to_remote, 0, $n, ''); }
  }
}
close($remote);
`;

async function start({ container, postgrestPort = 3100 } = {}) {
  if (typeof container !== "string" || !/^synthetik500-runtime-pg-[a-f0-9]{1,64}$/.test(container)
    || !Number.isSafeInteger(postgrestPort) || postgrestPort < 1 || postgrestPort > 65535)
    throw Error("w15-local-tunnel-invalid-target");
  const metrics = { connections: 0, activeConnections: 0, bytesToContainer: 0,
    bytesFromContainer: 0, idleTimeouts: 0, transportErrors: 0 };
  const peers = new Set(); let closing = false, closingPromise;
  const server = net.createServer({ allowHalfOpen: true }, socket => {
    if (closing || socket.remoteAddress !== "127.0.0.1") { socket.destroy(); return; }
    metrics.connections++; metrics.activeConnections++;
    const child = spawn("docker", ["--host=unix:///var/run/docker.sock", "exec", "-i", container,
      "perl", "-MIO::Socket::INET", "-MIO::Select", "-e", FORWARDER, "--", String(postgrestPort)], {
      env: { PATH: process.env.PATH }, stdio: ["pipe", "pipe", "ignore"]
    });
    let exited = false, cleaned = false, terminateTimer, killTimer, resolveExit;
    const exit = new Promise(resolve => { resolveExit = resolve; });
    const peer = { stop, exit }; peers.add(peer);
    function stop() {
      if (cleaned) return; cleaned = true;
      socket.destroy(); child.stdin.end();
      if (!exited) {
        terminateTimer = setTimeout(() => {
          if (!exited) child.kill("SIGTERM");
          killTimer = setTimeout(() => { if (!exited) child.kill("SIGKILL"); }, 1000);
        }, 2000);
      }
    }
    socket.setTimeout(IDLE_MS);
    socket.on("timeout", () => { metrics.idleTimeouts++; stop(); });
    socket.on("data", bytes => { metrics.bytesToContainer += bytes.length; });
    child.stdout.on("data", bytes => { metrics.bytesFromContainer += bytes.length; });
    const transportError = () => { metrics.transportErrors++; stop(); };
    socket.on("error", transportError); child.on("error", transportError);
    child.stdin.on("error", transportError); child.stdout.on("error", transportError);
    socket.once("close", stop);
    child.once("close", code => {
      exited = true; clearTimeout(terminateTimer); clearTimeout(killTimer);
      if (code !== 0 && !cleaned) metrics.transportErrors++;
      metrics.activeConnections--; peers.delete(peer); resolveExit();
      // Flush bytes already queued to the client before closing its read half.
      if (!socket.destroyed) {
        socket.end();
        if (socket.writableFinished) socket.destroy();
        else socket.once("finish", () => socket.destroy());
      }
    });
    socket.pipe(child.stdin); child.stdout.pipe(socket);
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => { server.removeListener("error", reject); resolve(); });
  });
  // Runtime listener failures close only this test transport and its own peers.
  server.on("error", () => { metrics.transportErrors++; void close(); });
  function close() {
    if (!closingPromise) closingPromise = (async () => {
      closing = true;
      const stopped = new Promise(resolve => server.close(resolve));
      const pending = [...peers]; for (const peer of pending) peer.stop();
      await Promise.all([stopped, ...pending.map(peer => peer.exit)]);
    })();
    return closingPromise;
  }
  return { port: server.address().port, metrics, close };
}

module.exports = { start };
