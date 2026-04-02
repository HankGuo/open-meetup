#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="$ROOT_DIR/docker-compose.lan.yml"

if ! command -v docker >/dev/null 2>&1; then
  echo "Error: 未找到 docker，请先安装 Docker Desktop 或 Docker Engine"
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Error: Docker daemon 未启动，请先启动 Docker Desktop（或 Docker 服务）"
  exit 1
fi

(
  cd "$ROOT_DIR" || exit 1
  docker compose -f "$COMPOSE_FILE" logs -f --tail=200
)
