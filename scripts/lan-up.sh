#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.lan.yml"
HOST_PASSWORD_VALUE="${HOST_PASSWORD:-12345678}"
LAN_PORT_VALUE="${LAN_PORT:-8080}"
REBUILD=false

show_help() {
  cat <<'EOF'
用法:
  ./scripts/lan-up.sh [选项]

选项:
  --host-password <password>  设置主持人授权口令（默认: 12345678）
  --port <port>               设置外部访问端口（默认: 8080）
  --rebuild                   强制重建镜像后再启动
  -h, --help                  显示帮助
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --host-password)
      HOST_PASSWORD_VALUE="${2:-}"
      shift 2
      ;;
    --port)
      LAN_PORT_VALUE="${2:-}"
      shift 2
      ;;
    --rebuild)
      REBUILD=true
      shift
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

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: 未找到 docker，请先安装 Docker Desktop 或 Docker Engine"
  exit 1
fi

if ! docker compose version >/dev/null 2>&1; then
  echo "Error: 当前环境不支持 'docker compose' 命令"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker daemon 未启动，请先启动 Docker Desktop（或 Docker 服务）"
  exit 1
fi

compose_up_cmd=(docker compose -f "$COMPOSE_FILE" up -d)
if [[ "$REBUILD" == "true" ]]; then
  compose_up_cmd+=(--build)
fi

echo "Starting Open Meetup LAN stack..."
(
  cd "$ROOT_DIR" || exit 1
  HOST_PASSWORD="$HOST_PASSWORD_VALUE" LAN_PORT="$LAN_PORT_VALUE" "${compose_up_cmd[@]}"
)

get_primary_ip() {
  local ip=""

  if command -v ipconfig >/dev/null 2>&1; then
    ip="$(ipconfig getifaddr en0 2>/dev/null || true)"
    if [[ -z "$ip" ]]; then
      ip="$(ipconfig getifaddr en1 2>/dev/null || true)"
    fi
  fi

  if [[ -z "$ip" ]] && command -v ip >/dev/null 2>&1; then
    ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<=NF;i++){if($i=="src"){print $(i+1); exit}}}' || true)"
  fi

  if [[ -z "$ip" ]] && command -v hostname >/dev/null 2>&1; then
    ip="$(hostname -I 2>/dev/null | awk '{print $1}' || true)"
  fi

  echo "$ip"
}

LAN_IP="$(get_primary_ip)"
if [[ -z "$LAN_IP" ]]; then
  LAN_IP="localhost"
fi

SHARE_URL="http://$LAN_IP:$LAN_PORT_VALUE"

echo
echo "Open Meetup 已启动（LAN 模式）"
echo "主持人访问地址: $SHARE_URL"
echo "参与者访问地址: $SHARE_URL"
echo "主持人授权口令: $HOST_PASSWORD_VALUE"
echo
echo "查看日志: npm run lan:logs"
echo "停止服务: npm run lan:down"

if command -v pbcopy >/dev/null 2>&1; then
  printf '%s' "$SHARE_URL" | pbcopy
  echo
  echo "已将访问地址复制到剪贴板，可直接发给参与者。"
fi
