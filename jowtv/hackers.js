/*
 * Cinema hacker — catálogo da lista "Movies For Hackers" (github.com/k4m4/movies-for-hackers, licença CC0).
 *
 * A lista traz título, gênero, ano, nota do IMDb e link do IMDb. Não tem vídeos: o JOWTV mostra
 * o catálogo e aponta onde assistir legalmente. Capas e sinopses em português vêm da Wikipédia,
 * encontradas pelo código do IMDb no Wikidata. Se a Wikipédia não responder, o catálogo funciona
 * do mesmo jeito, só sem capas.
 */
'use strict';

const LIST_URL = 'https://raw.githubusercontent.com/k4m4/movies-for-hackers/master/readme.md';
const WIKIDATA_SPARQL = 'https://query.wikidata.org/sparql';
const USER_AGENT = 'JOWTV/1.0 (aplicativo pessoal de TV; https://github.com/k4m4/movies-for-hackers)';

const SECTIONS = [
  { id: 'thriller', match: /thriller|drama/i, name: 'Suspense e drama' },
  { id: 'scifi', match: /science fiction|fantasy/i, name: 'Ficção científica e fantasia' },
  { id: 'action', match: /action/i, name: 'Ação' },
  { id: 'docs', match: /documentar/i, name: 'Documentários' },
  { id: 'tv', match: /tv shows?/i, name: 'Séries' },
];

const GENRE_PT = {
  thriller: 'Suspense', drama: 'Drama', crime: 'Crime', 'science fiction': 'Ficção científica',
  'sci-fi': 'Ficção científica', fantasy: 'Fantasia', action: 'Ação', documentary: 'Documentário',
  comedy: 'Comédia', romance: 'Romance', mystery: 'Mistério', biography: 'Biografia', history: 'História',
  horror: 'Terror', animation: 'Animação', adventure: 'Aventura', 'caper story': 'Golpe', family: 'Família',
  war: 'Guerra', music: 'Música', short: 'Curta', western: 'Faroeste', 'film noir': 'Noir', anime: 'Anime',
  cyberpunk: 'Cyberpunk', technology: 'Tecnologia', politics: 'Política', sport: 'Esporte', musical: 'Musical',
  'reality-tv': 'Reality', 'talk-show': 'Talk show', 'game-show': 'Game show', news: 'Notícias',
  'short film': 'Curta', 'indie film': 'Independente', 'tv film': 'Filme para TV', series: 'Série', slasher: 'Slasher',
};

function translateGenres(raw) {
  return String(raw || '')
    .split(/[\/,]/)
    .map((g) => g.trim())
    .filter(Boolean)
    .map((g) => GENRE_PT[g.toLowerCase()] || g);
}

/** Lê o readme da lista e devolve as seções com seus títulos. */
function parseList(markdown) {
  const sections = new Map();
  let current = null;
  for (const line of markdown.split(/\r?\n/)) {
    const h = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (h) {
      const sec = SECTIONS.find((s) => s.match.test(h[1]));
      current = sec || null;
      if (sec && !sections.has(sec.id)) sections.set(sec.id, { id: sec.id, name: sec.name, items: [] });
      continue;
    }
    if (!current) continue;
    // | [Título](https://www.imdb.com/title/tt0123456/) | Gênero | 2001 | 7.5/10 |
    const m = line.match(/^\|\s*\[([^\]]+)\]\(([^)]+)\)\s*\|\s*([^|]*)\|\s*([^|]*)\|\s*([^|]*)\|/);
    if (!m) continue;
    const imdbId = (m[2].match(/tt\d{5,10}/) || [])[0];
    const year = parseInt(m[4], 10) || null;
    const rating = parseFloat(m[5]) || null;
    sections.get(current.id).items.push({
      id: imdbId || `mfh-${sections.get(current.id).items.length}-${m[1]}`,
      t: m[1].trim(),
      g: translateGenres(m[3]),
      y: year,
      r: rating,
      imdb: imdbId ? `https://www.imdb.com/title/${imdbId}/` : m[2].trim(),
      tv: current.id === 'tv',
    });
  }
  return SECTIONS.map((s) => sections.get(s.id)).filter((s) => s && s.items.length);
}

async function fetchJson(url, opts = {}) {
  const res = await fetch(url, {
    ...opts,
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json', ...(opts.headers || {}) },
    signal: AbortSignal.timeout(opts.timeout || 15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} em ${url}`);
  return res.json();
}

/** Código IMDb -> { pt, en } (títulos dos artigos na Wikipédia), via Wikidata. */
async function wikiTitlesByImdb(ids) {
  const values = ids.map((id) => `"${id}"`).join(' ');
  const query = `SELECT ?imdb ?pt ?en WHERE {
    VALUES ?imdb { ${values} }
    ?item wdt:P345 ?imdb .
    OPTIONAL { ?pt schema:about ?item ; schema:isPartOf <https://pt.wikipedia.org/> . }
    OPTIONAL { ?en schema:about ?item ; schema:isPartOf <https://en.wikipedia.org/> . }
  }`;
  const data = await fetchJson(`${WIKIDATA_SPARQL}?format=json&query=${encodeURIComponent(query)}`, {
    headers: { Accept: 'application/sparql-results+json' },
    timeout: 25000,
  });
  const title = (url) => (url ? decodeURIComponent(url.split('/wiki/')[1] || '') : '');
  const out = new Map();
  for (const b of data.results.bindings) {
    const id = b.imdb.value;
    const prev = out.get(id) || {};
    out.set(id, { pt: prev.pt || title(b.pt && b.pt.value), en: prev.en || title(b.en && b.en.value) });
  }
  return out;
}

async function wikiSummary(lang, title) {
  if (!title) return null;
  try {
    const d = await fetchJson(`https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title)}`);
    if (d.type === 'disambiguation') return null;
    return d;
  } catch {
    return null;
  }
}

// Miniatura um pouco maior que a padrão da Wikipédia (que vem com ~320px)
function biggerThumb(url) {
  return url ? url.replace(/\/(\d+)px-([^/]+)$/, (m, w, rest) => (Number(w) < 500 ? `/500px-${rest}` : m)) : url;
}

async function mapLimit(items, limit, fn) {
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await fn(items[idx], idx);
    }
  });
  await Promise.all(workers);
}

/** Acrescenta capa (p), sinopse (s) e link da Wikipédia (w) a cada título. Nunca lança erro. */
async function enrich(sections, log = () => {}) {
  const all = sections.flatMap((s) => s.items).filter((it) => /^tt\d+$/.test(it.id));
  if (!all.length) return { ok: true, found: 0 };
  let titles;
  try {
    titles = await wikiTitlesByImdb([...new Set(all.map((it) => it.id))]);
  } catch (err) {
    log(`Cinema hacker: Wikidata indisponível (${err.message}); catálogo sem capas por enquanto.`);
    return { ok: false, found: 0 };
  }
  let found = 0;
  const cache = new Map();
  await mapLimit([...titles.entries()], 4, async ([id, t]) => {
    const pt = await wikiSummary('pt', t.pt);
    const en = !pt || !pt.thumbnail ? await wikiSummary('en', t.en) : null;
    cache.set(id, { pt, en });
  });
  for (const it of all) {
    const c = cache.get(it.id);
    if (!c) continue;
    const thumb = (c.pt && c.pt.thumbnail) || (c.en && c.en.thumbnail);
    if (thumb) { it.p = biggerThumb(thumb.source); found++; }
    if (c.pt && c.pt.extract) { it.s = c.pt.extract; it.sl = 'pt'; } else if (c.en && c.en.extract) { it.s = c.en.extract; it.sl = 'en'; }
    const page = (c.pt && c.pt.content_urls) || (c.en && c.en.content_urls);
    if (page && page.desktop) it.w = page.desktop.page;
  }
  log(`Cinema hacker: ${found} capas encontradas na Wikipédia.`);
  return { ok: true, found };
}

async function buildHackers(log = () => {}) {
  const res = await fetch(LIST_URL, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`HTTP ${res.status} ao baixar a lista`);
  const sections = parseList(await res.text());
  const count = sections.reduce((n, s) => n + s.items.length, 0);
  if (!count) throw new Error('lista vazia ou em formato desconhecido');
  const result = await enrich(sections, log);
  return {
    updatedAt: Date.now(),
    enriched: result.ok,
    source: 'https://github.com/k4m4/movies-for-hackers',
    license: 'CC0 1.0',
    sections,
  };
}

module.exports = { buildHackers, parseList, enrich, translateGenres };
