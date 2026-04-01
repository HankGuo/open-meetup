#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.open-meetup-dev.pid"
STOP_SCRIPT="$ROOT_DIR/scripts/dev-stop.sh"
LOG_DIR="$ROOT_DIR/.logs"
SERVER_PORT="${SERVER_PORT:-3001}"
CLIENT_PORT="${CLIENT_PORT:-5173}"
SERVER_HOST="${SERVER_HOST:-0.0.0.0}"
HOST_PASSWORD_VALUE="${HOST_PASSWORD:-12345678}"

show_help() {
  cat <<'EOF'
用法:
  ./scripts/dev-restart.sh [选项]

选项:
  --host-password <password>  设置主持人授权口令（默认: 12345678）
  --server-port <port>        设置服务端端口（默认: 3001）
  --client-port <port>        设置前端端口（默认: 5173）
  -h, --help                  显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host-password)
      HOST_PASSWORD_VALUE="${2:-}"
      shift 2
      ;;
    --server-port)
      SERVER_PORT="${2:-}"
      shift 2
      ;;
    --client-port)
      CLIENT_PORT="${2:-}"
      shift 2
      ;;
    -h|--help)
      show_help
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      show_help
      exit 1
      ;;
  esac
done

if [[ -z "$HOST_PASSWORD_VALUE" ]]; then
  echo "Error: --host-password 不能为空"
  exit 1
fi

SERVER_PORT="$SERVER_PORT" CLIENT_PORT="$CLIENT_PORT" bash "$STOP_SCRIPT"

mkdir -p "$LOG_DIR"

echo "Starting server..."
(
  cd "$ROOT_DIR/server" || exit 1
  exec HOST="$SERVER_HOST" PORT="$SERVER_PORT" HOST_PASSWORD="$HOST_PASSWORD_VALUE" npm run dev > "$LOG_DIR/server.log" 2>&1
) &
SERVER_PID=$!

echo "Starting client..."
(
  cd "$ROOT_DIR/client" || exit 1
  exec npm run dev -- --host 0.0.0.0 --port "$CLIENT_PORT" > "$LOG_DIR/client.log" 2>&1
) &
CLIENT_PID=$!

sleep 2

if ! kill -0 "$SERVER_PID" >/dev/null 2>&1; then
  echo "Server failed to start. Check: $LOG_DIR/server.log"
  exit 1
fi

if ! kill -0 "$CLIENT_PID" >/dev/null 2>&1; then
  echo "Client failed to start. Check: $LOG_DIR/client.log"
  kill -9 "$SERVER_PID" >/dev/null 2>&1 || true
  exit 1
fi

cat > "$PID_FILE" <<EOF
server=$SERVER_PID
client=$CLIENT_PID
EOF

get_primary_ip() {
  local ip=""

  if command -v ipconfig >/dev/null 2>&1; then
    ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [[ -z "$ip" ]]; then
      ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
    fi
  fi

  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi

  echo "$ip"
}

NETWORK_IP="$(get_primary_ip)"

echo "Restart completed."
echo "Host password: $HOST_PASSWORD_VALUE"
echo "Server (local): http://localhost:$SERVER_PORT"
echo "Client (local): http://localhost:$CLIENT_PORT"
if [[ -n "$NETWORK_IP" ]]; then
  echo "Server (LAN): http://$NETWORK_IP:$SERVER_PORT"
  echo "Client (LAN): http://$NETWORK_IP:$CLIENT_PORT"
fi
echo "Logs: $LOG_DIR/server.log"
echo "Logs: $LOG_DIR/client.log"
