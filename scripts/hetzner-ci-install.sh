#!/bin/bash
# Manual, reviewed installation on the CI host only. Never called by the workflow.
set -euo pipefail
umask 077
test "$(id -u)" = 0
test "$#" = 2
SOURCE_DIR=$(cd -- "$(dirname -- "$0")" && pwd)
PUBLIC_KEY_FILE=$1
EXPECTED_SHA=$2
[[ "$EXPECTED_SHA" =~ ^[a-f0-9]{64}$ ]]
printf '%s  %s\n' "$EXPECTED_SHA" "$SOURCE_DIR/hetzner-ci-bridge.py" | sha256sum --check --status

# Accept one Ed25519 PUBLIC key only, never a private key or authorized_keys options.
/usr/bin/python3 -I - "$PUBLIC_KEY_FILE" <<'PY'
import base64, pathlib, re, sys
value = pathlib.Path(sys.argv[1]).read_text().strip()
assert re.fullmatch(r'ssh-ed25519 [A-Za-z0-9+/]+={0,2}(?: [A-Za-z0-9@._-]+)?', value)
decoded = base64.b64decode(value.split()[1], validate=True)
assert len(decoded) == 51 and decoded[:19] == b'\x00\x00\x00\x0bssh-ed25519\x00\x00\x00\x20'
PY

# Refuse existing installations/accounts; a rerun must be reviewed, not overwrite them.
if getent passwd helmut-ci >/dev/null; then
    printf '%s\n' 'helmut-ci already exists; review the existing account first.' >&2
    exit 1
fi
test ! -e /etc/helmut-ci
test ! -e /usr/local/libexec/helmut-ci-bridge.py
test ! -e /etc/ssh/sshd_config.d/60-helmut-ci.conf
test ! -e /var/lib/helmut-ci

useradd --user-group --create-home --home-dir /var/lib/helmut-ci --shell /bin/sh helmut-ci
install -d -m 0755 /usr/local/libexec /etc/helmut-ci
install -o root -g root -m 0644 "$SOURCE_DIR/hetzner-ci-bridge.py" /usr/local/libexec/helmut-ci-bridge.py
PUBLIC_KEY=$(awk '{print $1 " " $2}' "$PUBLIC_KEY_FILE")
printf 'from="100.64.0.0/10",restrict,command="/usr/bin/python3 -I /usr/local/libexec/helmut-ci-bridge.py gate" %s\n' "$PUBLIC_KEY" > /etc/helmut-ci/authorized_keys
chmod 0644 /etc/helmut-ci/authorized_keys

cat > /etc/ssh/sshd_config.d/60-helmut-ci.conf <<'CONFIG'
Match User helmut-ci
    AuthorizedKeysFile /etc/helmut-ci/authorized_keys
    AuthenticationMethods publickey
    PasswordAuthentication no
    KbdInteractiveAuthentication no
    PermitUserRC no
    PermitTTY no
    DisableForwarding yes
    PermitTunnel no
    X11Forwarding no
    ForceCommand /usr/bin/python3 -I /usr/local/libexec/helmut-ci-bridge.py gate
Match all
CONFIG

# Validate effective settings before reloading. Keep the administrator's SSH session open.
if ! /usr/sbin/sshd -t || ! /usr/bin/python3 -I - <<'PY'
import subprocess
raw = subprocess.check_output(['/usr/sbin/sshd', '-T', '-C',
    'user=helmut-ci,host=helmut-ci,addr=100.64.0.1,laddr=100.64.0.2,lport=22'], text=True)
actual = dict(line.split(' ', 1) for line in raw.splitlines())
expected = {
    'authorizedkeysfile': '/etc/helmut-ci/authorized_keys',
    'authenticationmethods': 'publickey', 'passwordauthentication': 'no',
    'kbdinteractiveauthentication': 'no', 'permituserenvironment': 'no',
    'permituserrc': 'no', 'permittty': 'no', 'disableforwarding': 'yes',
    'permittunnel': 'no', 'x11forwarding': 'no',
    'forcecommand': '/usr/bin/python3 -I /usr/local/libexec/helmut-ci-bridge.py gate',
}
assert all(actual.get(key) == value for key, value in expected.items())
PY
then
    mv /etc/ssh/sshd_config.d/60-helmut-ci.conf /etc/helmut-ci/60-helmut-ci.conf.rejected
    printf '%s\n' 'SSH validation failed; configuration disabled, no reload.' >&2
    exit 1
fi
systemctl reload ssh
printf '%s\n' 'Probe gate installed. Native execution remains disabled.'
sha256sum /usr/local/libexec/helmut-ci-bridge.py
# Host public key only, to compare against the trusted Hetzner console.
awk '{print $1 " " $2}' /etc/ssh/ssh_host_ed25519_key.pub
