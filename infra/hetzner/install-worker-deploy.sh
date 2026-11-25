#!/bin/bash
set -euo pipefail

if [[ $EUID != 0 ]]; then
  echo "Einrichtung bitte mit sudo ausführen." >&2
  exit 1
fi

source_dir=$(cd -- "$(dirname -- "$0")" && pwd)
command -v git >/dev/null
docker compose version >/dev/null
/usr/bin/python3 -I -B -c 'from zoneinfo import ZoneInfo; ZoneInfo("Europe/Berlin")'
test -s /etc/helmut/worker.env
worker_labels=$(docker ps --filter label=com.docker.compose.project=helmut-quellenworker \
  --filter label=com.docker.compose.service=worker --format '{{.Label "com.docker.compose.oneoff"}}')
if [[ ${worker_labels,,} != false ]]; then
  echo "Für die Einrichtung muss genau ein regulärer HELMUT-Worker laufen." >&2
  exit 1
fi
install -d -m 0755 /usr/local/lib/helmut-worker-deploy
install -m 0644 "$source_dir/worker-deploy.py" /usr/local/lib/helmut-worker-deploy/
install -m 0644 "$source_dir/helmut-worker-deploy.service" "$source_dir/helmut-worker-deploy.timer" /etc/systemd/system/
systemctl daemon-reload
systemctl enable --now helmut-worker-deploy.timer
systemctl start helmut-worker-deploy.service
systemctl list-timers helmut-worker-deploy.timer --no-pager
journalctl -u helmut-worker-deploy.service -n 10 --no-pager
