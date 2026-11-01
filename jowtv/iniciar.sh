#!/usr/bin/env sh
cd "$(dirname "$0")"
if ! command -v node >/dev/null 2>&1; then
  echo "Node.js nao encontrado. Instale em https://nodejs.org (versao LTS) e rode de novo."
  exit 1
fi
( sleep 2; (xdg-open http://localhost:8080 || open http://localhost:8080) >/dev/null 2>&1 ) &
node server.js
