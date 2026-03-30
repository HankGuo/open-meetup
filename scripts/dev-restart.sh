#!/usr/bin/env bash

set -u

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PID_FILE="$ROOT_DIR/.open-meetup-dev.pid"
STOP_SCRIPT="$ROOT_DIR/scripts/dev-stop.sh"
LOG_DIR="$ROOT_DIR/.logs"

bash "$STOP_SCRIPT"

mkdir -p "$LOG_DIR"

echo "Starting server..."
(
  cd "$ROOT_DIR/server" || exit 1
  exec npm run dev > "$LOG_DIR/server.log" 2>&1
) &
SERVER_PID=$!

echo "Starting client..."
(
  cd "$ROOT_DIR/client" || exit 1
  exec npm run dev > "$LOG_DIR/client.log" 2>&1
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

echo "Restart completed."
echo "Server: http://localhost:3001"
echo "Client: http://localhost:5173"
echo "Logs: $LOG_DIR/server.log"
echo "Logs: $LOG_DIR/client.log"
