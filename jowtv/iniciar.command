#!/bin/bash
# JOWTV para Mac: dê dois cliques neste arquivo no Finder.
cd "$(dirname "$0")" || exit 1
export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"   # Node instalado pelo site ou pelo Homebrew

if ! command -v node >/dev/null 2>&1; then
  echo ""
  echo "  Node.js não encontrado."
  echo "  Instale a versão LTS em https://nodejs.org e abra este arquivo de novo."
  echo ""
  open "https://nodejs.org/pt-br/download"
  read -r -p "  Pressione Enter para fechar..."
  exit 1
fi

( sleep 2; open "http://localhost:8080" ) >/dev/null 2>&1 &
node server.js
