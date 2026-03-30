#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.open-meetup-dev.pid"
PORTS=(3001 5173)

kill_pid() {
  local pid="$1"
  local reason="$2"

  if [[ -z "$pid" ]]; then
    return
  fi

  if kill -0 "$pid" >/dev/null 2>&1; then
    echo "Force killing ${reason} (PID: ${pid})"
    kill -9 "$pid" >/dev/null 2>&1 || true
  fi
}

if [[ -f "$PID_FILE" ]]; then
  while IFS='=' read -r name pid; do
    kill_pid "${pid:-}" "${name:-process}"
  done < "$PID_FILE"
  rm -f "$PID_FILE"
fi

for port in "${PORTS[@]}"; do
  port_pids="$(lsof -ti tcp:"$port" 2>/dev/null || true)"
  if [[ -n "$port_pids" ]]; then
    for pid in $port_pids; do
      kill_pid "$pid" "port ${port}"
    done
  fi
done

echo "Stop completed."
