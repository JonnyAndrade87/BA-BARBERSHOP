# JOWTV

Aplicação com interface para assistir aos mais de 10 mil canais abertos de TV ao vivo do projeto
[iptv-org](https://github.com/iptv-org/iptv): filmes, séries, esportes, notícias, infantil, música e mais.

Roda no seu computador e pode ser aberta **no próprio PC, no celular, no tablet ou na Smart TV**
(qualquer aparelho na mesma rede Wi-Fi).

## Como instalar e rodar

1. Instale o **Node.js** (versão LTS) em <https://nodejs.org>.
2. Extraia esta pasta em qualquer lugar do computador.
3. Inicie:
   - **Windows:** dê dois cliques em `iniciar.bat`.
   - **Mac:** dê dois cliques em `iniciar.command`. Na primeira vez, se o macOS bloquear, clique com o botão
     direito no arquivo → **Abrir** → **Abrir** (ou em Ajustes do Sistema → Privacidade e Segurança → **Abrir Mesmo Assim**).
   - **Linux:** no terminal, rode `./iniciar.sh` (ou `node server.js`).
4. O navegador abre em <http://localhost:8080>. Na primeira vez, o catálogo leva alguns segundos para baixar.

Não precisa instalar nenhuma dependência (sem `npm install`).

## Abrir no celular / TV

1. Deixe o JOWTV rodando no PC (a janela preta precisa ficar aberta).
2. No PC, abra o JOWTV e clique no **ícone do celular 📱** no topo. A página inicial também mostra um
   **QR code**.
3. Com o celular no **mesmo Wi-Fi** do PC, aponte a câmera para o QR code e toque no link.
   (Ou digite o endereço que aparece embaixo do QR code, por exemplo `http://192.168.X.X:8080`.)
4. No celular, use **"Adicionar à tela inicial"** para o JOWTV virar um ícone de app.

### Não abriu no celular?

- **Windows:** dê dois cliques em `liberar-firewall.bat` e aceite o pedido de administrador. Ele libera a
  porta 8080 no Firewall do Windows (redes privadas e públicas). Depois feche e abra o `iniciar.bat` de novo.
- Confirme que o celular está no Wi-Fi (não nos dados móveis) e na mesma rede do PC, sem "rede de convidados".
- Desligue VPNs no PC e no celular.
- Se aparecer mais de um endereço, teste os outros listados na janela do QR code.

## Recursos

- Visual inspirado no tvOS: vidro fosco, carrossel de destaques em tela cheia e prateleiras de cards com efeito
  de foco (o card cresce, inclina e brilha). Tema **claro** (fundo `#f5f5f7`, padrão), **escuro** ou **automático**
- **Imagem ao vivo nas miniaturas:** o JOWTV captura um quadro do que está passando em cada canal visível na tela
  e mostra no card. As capturas ficam guardadas no servidor por 15 minutos e são compartilhadas entre os aparelhos
- **Vídeo ao vivo no destaque** (sem som), como os trailers do Apple TV
- As prévias usam internet extra; dá para desligar em Ajustes → Prévias ao vivo
- Prateleiras: Continuar assistindo, Minha lista, Brasil, Portugal, Filmes, Séries, Esportes, Notícias, Infantil…
- Todas as categorias, filtro por país (180+ países) e busca com sugestões
- Player em tela cheia com controles próprios que se escondem sozinhos: canal anterior/próximo, pausar,
  volume, Picture-in-Picture, tela cheia, Minha lista e lista de fontes do sinal
- Troca automática de fonte quando uma falha
- No celular: barra de abas embaixo, como em um app de iPhone
- **Controle remoto / teclado:** setas navegam entre os itens, Enter abre, Esc volta.
  No player: ← → trocam de canal, espaço pausa, `M` tira o som, `F` tela cheia, `I` fontes do sinal
- Botão para copiar o link do canal e abrir no VLC
- QR code para abrir no celular / TV com um toque
- Ajustes: só HD, conteúdo adulto (desligado por padrão), streams não catalogados, proxy

## Como funciona

- `server.js` baixa o catálogo público em `https://iptv-org.github.io/api/` (canais, streams, logos,
  categorias e países), monta uma lista compacta e guarda em `.cache/` (atualiza a cada 6 horas).
- O servidor também funciona como **proxy dos streams** (`/proxy?url=...`). Isso faz muito mais canais
  funcionarem no navegador, porque resolve bloqueios de CORS e envia os cabeçalhos User-Agent / Referer
  que alguns canais exigem.
- A interface (`public/`) usa [hls.js](https://github.com/video-dev/hls.js) para tocar os streams HLS e
  [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) para o QR code. As duas bibliotecas
  vêm junto na pasta `public/vendor/`, sem depender de CDN.

## Observações

- O iptv-org lista apenas **canais ao vivo** que já são abertos na internet. Não há filmes sob demanda:
  a seção "Filmes" mostra canais que passam filmes 24h.
- É normal parte dos canais estar fora do ar ou bloqueada no seu país (bloqueio regional).
- Mudar a porta: `PORT=3000 node server.js` (Windows: `set PORT=3000 && node server.js`).
- Usar só neste computador (sem acesso pela rede): `HOST=127.0.0.1 node server.js`.
