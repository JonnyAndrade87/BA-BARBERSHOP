#!/usr/bin/env node
/*
 * JOWTV — servidor local
 *
 * - Baixa o catálogo público do iptv-org (canais, streams, logos, categorias, países)
 *   e monta um JSON compacto em /api/catalog.
 * - Serve a interface (pasta public/).
 * - Faz proxy dos streams HLS (/proxy?url=...) para contornar CORS, conteúdo misto
 *   (http em página https) e streams que exigem User-Agent / Referer específicos.
 *
 * Sem dependências: requer Node.js 18 ou superior.
 *   node server.js            -> http://localhost:8080
 *   PORT=3000 node server.js  -> outra porta
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');
const { Readable } = require('stream');

const PORT = Number(process.env.PORT) || 8080;
const HOST = process.env.HOST || '0.0.0.0'; // 0.0.0.0 = acessível pelo celular/TV na mesma rede
const PUBLIC_DIR = path.join(__dirname, 'public');
const CACHE_DIR = path.join(__dirname, '.cache');
const CACHE_FILE = path.join(CACHE_DIR, 'catalog.json');
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // atualiza o catálogo a cada 6 horas

// Fontes do catálogo (a segunda é um espelho usado se a primeira falhar)
const API_SOURCES = [
  'https://iptv-org.github.io/api/',
  'https://raw.githubusercontent.com/iptv-org/api/gh-pages/',
];

const DEFAULT_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

// ---------------------------------------------------------------------------
// Catálogo
// ---------------------------------------------------------------------------

let catalog = null; // { json: Buffer, gzip: Buffer, updatedAt: number, etag: string }
let building = null;

async function fetchJson(file) {
  let lastErr;
  for (const base of API_SOURCES) {
    try {
      const res = await fetch(base + file, { signal: AbortSignal.timeout(60000) });
      if (!res.ok) throw new Error(`HTTP ${res.status} em ${base + file}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
      console.warn(`  ! falha ao baixar ${file} de ${base}: ${err.message}`);
    }
  }
  throw lastErr;
}

function pickLogo(list) {
  if (!list || !list.length) return null;
  const score = (l) =>
    (l.feed ? 0 : 4) + (l.in_use === false ? 0 : 2) + (l.url.startsWith('https') ? 1 : 0) +
    Math.min((l.width || 0) / 1000, 0.9);
  return list.slice().sort((a, b) => score(b) - score(a))[0].url;
}

const QUALITY_RANK = (q) => (q ? parseInt(q, 10) || 0 : 0);

async function buildCatalog() {
  console.log('Baixando catálogo do iptv-org...');
  const [channels, streams, logos, categories, countries, blocklist] = await Promise.all([
    fetchJson('channels.json'),
    fetchJson('streams.json'),
    fetchJson('logos.json'),
    fetchJson('categories.json'),
    fetchJson('countries.json'),
    fetchJson('blocklist.json').catch(() => []),
  ]);

  const blocked = new Set(blocklist.map((b) => b.channel));
  const logosByChannel = new Map();
  for (const l of logos) {
    if (!l.channel) continue;
    if (!logosByChannel.has(l.channel)) logosByChannel.set(l.channel, []);
    logosByChannel.get(l.channel).push(l);
  }

  const streamsByChannel = new Map();
  const orphan = [];
  for (const s of streams) {
    const item = { u: s.url };
    if (s.quality) item.q = s.quality;
    if (s.labels && s.labels.length) item.l = s.labels;
    if (s.user_agent) item.ua = s.user_agent;
    if (s.referrer) item.r = s.referrer;
    if (s.title) item.t = s.title;
    if (!s.channel) {
      orphan.push(item);
      continue;
    }
    if (!streamsByChannel.has(s.channel)) streamsByChannel.set(s.channel, []);
    streamsByChannel.get(s.channel).push(item);
  }

  const out = [];
  for (const ch of channels) {
    const st = streamsByChannel.get(ch.id);
    if (!st || blocked.has(ch.id) || ch.closed) continue;
    st.sort((a, b) => QUALITY_RANK(b.q) - QUALITY_RANK(a.q));
    const c = {
      id: ch.id,
      n: ch.name,
      c: ch.country || '',
      k: ch.categories && ch.categories.length ? ch.categories : ['general'],
      s: st.map(({ t, ...rest }) => rest),
    };
    const logo = pickLogo(logosByChannel.get(ch.id));
    if (logo) c.g = logo;
    if (ch.is_nsfw) c.x = 1;
    if (ch.network) c.w = ch.network;
    out.push(c);
  }

  // Streams que ainda não foram associados a um canal do banco de dados
  let i = 0;
  for (const s of orphan) {
    const name = (s.t || 'Canal sem nome').replace(/\s*\((\d+p|Geo-blocked|Not 24\/7)\)/gi, '').trim();
    const { t, ...rest } = s;
    out.push({ id: `extra-${i++}`, n: name, c: '', k: ['general'], s: [rest], e: 1 });
  }

  out.sort((a, b) => a.n.localeCompare(b.n, 'pt-BR', { sensitivity: 'base' }));

  const data = {
    updatedAt: Date.now(),
    categories: categories.map((c) => ({ id: c.id, name: c.name })),
    countries: countries.map((c) => ({ code: c.code, name: c.name, flag: c.flag })),
    channels: out,
  };
  console.log(`Catálogo pronto: ${out.length} canais, ${streams.length} streams.`);
  return data;
}

function setCatalog(data) {
  const json = Buffer.from(JSON.stringify(data));
  catalog = {
    json,
    gzip: zlib.gzipSync(json, { level: 6 }),
    updatedAt: data.updatedAt,
    etag: `"${data.updatedAt}"`,
  };
}

async function refreshCatalog() {
  if (building) return building;
  building = (async () => {
    try {
      const data = await buildCatalog();
      setCatalog(data);
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(CACHE_FILE, catalog.json);
    } catch (err) {
      console.error('Erro ao atualizar o catálogo:', err.message);
      if (!catalog) throw err;
    } finally {
      building = null;
    }
  })();
  return building;
}

function loadCachedCatalog() {
  try {
    const data = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
    setCatalog(data);
    console.log(`Catálogo carregado do cache (${new Date(data.updatedAt).toLocaleString('pt-BR')}).`);
  } catch {
    /* sem cache */
  }
}

async function getCatalog() {
  if (!catalog) await refreshCatalog();
  else if (Date.now() - catalog.updatedAt > CACHE_TTL_MS) refreshCatalog().catch(() => {});
  return catalog;
}

// ---------------------------------------------------------------------------
// Proxy de streams
// ---------------------------------------------------------------------------

function proxyUrl(target, ua, ref) {
  let u = '/proxy?url=' + encodeURIComponent(target);
  if (ua) u += '&ua=' + encodeURIComponent(ua);
  if (ref) u += '&ref=' + encodeURIComponent(ref);
  return u;
}

function rewritePlaylist(text, baseUrl, ua, ref) {
  const abs = (u) => {
    try {
      return new URL(u, baseUrl).href;
    } catch {
      return u;
    }
  };
  return text
    .split(/\r?\n/)
    .map((line) => {
      const t = line.trim();
      if (!t) return line;
      if (t.startsWith('#')) {
        // URIs dentro de tags (#EXT-X-KEY, #EXT-X-MEDIA, #EXT-X-MAP, #EXT-X-I-FRAME-STREAM-INF...)
        return line.replace(/URI="([^"]+)"/g, (_, u) => `URI="${proxyUrl(abs(u), ua, ref)}"`);
      }
      return proxyUrl(abs(t), ua, ref);
    })
    .join('\n');
}

const PASS_HEADERS = ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified'];

async function handleProxy(req, res, query) {
  const target = query.get('url');
  let parsed;
  try {
    parsed = new URL(target);
    if (!/^https?:$/.test(parsed.protocol)) throw new Error('protocolo');
  } catch {
    return sendText(res, 400, 'URL inválida');
  }
  const ua = query.get('ua') || '';
  const ref = query.get('ref') || '';

  const headers = { 'User-Agent': ua || DEFAULT_UA, Accept: '*/*' };
  if (ref) {
    headers.Referer = ref;
    try {
      headers.Origin = new URL(ref).origin;
    } catch {}
  }
  if (req.headers.range) headers.Range = req.headers.range;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20000);
  res.on('close', () => controller.abort());

  let upstream;
  try {
    upstream = await fetch(parsed.href, { headers, redirect: 'follow', signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (!res.headersSent) sendText(res, 502, 'Falha ao conectar no stream: ' + err.message);
    return;
  }
  clearTimeout(timer);

  const ctype = (upstream.headers.get('content-type') || '').toLowerCase();
  const finalUrl = upstream.url || parsed.href;
  const looksPlaylist =
    ctype.includes('mpegurl') || /\.m3u8?(\?|$)/i.test(new URL(finalUrl).pathname + new URL(finalUrl).search);

  const baseHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'no-cache',
  };

  try {
    if (looksPlaylist && upstream.ok) {
      const text = await upstream.text();
      if (text.trimStart().startsWith('#EXTM3U')) {
        const body = rewritePlaylist(text, finalUrl, ua, ref);
        res.writeHead(200, { ...baseHeaders, 'Content-Type': 'application/vnd.apple.mpegurl' });
        return res.end(body);
      }
      res.writeHead(upstream.status, { ...baseHeaders, 'Content-Type': ctype || 'text/plain' });
      return res.end(text);
    }

    const outHeaders = { ...baseHeaders };
    for (const h of PASS_HEADERS) {
      const v = upstream.headers.get(h);
      if (v) outHeaders[h] = v;
    }
    // fetch() já descompacta gzip; o tamanho original não vale mais
    if (upstream.headers.get('content-encoding')) delete outHeaders['content-length'];
    res.writeHead(upstream.status, outHeaders);
    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body)
      .on('error', () => res.destroy())
      .pipe(res);
  } catch (err) {
    if (!res.headersSent) sendText(res, 502, 'Erro no proxy: ' + err.message);
    else res.destroy();
  }
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.webmanifest': 'application/manifest+json',
};

function sendText(res, status, text) {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' });
  res.end(text);
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR)) return sendText(res, 403, 'Proibido');
  fs.readFile(file, (err, buf) => {
    if (err) return sendText(res, 404, 'Não encontrado');
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(buf);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/proxy') return await handleProxy(req, res, url.searchParams);

    if (url.pathname === '/api/catalog') {
      const cat = await getCatalog();
      if (req.headers['if-none-match'] === cat.etag) {
        res.writeHead(304);
        return res.end();
      }
      const gz = /\bgzip\b/.test(req.headers['accept-encoding'] || '');
      res.writeHead(200, {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'no-cache',
        ETag: cat.etag,
        ...(gz ? { 'Content-Encoding': 'gzip' } : {}),
      });
      return res.end(gz ? cat.gzip : cat.json);
    }

    if (url.pathname === '/api/info') {
      const addresses = lanAddresses().map((a) => ({ ...a, url: `http://${a.address}:${PORT}` }));
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-cache' });
      return res.end(JSON.stringify({ name: 'JOWTV', port: PORT, lanEnabled: HOST !== '127.0.0.1' && HOST !== 'localhost', addresses }));
    }

    if (url.pathname === '/api/refresh' && req.method === 'POST') {
      await refreshCatalog();
      return sendText(res, 200, 'ok');
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') return sendText(res, 405, 'Método não permitido');
    serveStatic(req, res, url.pathname);
  } catch (err) {
    console.error(err);
    if (!res.headersSent) sendText(res, 500, 'Erro: ' + err.message);
  }
});

// Placas de rede virtuais (VPN, WSL, VirtualBox, Docker...) não servem para o celular
const VIRTUAL_IFACE = /vethernet|virtual|vmware|vbox|docker|wsl|hyper-v|tailscale|zerotier|hamachi|loopback|br-|veth|utun|tun|tap/i;

function lanAddresses() {
  const out = [];
  for (const [iface, list] of Object.entries(os.networkInterfaces())) {
    for (const i of list || []) {
      if (i.family !== 'IPv4' && i.family !== 4) continue;
      if (i.internal || i.address.startsWith('169.254.')) continue;
      let score = 0;
      if (i.address.startsWith('192.168.')) score += 3;
      else if (i.address.startsWith('10.')) score += 2;
      else if (/^172\.(1[6-9]|2\d|3[01])\./.test(i.address)) score += 1;
      if (VIRTUAL_IFACE.test(iface)) score -= 5;
      if (/wi-?fi|wlan|wireless|ethernet|^en\d|^eth\d/i.test(iface)) score += 1;
      out.push({ address: i.address, iface, score });
    }
  }
  return out.sort((a, b) => b.score - a.score).map(({ address, iface, score }) => ({ address, iface, likely: score > 0 }));
}

loadCachedCatalog();
server.listen(PORT, HOST, () => {
  const lan = HOST === '127.0.0.1' || HOST === 'localhost' ? [] : lanAddresses();
  console.log('\n  JOWTV rodando!\n');
  console.log(`  Neste computador:      http://localhost:${PORT}`);
  if (lan.length) {
    console.log(`  Celular / TV (Wi-Fi):  http://${lan[0].address}:${PORT}   <- use este`);
    for (const a of lan.slice(1)) console.log(`  Outros endereços:      http://${a.address}:${PORT}  (${a.iface})`);
    console.log('\n  Dica: abra o JOWTV no PC e clique no ícone do celular para ver o QR code.');
  }
  console.log('\n  Não feche esta janela enquanto estiver assistindo. Para parar: Ctrl+C\n');
  if (!catalog || Date.now() - catalog.updatedAt > CACHE_TTL_MS) refreshCatalog().catch(() => {});
});
