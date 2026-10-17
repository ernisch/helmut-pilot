"""Read-only fresh-network-namespace counters, after owned clients exit."""
import time
from pathlib import Path

FIELDS=('rx_bytes','tx_bytes','rx_packets','tx_packets','rx_errors','tx_errors','rx_dropped','tx_dropped')
def network():
    return {p.name:{k:int((p/'statistics'/k).read_text()) for k in FIELDS}
            for p in Path('/sys/class/net').iterdir()}

def active_tcp_sockets():
    count=0
    for table in ['tcp','tcp6']:
        for line in (Path('/proc/net')/table).read_text().splitlines()[1:]:
            # TIME_WAIT is kernel bookkeeping without an application socket.
            row=line.split()
            # Docker's embedded DNS listener belongs to daemon infrastructure.
            if row[3]=='0A' and row[1].startswith('0B00007F:'):continue
            if row[3] not in ['06']:count+=1
    return count

def settled_network(timeout=4,quiet=.3,read=network,active=active_tcp_sockets):
    started=time.monotonic();last=read();unchanged=started
    while time.monotonic()-started<timeout:
        time.sleep(.05);now=time.monotonic();value=read()
        if value!=last:last=value;unchanged=now
        if active()==0 and now-unchanged>=quiet:
            if any(row[k] for row in value.values() for k in ['rx_errors','tx_errors','rx_dropped','tx_dropped']):
                raise RuntimeError('network errors/drops invalidate complete byte receipt')
            return {'totalsSinceFreshNamespaceBirth':value,'quietSeconds':now-unchanged,
                    'activeTCPNonTimeWaitSockets':0,'errorAndDropCountersZero':True,
                    'baselineIsDiagnosticAndNotSubtracted':True}
    raise RuntimeError('network tail did not settle after all owned clients exited')
