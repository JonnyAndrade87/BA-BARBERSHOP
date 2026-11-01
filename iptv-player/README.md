# IPTV Player

Aplicação com interface para assistir aos mais de 10 mil canais abertos de TV ao vivo do projeto
[iptv-org](https://github.com/iptv-org/iptv): filmes, séries, esportes, notícias, infantil, música e mais.

Roda no seu computador e pode ser aberta **no próprio PC, no celular, no tablet ou na Smart TV**
(qualquer aparelho na mesma rede Wi-Fi).

## Como instalar e rodar

1. Instale o **Node.js** (versão LTS) em <https://nodejs.org>.
2. Extraia esta pasta em qualquer lugar do computador.
3. Inicie:
   - **Windows:** dê dois cliques em `iniciar.bat`.
   - **Mac / Linux:** no terminal, rode `./iniciar.sh` (ou `node server.js`).
4. O navegador abre em <http://localhost:8080>. Na primeira vez, o catálogo leva alguns segundos para baixar.

Não precisa instalar nenhuma dependência (sem `npm install`).

## Abrir no celular / TV

Com o servidor rodando, a janela do terminal mostra um endereço assim:

```
Celular / TV (Wi-Fi): http://192.168.0.15:8080
```

Digite esse endereço no navegador do celular ou da TV (precisa estar no mesmo Wi-Fi).
No celular, use **"Adicionar à tela inicial"** para ele virar um ícone de app.

> Se não abrir, libere o Node.js no firewall do Windows quando ele perguntar (rede privada).

## Recursos

- Página inicial com fileiras: Brasil, Portugal, Filmes, Séries, Esportes, Notícias, Infantil, Animação, Música…
- Todas as 29 categorias e filtro por país (180+ países)
- Busca por nome do canal
- Favoritos e "assistidos recentemente" (salvos no navegador)
- Player com várias fontes por canal e troca automática quando uma fonte falha
- Setas ← → (ou Channel Up/Down do controle) para trocar de canal; `F` para tela cheia; `Esc` para fechar
- Botão "Copiar link" para abrir o canal no VLC
- Configurações: só HD, conteúdo adulto (desligado por padrão), streams não catalogados, proxy

## Como funciona

- `server.js` baixa o catálogo público em `https://iptv-org.github.io/api/` (canais, streams, logos,
  categorias e países), monta uma lista compacta e guarda em `.cache/` (atualiza a cada 6 horas).
- O servidor também funciona como **proxy dos streams** (`/proxy?url=...`). Isso faz muito mais canais
  funcionarem no navegador, porque resolve bloqueios de CORS e envia os cabeçalhos User-Agent / Referer
  que alguns canais exigem.
- A interface (`public/`) usa [hls.js](https://github.com/video-dev/hls.js) para tocar os streams HLS.

## Observações

- O iptv-org lista apenas **canais ao vivo** que já são abertos na internet. Não há filmes sob demanda:
  a seção "Filmes" mostra canais que passam filmes 24h.
- É normal parte dos canais estar fora do ar ou bloqueada no seu país (bloqueio regional).
- Mudar a porta: `PORT=3000 node server.js` (Windows: `set PORT=3000 && node server.js`).
- Usar só neste computador (sem acesso pela rede): `HOST=127.0.0.1 node server.js`.
