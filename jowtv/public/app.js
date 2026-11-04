/* JOWTV — interface (visual inspirado no tvOS) */
'use strict';

// ---------------------------------------------------------------------------
// Constantes e estado
// ---------------------------------------------------------------------------

const CATEGORY_PT = {
  auto: 'Automóveis', animation: 'Animação', business: 'Negócios', classic: 'Clássicos',
  comedy: 'Comédia', cooking: 'Culinária', culture: 'Cultura', documentary: 'Documentários',
  education: 'Educação', entertainment: 'Entretenimento', family: 'Família', general: 'Variedades',
  interactive: 'Interativos', kids: 'Infantil', legislative: 'Legislativo', lifestyle: 'Estilo de vida',
  movies: 'Filmes', music: 'Música', news: 'Notícias', outdoor: 'Natureza e aventura',
  public: 'TV pública', relax: 'Relaxar', religious: 'Religiosos', series: 'Séries',
  science: 'Ciência', shop: 'Compras', sports: 'Esportes', travel: 'Viagem', weather: 'Clima',
  xxx: 'Adulto',
};
const CATEGORY_ICON = {
  movies: '🎬', series: '📺', sports: '⚽', news: '📰', kids: '🧸', animation: '🎨', music: '🎵',
  documentary: '🌍', comedy: '😂', entertainment: '🎭', classic: '🎞️', culture: '🏛️',
  education: '📚', religious: '🙏', general: '📡', lifestyle: '✨', cooking: '🍳', travel: '✈️',
  outdoor: '🏕️', science: '🔬', business: '💼', family: '👨‍👩‍👧', auto: '🚗', weather: '⛅',
  legislative: '⚖️', public: '🏢', shop: '🛍️', relax: '🧘', interactive: '🕹️', xxx: '🔞',
};
const CATEGORY_HUE = {
  movies: 350, series: 265, sports: 135, news: 210, kids: 40, animation: 300, music: 320,
  documentary: 170, comedy: 50, entertainment: 15, classic: 30, culture: 190, education: 225,
  religious: 260, general: 200, lifestyle: 330, cooking: 25, travel: 195, outdoor: 110,
  science: 240, business: 215, family: 60, auto: 0, weather: 205, legislative: 230, public: 220,
  shop: 345, relax: 180, interactive: 280, xxx: 355,
};
// Abas da barra superior
const NAV_TABS = [['inicio', 'Início'], ['todos', 'Ao vivo'], ['cat-movies', 'Filmes'], ['cat-series', 'Séries'],
  ['cat-sports', 'Esportes'], ['cat-kids', 'Infantil'], ['categorias', 'Categorias'],
  ['hackers', 'Cinema hacker'], ['favoritos', 'Minha lista']];
// Prateleiras da página inicial
const HOME_ROWS = ['movies', 'series', 'sports', 'news', 'kids', 'animation', 'music', 'documentary',
  'comedy', 'entertainment', 'classic', 'culture'];
const SEARCH_SUGGESTIONS = ['Globo', 'Record', 'SBT', 'Band', 'CNN', 'ESPN', 'Cultura', 'Jovem Pan',
  'Disney', 'Cartoon', 'Pluto', 'Rede Vida', 'RTP', 'SIC', 'Fox', 'MTV', 'Discovery', 'Euronews'];

const PAGE_SIZE = 48;
const ROW_SIZE = 24;
const HERO_INTERVAL = 8000;
const regionNames = (() => { try { return new Intl.DisplayNames(['pt-BR'], { type: 'region' }); } catch { return null; } })();

const store = {
  get(key, def) {
    try { const v = localStorage.getItem('iptv:' + key); return v == null ? def : JSON.parse(v); } catch { return def; }
  },
  set(key, val) { try { localStorage.setItem('iptv:' + key, JSON.stringify(val)); } catch { /* sem storage */ } },
};

const state = {
  channels: [],
  byId: new Map(),
  countries: new Map(), // code -> {name, flag}
  categories: [],
  updatedAt: 0,
  settings: Object.assign({ proxy: true, hd: false, extra: false, nsfw: false, theme: 'light', livePreviews: true, heroVideo: true }, store.get('settings', {})),
  favs: new Set(store.get('favs', [])),
  recent: store.get('recent', []),
  country: store.get('country', ''),
  query: '',
  sort: 'az',
  grid: { list: [], pos: 0 },
  playlist: [], // ids para navegar entre canais no player
  info: null, // endereços de rede do servidor (para abrir no celular)
  hero: { ids: [], idx: 0, timer: null },
  hackers: null, // catálogo "Cinema hacker" (lista movies-for-hackers)
  movies: new Map(), // id -> título do catálogo
  lastFocusId: null,
};

const IS_LOCAL_PC = ['localhost', '127.0.0.1', '::1', '[::1]'].includes(location.hostname);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const main = $('#main');
const playerEl = $('#player');
const video = $('#video');

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (n) => n.toLocaleString('pt-BR');
const catName = (id) => CATEGORY_PT[id] || (state.categories.find((c) => c.id === id) || {}).name || id;
const qualityNum = (q) => (q ? parseInt(q, 10) || 0 : 0);
const bestQuality = (ch) => ch.s.reduce((m, s) => Math.max(m, qualityNum(s.q)), 0);
const qualityTag = (q) => (q >= 2160 ? '4K' : q >= 1080 ? 'FHD' : q >= 720 ? 'HD' : '');

const ICON = {
  chevron: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
  chevronL: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
  play: '<svg viewBox="0 0 24 24" aria-hidden="true"><path class="fill" d="M7 4.5v15l12.5-7.5z"/></svg>',
  add: '<svg viewBox="0 0 24 24" class="ic-add" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>',
  check: '<svg viewBox="0 0 24 24" class="ic-check" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  heart: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20.5s-8-4.6-8-10.4A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 8 2.5c0 5.8-8 10.4-8 10.4z"/></svg>',
  search: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5"/><path d="M20 20l-4.6-4.6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  tv: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="2.5" y="5.5" width="19" height="13" rx="2.5"/><path d="M8 21.5h8"/></svg>',
  checkSmall: '<svg viewBox="0 0 24 24" class="check" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

function countryName(code) {
  const c = state.countries.get(code);
  return c ? c.name : code || '';
}
function countryLabel(code) {
  const c = state.countries.get(code);
  if (!c) return code || '';
  return `${c.flag || ''} ${c.name}`.trim();
}

function hueFor(text) {
  let h = 0;
  for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
  return h;
}
function initials(name) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, ' ').split(/\s+/).filter(Boolean);
  return ((words[0] || '?')[0] + (words[1] ? words[1][0] : (words[0] || '')[1] || '')).toUpperCase();
}
function initialsHtml(ch) {
  return `<span class="initials" style="color:hsl(${hueFor(ch.n)} 85% 76%)">${esc(initials(ch.n))}</span>`;
}
function logoHtml(ch, lazy = true) {
  if (!ch.g) return initialsHtml(ch);
  return `<img src="${esc(ch.g)}" alt="" ${lazy ? 'loading="lazy"' : ''} decoding="async" referrerpolicy="no-referrer" data-ini="${esc(initials(ch.n))}" data-hue="${hueFor(ch.n)}">`;
}
// Logo quebrado -> iniciais; fundo desfocado quebrado -> some
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  if (img.classList.contains('art-blur') || img.classList.contains('hero-blur')) return img.remove();
  if (!img.dataset.ini) return;
  const span = document.createElement('span');
  span.className = 'initials';
  span.style.color = `hsl(${img.dataset.hue} 85% 76%)`;
  span.textContent = img.dataset.ini;
  img.replaceWith(span);
}, true);

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

function saveSettings() { store.set('settings', state.settings); }

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { /* */ }
    ta.remove();
    return ok;
  }
}

// ---------------------------------------------------------------------------
// Filtros
// ---------------------------------------------------------------------------

function visible(ch, ignoreCountry = false) {
  const st = state.settings;
  if (ch.x && !st.nsfw) return false;
  if (!st.nsfw && ch.k.includes('xxx')) return false;
  if (ch.e && !st.extra) return false;
  if (st.hd && bestQuality(ch) < 720) return false;
  if (!ignoreCountry && state.country && ch.c !== state.country) return false;
  return true;
}
const visibleList = () => state.channels.filter((c) => visible(c));
const idsToChannels = (ids) => ids.map((id) => state.byId.get(id)).filter((c) => c && visible(c));

function rank(a, b) {
  // canais com logo e melhor qualidade primeiro
  return (b.g ? 1 : 0) - (a.g ? 1 : 0) || bestQuality(b) - bestQuality(a) || a.n.localeCompare(b.n, 'pt-BR');
}

function sortList(list) {
  const l = list.slice();
  if (state.sort === 'az') l.sort((a, b) => a.n.localeCompare(b.n, 'pt-BR', { sensitivity: 'base' }));
  else if (state.sort === 'quality') l.sort((a, b) => bestQuality(b) - bestQuality(a) || a.n.localeCompare(b.n, 'pt-BR'));
  else if (state.sort === 'country') l.sort((a, b) => countryName(a.c).localeCompare(countryName(b.c), 'pt-BR') || a.n.localeCompare(b.n, 'pt-BR'));
  return l;
}

// ---------------------------------------------------------------------------
// Componentes
// ---------------------------------------------------------------------------

function cardHtml(ch, opts = {}) {
  const q = qualityTag(bestQuality(ch));
  const meta = [ch.c ? countryName(ch.c) : '', catName(ch.k[0])].filter(Boolean).join(' · ');
  const live = state.settings.livePreviews ? thumbFresh(ch.id) : null;
  return `<button class="card" data-id="${esc(ch.id)}" aria-label="${esc(ch.n)}">
    <div class="art ${live ? 'has-live' : ''}" style="--h:${hueFor(ch.n)}">
      ${ch.g ? `<img class="art-blur" src="${esc(ch.g)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" aria-hidden="true">` : ''}
      ${live ? `<img class="art-live" src="${live.url}" alt="" decoding="async">` : ''}
      <div class="art-logo">${logoHtml(ch)}</div>
      <span class="live-chip">AO VIVO</span>
      ${q ? `<span class="q">${q}</span>` : ''}
      ${state.favs.has(ch.id) ? `<span class="heart">${ICON.heart}</span>` : ''}
      ${opts.live ? '<span class="live-bar"></span>' : ''}
      <span class="shine"></span>
    </div>
    <div class="cap"><div class="name">${esc(ch.n)}</div><div class="meta">${esc(meta)}</div></div>
  </button>`;
}

function shelfHtml(title, list, link, opts = {}) {
  if (!list.length) return '';
  const head = link
    ? `<a href="#${link}">${esc(title)}${ICON.chevron}</a>`
    : `<h2>${esc(title)}</h2>`;
  return `<section class="shelf">
    <div class="shelf-head">${link ? `<h2 class="sr">${head}</h2>` : head}${opts.count ? `<span class="count">${fmt(opts.count)} canais</span>` : ''}</div>
    <button class="shelf-nav prev" data-scroll="-1" tabindex="-1" aria-label="Anterior">${ICON.chevronL}</button>
    <div class="shelf-scroll" data-list="${esc(list.map((c) => c.id).join('|'))}">${list.map((c) => cardHtml(c, opts)).join('')}</div>
    <button class="shelf-nav next" data-scroll="1" tabindex="-1" aria-label="Próximo">${ICON.chevron}</button>
  </section>`;
}

function tileHtml(k, count) {
  return `<a class="tile" href="#cat-${esc(k)}" style="--h:${CATEGORY_HUE[k] ?? 210}">
    <span class="tile-emoji" aria-hidden="true">${CATEGORY_ICON[k] || '📡'}</span>
    <span class="tile-name">${esc(catName(k))}</span>
    <span class="tile-count">${fmt(count)} canais</span>
  </a>`;
}

function categoryCounts(list) {
  const counts = {};
  for (const c of list) for (const k of c.k) counts[k] = (counts[k] || 0) + 1;
  return counts;
}

function emptyHtml(title, msg) {
  return `<div class="empty">${ICON.tv}<b>${esc(title || 'Nenhum canal encontrado')}</b>${msg || 'Tente outro país, outra busca ou ajuste os filtros em Ajustes.'}</div>`;
}

function renderTabs(active) {
  $('#tabs').innerHTML = NAV_TABS
    .map(([h, label]) => `<a href="#${h}" class="${h === active ? 'active' : ''}">${esc(label)}</a>`)
    .join('');
  const tabKey = active.startsWith('cat-') || active.startsWith('pais-') || active === 'hackers' ? 'categorias' : active === 'recentes' ? 'inicio' : active;
  $$('#tabbar a').forEach((a) => a.classList.toggle('active', a.dataset.tab === tabKey));
  const el = $('#tabs .active');
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  markNavOverflow();
}
function markNavOverflow() {
  const t = $('#tabs');
  t.classList.toggle('overflowing', t.scrollWidth > t.clientWidth + 1);
}
window.addEventListener('resize', markNavOverflow);

// ---------------------------------------------------------------------------
// Destaque (hero)
// ---------------------------------------------------------------------------

function featured(vis) {
  const day = Math.floor(Date.now() / 864e5);
  const pool = vis.filter((c) => c.g && bestQuality(c) >= 720);
  const pref = pool.filter((c) => c.c === (state.country || 'BR'));
  const out = [];
  const used = new Set();
  const cats = ['movies', 'sports', 'news', 'series', 'kids', 'entertainment', 'music', 'documentary'];
  cats.forEach((k, i) => {
    if (out.length >= 6) return;
    let cand = pref.filter((c) => c.k.includes(k) && !used.has(c.id));
    if (!cand.length) cand = pool.filter((c) => c.k.includes(k) && !used.has(c.id));
    if (!cand.length) return;
    const c = cand[(day + i) % cand.length];
    out.push(c);
    used.add(c.id);
  });
  if (out.length < 3) for (const c of vis.slice().sort(rank)) { if (out.length >= 5) break; if (!used.has(c.id)) { out.push(c); used.add(c.id); } }
  return out;
}

function heroHtml(list) {
  if (!list.length) return '';
  const ids = list.map((c) => c.id).join('|');
  const slides = list.map((ch, i) => {
    const q = qualityTag(bestQuality(ch));
    const fav = state.favs.has(ch.id);
    const live = state.settings.livePreviews ? thumbFresh(ch.id) : null;
    return `<div class="hero-slide ${i === 0 ? 'on' : ''} ${live ? 'has-still' : ''}" data-i="${i}" data-id="${esc(ch.id)}" style="--h:${hueFor(ch.n)}">
      <div class="hero-bg">${ch.g ? `<img class="hero-blur" src="${esc(ch.g)}" alt="" aria-hidden="true" referrerpolicy="no-referrer">` : ''}
        <img class="hero-still" alt="" ${live ? `src="${live.url}"` : ''}>
        <video class="hero-video" muted playsinline preload="none"></video>
      </div>
      <div class="hero-art">${logoHtml(ch, false)}</div>
      <div class="hero-content">
        <div class="eyebrow"><span class="live-dot"></span>Ao vivo agora · ${esc(catName(ch.k[0]))}</div>
        <h1>${esc(ch.n)}</h1>
        <div class="hero-meta">
          ${ch.c ? `<span>${esc(countryLabel(ch.c))}</span><span class="sep">·</span>` : ''}
          <span>${esc(ch.k.slice(0, 3).map(catName).join(', '))}</span>
          ${q ? `<span class="tag">${q}</span>` : ''}
          ${ch.s.length > 1 ? `<span class="sep">·</span><span>${ch.s.length} fontes</span>` : ''}
        </div>
        <div class="hero-actions">
          <button class="btn-play" data-play="${esc(ch.id)}" data-list="${esc(ids)}">${ICON.play}Assistir</button>
          <button class="btn-round ${fav ? 'on' : ''}" data-fav="${esc(ch.id)}" title="Minha lista" aria-label="Adicionar à minha lista">${ICON.add}${ICON.check}</button>
        </div>
      </div>
    </div>`;
  }).join('');
  const dots = list.length > 1
    ? `<div class="hero-dots">${list.map((_, i) => `<button class="${i === 0 ? 'on' : ''}" data-slide="${i}" aria-label="Destaque ${i + 1}"></button>`).join('')}</div>
       <button class="hero-arrow prev" data-slide-step="-1" tabindex="-1" aria-label="Anterior">${ICON.chevronL}</button>
       <button class="hero-arrow next" data-slide-step="1" tabindex="-1" aria-label="Próximo">${ICON.chevron}</button>`
    : '';
  return `<section class="hero on-dark" id="hero">${slides}${dots}</section>`;
}

function showSlide(i) {
  const hero = $('#hero');
  if (!hero) return;
  const n = state.hero.ids.length;
  if (!n) return;
  state.hero.idx = (i + n) % n;
  $$('.hero-slide', hero).forEach((s, k) => s.classList.toggle('on', k === state.hero.idx));
  $$('.hero-dots button', hero).forEach((d, k) => d.classList.toggle('on', k === state.hero.idx));
  scheduleHeroVideo();
}

function stopHero() { clearInterval(state.hero.timer); state.hero.timer = null; stopHeroVideo(); }
function startHero() {
  stopHero();
  if (state.hero.ids.length < 2) return;
  state.hero.timer = setInterval(() => {
    const hero = $('#hero');
    if (!hero) return stopHero();
    if (document.hidden || !playerEl.hidden || hero.matches(':hover') || hero.contains(document.activeElement)) return;
    if (heroVid.startedAt && Date.now() - heroVid.startedAt < 24000) return; // deixa o vídeo ao vivo rodar um pouco
    showSlide(state.hero.idx + 1);
  }, HERO_INTERVAL);
}

// ---------------------------------------------------------------------------
// Páginas
// ---------------------------------------------------------------------------

function renderHome() {
  const vis = visibleList();
  const feat = featured(vis);
  state.hero.ids = feat.map((c) => c.id);
  state.hero.idx = 0;

  let html = heroHtml(feat);
  if (!feat.length) html += '<div class="page"></div>';
  html += connectStripHtml();

  html += shelfHtml('Continuar assistindo', idsToChannels(state.recent).slice(0, ROW_SIZE), 'recentes', { live: true });
  html += shelfHtml('Minha lista', idsToChannels([...state.favs]).slice(0, ROW_SIZE), 'favoritos');
  html += `<div data-slot="hackers-home">${hackersHomeShelf()}</div>`;

  if (!state.country) {
    const br = vis.filter((c) => c.c === 'BR').sort(rank);
    html += shelfHtml('Canais do Brasil', br.slice(0, ROW_SIZE), 'pais-BR', { count: br.length });
  } else {
    html += shelfHtml(`Destaques · ${countryName(state.country)}`, vis.slice().sort(rank).slice(0, ROW_SIZE), 'todos', { count: vis.length });
  }

  const counts = categoryCounts(vis);
  const topCats = Object.keys(counts).filter((k) => k !== 'xxx' || state.settings.nsfw).sort((a, b) => counts[b] - counts[a]).slice(0, 12);
  if (topCats.length) {
    html += `<section class="shelf"><div class="shelf-head"><h2 class="sr"><a href="#categorias">Explorar por categoria${ICON.chevron}</a></h2></div>
      <button class="shelf-nav prev" data-scroll="-1" tabindex="-1" aria-label="Anterior">${ICON.chevronL}</button>
      <div class="shelf-scroll">${topCats.map((k) => tileHtml(k, counts[k])).join('')}</div>
      <button class="shelf-nav next" data-scroll="1" tabindex="-1" aria-label="Próximo">${ICON.chevron}</button></section>`;
  }

  if (!state.country) {
    const pt = vis.filter((c) => c.c === 'PT').sort(rank);
    html += shelfHtml('Canais de Portugal', pt.slice(0, ROW_SIZE), 'pais-PT', { count: pt.length });
  }
  for (const k of HOME_ROWS) {
    const list = vis.filter((c) => c.k.includes(k)).sort(rank);
    html += shelfHtml(catName(k), list.slice(0, ROW_SIZE), 'cat-' + k, { count: list.length });
  }
  if (!vis.length) html += `<div class="page">${emptyHtml()}</div>`;
  main.innerHTML = html;
  startHero();
  scheduleHeroVideo();
}

function renderCategories() {
  stopHero();
  const counts = categoryCounts(visibleList());
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1 class="large-title">Categorias</h1><p class="subtitle">${cats.length} categorias${state.country ? ' · ' + esc(countryName(state.country)) : ''}</p></div></div>
    ${cats.length ? `<div class="tiles">${hackersTileHtml()}${cats.map((k) => tileHtml(k, counts[k])).join('')}</div>` : emptyHtml()}
  </div>`;
}

let gridObserver;
function mountGrid(container, list) {
  state.grid = { list, pos: 0 };
  if (gridObserver) gridObserver.disconnect();
  container.innerHTML = '<div class="grid" id="grid"></div><div class="sentinel" id="sentinel"></div>';
  appendGrid();
  const sentinel = $('#sentinel');
  if (!sentinel) return;
  gridObserver = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) appendGrid();
  }, { rootMargin: '900px' });
  gridObserver.observe(sentinel);
}

function appendGrid() {
  const g = state.grid;
  const grid = $('#grid');
  if (!grid || g.pos >= g.list.length) return;
  const slice = g.list.slice(g.pos, g.pos + PAGE_SIZE);
  g.pos += slice.length;
  grid.insertAdjacentHTML('beforeend', slice.map((c) => cardHtml(c)).join(''));
  if (g.pos >= g.list.length) $('#sentinel')?.remove();
  observeThumbs();
}

function renderGrid(title, list, opts = {}) {
  stopHero();
  const sorted = opts.keepOrder ? list : sortList(list);
  const seg = opts.keepOrder ? '' : `<div class="segmented" role="tablist" aria-label="Ordenar">
      ${[['az', 'A–Z'], ['quality', 'Qualidade'], ['country', 'País']]
        .map(([v, l]) => `<button class="${state.sort === v ? 'on' : ''}" data-sort="${v}" role="tab" aria-selected="${state.sort === v}">${l}</button>`).join('')}
    </div>`;
  const sub = [`${fmt(sorted.length)} canais`, opts.countryLabel !== false && state.country ? countryName(state.country) : ''].filter(Boolean).join(' · ');
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1 class="large-title">${esc(title)}</h1><p class="subtitle">${esc(sub)}</p></div>${sorted.length ? seg : ''}</div>
    <div id="gridWrap">${sorted.length ? '' : emptyHtml(opts.emptyTitle, opts.empty)}</div>
  </div>`;
  if (sorted.length) mountGrid($('#gridWrap'), sorted);
}

function searchResults(q) {
  const nq = norm(q);
  const list = state.channels.filter((c) => visible(c) && c._s.includes(nq));
  // resultados que começam com o termo aparecem primeiro
  return list.sort((a, b) => (norm(b.n).startsWith(nq) ? 1 : 0) - (norm(a.n).startsWith(nq) ? 1 : 0) || rank(a, b));
}

function renderSearch() {
  stopHero();
  main.innerHTML = `<div class="page">
    <div class="page-head"><div><h1 class="large-title">Buscar</h1></div></div>
    <label class="search-field">
      ${ICON.search}
      <input id="searchInput" type="search" placeholder="Canais, emissoras, países…" autocomplete="off" enterkeyhint="search" value="${esc(state.query)}" aria-label="Buscar canais">
      <button class="search-clear" id="searchClear" ${state.query ? '' : 'hidden'} aria-label="Limpar">${ICON.x}</button>
    </label>
    <div id="searchResults"></div>
  </div>`;
  updateSearchResults();
}

function updateSearchResults() {
  const box = $('#searchResults');
  if (!box) return;
  $('#searchClear').hidden = !state.query;
  if (!state.query) {
    if (gridObserver) gridObserver.disconnect();
    const sugg = SEARCH_SUGGESTIONS.filter((s) => searchResults(s).length).slice(0, 14);
    const counts = categoryCounts(visibleList());
    const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]).slice(0, 8);
    box.innerHTML = `
      ${sugg.length ? `<div class="section-title">Buscas populares</div>
        <div class="suggestions">${sugg.map((s) => `<button data-suggest="${esc(s)}">${esc(s)}</button>`).join('')}</div>` : ''}
      ${cats.length ? `<div class="section-title">Navegar por categoria</div>
        <div class="tiles">${cats.map((k) => tileHtml(k, counts[k])).join('')}</div>` : ''}`;
    return;
  }
  const list = searchResults(state.query);
  const movies = searchMovies(state.query);
  if (!list.length && !movies.length) {
    box.innerHTML = emptyHtml(`Nada encontrado para “${state.query}”`, 'Confira a ortografia ou tente outro nome de canal ou filme.');
    return;
  }
  box.innerHTML = `${movies.length ? `<div class="search-movies">${posterShelfHtml('Cinema hacker', movies, 'hackers', { flush: true })}</div>` : ''}
    ${list.length ? `<div class="section-title">${fmt(list.length)} cana${list.length > 1 ? 'is' : 'l'}</div><div id="resultsGrid"></div>` : ''}`;
  if (list.length) mountGrid($('#resultsGrid'), list);
}

// ---------------------------------------------------------------------------
// Cinema hacker (lista "Movies For Hackers", github.com/k4m4/movies-for-hackers, CC0)
// ---------------------------------------------------------------------------
// É um catálogo: a lista não tem vídeos. Cada título mostra capa, sinopse e onde assistir legalmente.

let hackersLoading = null;
function loadHackers() {
  if (state.hackers) return Promise.resolve(state.hackers);
  if (!hackersLoading) {
    hackersLoading = fetch('api/hackers')
      .then((r) => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .then((data) => {
        state.hackers = data;
        state.movies = new Map();
        for (const sec of data.sections) for (const m of sec.items) {
          m._sec = sec.id;
          m._s = norm(m.t);
          if (!state.movies.has(m.id)) state.movies.set(m.id, m);
        }
        fillHackerSlots();
        return data;
      })
      .catch((err) => { hackersLoading = null; console.warn('Cinema hacker indisponível:', err.message); return null; });
  }
  return hackersLoading;
}

function allMovies() { return [...state.movies.values()]; }
function topMovies(n) {
  return allMovies().filter((m) => m.r).sort((a, b) => (b.p ? 1 : 0) - (a.p ? 1 : 0) || b.r - a.r).slice(0, n);
}
function movieMeta(m) {
  return [m.y, m.g.slice(0, 2).join(', ')].filter(Boolean).join(' · ');
}
function searchMovies(q) {
  if (!state.movies.size || !q) return [];
  const nq = norm(q);
  return allMovies().filter((m) => m._s.includes(nq) || m.g.some((g) => norm(g).includes(nq)))
    .sort((a, b) => (b._s.startsWith(nq) ? 1 : 0) - (a._s.startsWith(nq) ? 1 : 0) || (b.r || 0) - (a.r || 0));
}

function posterArtHtml(m, big = false) {
  const fallback = `<div class="poster-fallback"><span class="pf-prompt">&gt;_</span><b>${esc(m.t)}</b><small>${esc(m.y || '')}</small></div>`;
  return `<div class="poster-art${big ? ' big' : ''}" style="--h:${hueFor(m.t)}">
    ${fallback}
    ${m.p ? `<img src="${esc(m.p)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}
    ${m.r ? `<span class="imdb">IMDb ${m.r.toFixed(1)}</span>` : ''}
    ${m.tv ? '<span class="kind">SÉRIE</span>' : ''}
    <span class="shine"></span>
  </div>`;
}

function posterHtml(m) {
  return `<button class="poster" data-movie="${esc(m.id)}" aria-label="${esc(m.t)}">
    ${posterArtHtml(m)}
    <div class="cap"><div class="name">${esc(m.t)}</div><div class="meta">${esc(movieMeta(m))}</div></div>
  </button>`;
}

function posterShelfHtml(title, list, link, opts = {}) {
  if (!list.length) return '';
  const head = link ? `<h2 class="sr"><a href="#${link}">${esc(title)}${ICON.chevron}</a></h2>` : `<h2>${esc(title)}</h2>`;
  return `<section class="shelf poster-shelf${opts.flush ? ' flush' : ''}">
    <div class="shelf-head">${head}${opts.note ? `<span class="count">${esc(opts.note)}</span>` : ''}</div>
    <button class="shelf-nav prev" data-scroll="-1" tabindex="-1" aria-label="Anterior">${ICON.chevronL}</button>
    <div class="shelf-scroll">${list.map(posterHtml).join('')}</div>
    <button class="shelf-nav next" data-scroll="1" tabindex="-1" aria-label="Próximo">${ICON.chevron}</button>
  </section>`;
}

function hackersHomeShelf() {
  if (!state.movies.size) return '';
  return posterShelfHtml('Cinema hacker', topMovies(24), 'hackers', { note: `${state.movies.size} títulos` });
}

function hackersTileHtml() {
  return `<a class="tile tile-hacker" href="#hackers">
    <span class="tile-emoji" aria-hidden="true">💻</span>
    <span class="tile-name">Cinema hacker</span>
    <span class="tile-count">${state.movies.size ? `${state.movies.size} filmes e séries` : 'Filmes e séries sobre hackers'}</span>
  </a>`;
}

function fillHackerSlots() {
  $$('[data-slot="hackers-home"]').forEach((el) => { el.innerHTML = hackersHomeShelf(); });
  if (currentHash() === 'hackers') renderHackers();
  if (currentHash() === 'categorias') $$('.tile-hacker .tile-count').forEach((el) => { el.textContent = `${state.movies.size} filmes e séries`; });
  if (currentHash() === 'buscar' && state.query) updateSearchResults();
}

function renderHackers() {
  stopHero();
  const data = state.hackers;
  if (!data) {
    main.innerHTML = `<div class="page"><div class="loading" style="height:50vh"><div class="spinner"></div><p>Carregando o catálogo…</p></div></div>`;
    loadHackers().then((d) => { if (!d && currentHash() === 'hackers') main.innerHTML = `<div class="page">${emptyHtml('Catálogo indisponível', 'Não foi possível baixar a lista agora. Verifique a internet e tente de novo.')}</div>`; });
    return;
  }
  const count = state.movies.size;
  main.innerHTML = `<div class="page hackers-page">
    <div class="page-head">
      <div>
        <h1 class="large-title">Cinema hacker</h1>
        <p class="subtitle">${count} filmes, documentários e séries que todo hacker deveria ver</p>
      </div>
    </div>
    <p class="hackers-note">${ICON.tv}<span>Este catálogo indica <b>o que assistir</b>; os títulos não passam no JOWTV. Toque em um deles e use <b>Onde assistir</b> para ver em quais serviços está disponível no Brasil.</span></p>
  </div>
  ${posterShelfHtml('Mais bem avaliados', topMovies(20))}
  ${data.sections.map((sec) => posterShelfHtml(sec.name, sec.items.slice().sort((a, b) => (b.r || 0) - (a.r || 0)), null, { note: `${sec.items.length} títulos` })).join('')}
  <p class="credits">Lista <a href="${esc(data.source)}" target="_blank" rel="noopener">Movies For Hackers</a> (${esc(data.license)}), notas do IMDb${data.enriched ? ', capas e sinopses da Wikipédia' : ''}.</p>`;
}

function movieLinks(m) {
  const q = encodeURIComponent(m.t);
  return {
    justwatch: `https://www.justwatch.com/br/busca?q=${q}`,
    trailer: `https://www.youtube.com/results?search_query=${encodeURIComponent(`${m.t} ${m.y || ''} trailer`)}`,
    imdb: m.imdb,
    wiki: m.w,
  };
}

function openMovie(id) {
  const m = state.movies.get(id);
  if (!m) return;
  const l = movieLinks(m);
  const sec = state.hackers.sections.find((s) => s.id === m._sec);
  $('#movieBox').innerHTML = `
    <div class="movie-backdrop" style="--h:${hueFor(m.t)}">${m.p ? `<img src="${esc(m.p)}" alt="" referrerpolicy="no-referrer" onerror="this.remove()">` : ''}</div>
    <button class="sheet-done movie-close" data-close-sheet aria-label="Fechar">${ICON.x}</button>
    <div class="movie-main">
      <div class="movie-poster">${posterArtHtml(m, true)}</div>
      <div class="movie-info">
        <div class="eyebrow">${m.tv ? 'Série' : sec && sec.id === 'docs' ? 'Documentário' : 'Filme'} · Cinema hacker</div>
        <h2>${esc(m.t)}</h2>
        <div class="movie-meta">
          ${m.y ? `<span>${m.y}</span>` : ''}
          ${m.g.length ? `<span>${esc(m.g.join(', '))}</span>` : ''}
          ${m.r ? `<span class="imdb-badge">IMDb <b>${m.r.toFixed(1)}</b></span>` : ''}
        </div>
        <p class="movie-plot">${m.s ? esc(m.s) : 'Sinopse indisponível.'}${m.s && m.sl === 'en' ? ' <small>(sinopse em inglês)</small>' : ''}</p>
        <div class="movie-actions">
          <a class="btn-play" href="${esc(l.justwatch)}" target="_blank" rel="noopener">${ICON.play}Onde assistir</a>
          <a class="pill-btn" href="${esc(l.trailer)}" target="_blank" rel="noopener">Trailer</a>
          <a class="pill-btn" href="${esc(l.imdb)}" target="_blank" rel="noopener">IMDb</a>
          ${l.wiki ? `<a class="pill-btn" href="${esc(l.wiki)}" target="_blank" rel="noopener">Wikipédia</a>` : ''}
        </div>
        <p class="movie-hint">“Onde assistir” abre o JustWatch, que mostra em quais streamings brasileiros (Netflix, Prime Video, Max…) o título está disponível, inclusive opções gratuitas.</p>
      </div>
    </div>`;
  openSheet('#movieSheet');
}

// ---------------------------------------------------------------------------
// Rotas (hash)
// ---------------------------------------------------------------------------

function currentHash() { return decodeURIComponent(location.hash.slice(1)) || 'inicio'; }

function route(keepScroll = false) {
  if (!state.channels.length) return;
  const hash = currentHash();
  const y = window.scrollY;
  renderTabs(hash);
  document.body.dataset.page = hash.split('-')[0];

  if (hash === 'inicio') renderHome();
  else if (hash === 'todos') renderGrid('Ao vivo', visibleList());
  else if (hash === 'categorias') renderCategories();
  else if (hash === 'hackers') renderHackers();
  else if (hash === 'buscar') renderSearch();
  else if (hash === 'favoritos') {
    renderGrid('Minha lista', idsToChannels([...state.favs]), { keepOrder: true, emptyTitle: 'Sua lista está vazia', empty: 'Abra um canal e toque em ＋ para adicioná-lo aqui.' });
  } else if (hash === 'recentes') {
    renderGrid('Continuar assistindo', idsToChannels(state.recent), { keepOrder: true });
  } else if (hash.startsWith('cat-')) {
    const k = hash.slice(4);
    renderGrid(catName(k), visibleList().filter((c) => c.k.includes(k)));
  } else if (hash.startsWith('pais-')) {
    const code = hash.slice(5);
    renderGrid(countryLabel(code), state.channels.filter((c) => c.c === code && visible(c, true)), { countryLabel: false });
  } else {
    location.hash = 'inicio';
    return;
  }
  window.scrollTo(0, keepScroll ? y : 0);
  updateNavBg();
  resetThumbObserver();
  observeThumbs();
  if (hash === 'buscar' && !keepScroll && matchMedia('(hover: hover)').matches) $('#searchInput')?.focus();
}

// ---------------------------------------------------------------------------
// Assistir no celular / TV (QR code)
// ---------------------------------------------------------------------------

function qrSvg(text) {
  if (!window.qrcode) return '';
  try {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true, alt: 'QR code para ' + text });
  } catch { return ''; }
}

async function loadInfo() {
  try {
    const r = await fetch('api/info');
    if (r.ok) state.info = await r.json();
  } catch { /* servidor antigo ou offline */ }
  return state.info;
}

function connectTarget() {
  if (!IS_LOCAL_PC) return location.origin;
  const a = state.info && state.info.addresses;
  return a && a.length ? a[0].url : '';
}

function connectStripHtml() {
  if (!IS_LOCAL_PC || store.get('hideHeroQr', false)) return '';
  const url = connectTarget();
  if (!url) return '';
  return `<div class="connect-strip glass">
    <div class="qr">${qrSvg(url)}</div>
    <div>
      <b>Assista no celular ou na TV</b>
      <p>No mesmo Wi-Fi, aponte a câmera para o código ou abra <code>${esc(url.replace('http://', ''))}</code></p>
    </div>
    <div class="actions">
      <button class="pill-btn" data-action="open-connect">Mais opções</button>
      <button class="icon-x" data-action="hide-hero-qr" title="Esconder" aria-label="Esconder">${ICON.x}</button>
    </div>
  </div>`;
}

function renderConnect(selected) {
  const body = $('#connectBody');
  const info = state.info;
  const addrs = IS_LOCAL_PC ? (info && info.addresses) || [] : [{ url: location.origin, address: location.host }];

  if (IS_LOCAL_PC && info && info.lanEnabled === false) {
    body.innerHTML = `<p class="muted">O servidor foi iniciado só para este computador (HOST=127.0.0.1).
      Inicie normalmente com <code>iniciar.bat</code> ou <code>node server.js</code> para liberar o acesso pela rede.</p>`;
    return;
  }
  if (!addrs.length) {
    body.innerHTML = `<p class="muted">${info ? 'Nenhuma conexão de rede encontrada neste computador. Conecte o PC ao Wi-Fi ou ao cabo de rede e reabra esta janela.'
      : 'Não foi possível consultar o servidor. Reinicie o JOWTV (feche a janela preta e abra o iniciar.bat de novo).'}</p>`;
    return;
  }

  const url = selected || addrs[0].url;
  const others = addrs.filter((a) => a.url !== url);
  body.innerHTML = `
    ${IS_LOCAL_PC ? '' : '<p class="muted" style="margin-top:0">Você já está acessando o JOWTV pela rede. Para abrir em <b>outro aparelho</b>, use o código ou o endereço abaixo.</p>'}
    <div class="connect-main">
      <div class="qr big">${qrSvg(url)}</div>
      <ol class="steps">
        <li>Conecte o celular ou a TV no <b>mesmo Wi-Fi</b> deste computador.</li>
        <li>Abra a <b>câmera</b> do celular e aponte para o código. Toque no link que aparecer.</li>
        <li>Ou digite no navegador:</li>
      </ol>
    </div>
    <div class="connect-url">
      <code id="connectUrl">${esc(url)}</code>
      <button class="pill-btn" data-action="copy-url" data-url="${esc(url)}">Copiar</button>
    </div>
    ${others.length ? `<div class="connect-others"><span>Não abriu? Tente outro endereço deste PC:</span>
      <div class="suggestions">${others.map((a) => `<button data-action="pick-url" data-url="${esc(a.url)}">${esc(a.address)}${a.iface ? `<small>${esc(a.iface)}</small>` : ''}</button>`).join('')}</div></div>` : ''}
    <details class="connect-help">
      <summary>Abriu nada no celular? Veja o que fazer</summary>
      <ul>
        <li><b>Mantenha a janela preta aberta</b> no PC. Se ela fechar, o JOWTV para.</li>
        <li><b>Firewall do Windows:</b> dê dois cliques em <code>liberar-firewall.bat</code> (na pasta do JOWTV) e aceite o pedido de administrador. Depois feche e abra o <code>iniciar.bat</code>.</li>
        <li>O celular precisa estar no <b>Wi-Fi</b> (não nos dados móveis) e na mesma rede do PC — evite a “rede de convidados”.</li>
        <li>Desligue VPNs no PC e no celular.</li>
        <li>Digite o endereço com <code>http://</code> e com <code>:${esc(String((info && info.port) || location.port || 8080))}</code> no final.</li>
      </ul>
    </details>`;
}

async function openConnect() {
  openSheet('#connect');
  $('#connectBody').innerHTML = '<div class="spinner" style="margin:30px auto"></div>';
  if (IS_LOCAL_PC) await loadInfo();
  renderConnect();
}

// ---------------------------------------------------------------------------
// Folhas (ajustes / celular)
// ---------------------------------------------------------------------------

let sheetReturnFocus = null;
function openSheet(sel) {
  sheetReturnFocus = document.activeElement;
  $(sel).hidden = false;
  setTimeout(() => $(`${sel} .sheet-done`)?.focus({ preventScroll: true }), 30);
}
function closeSheet(sel) {
  $(sel).hidden = true;
  if (sheetReturnFocus && document.contains(sheetReturnFocus)) sheetReturnFocus.focus({ preventScroll: true });
}
const openSheetEl = () => $$('.sheet').find((s) => !s.hidden);

// ---------------------------------------------------------------------------
// Minha lista (favoritos)
// ---------------------------------------------------------------------------

function toggleFav(id) {
  const ch = state.byId.get(id);
  if (!ch) return;
  const on = !state.favs.has(id);
  if (on) state.favs.add(id); else state.favs.delete(id);
  store.set('favs', [...state.favs]);
  toast(on ? 'Adicionado à Minha lista' : 'Removido da Minha lista');
  $$(`[data-fav="${CSS.escape(id)}"]`).forEach((b) => b.classList.toggle('on', on));
  $$(`.card[data-id="${CSS.escape(id)}"] .art`).forEach((art) => {
    const heart = $('.heart', art);
    if (on && !heart) $('.shine', art).insertAdjacentHTML('beforebegin', `<span class="heart">${ICON.heart}</span>`);
    if (!on && heart) heart.remove();
  });
  if (player.ch && player.ch.id === id) $('#favBtn').classList.toggle('on', on);
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

const player = {
  hls: null,
  ch: null,
  idx: 0,
  failed: new Set(),
  watchdog: null,
  mode: 'hls',
};

function streamUrl(s) {
  if (!state.settings.proxy) return s.u;
  let u = 'proxy?url=' + encodeURIComponent(s.u);
  if (s.ua) u += '&ua=' + encodeURIComponent(s.ua);
  if (s.r) u += '&ref=' + encodeURIComponent(s.r);
  return u;
}

function setStatus(msg, spinner = false) {
  $('#videoStatus').innerHTML = msg ? `${spinner ? '<div class="spinner"></div>' : ''}<div>${msg}</div>` : '';
}

function stopPlayback() {
  clearTimeout(player.watchdog);
  if (player.hls) { player.hls.destroy(); player.hls = null; }
  video.removeAttribute('src');
  video.load();
}

function openChannel(id, playlist) {
  const ch = state.byId.get(id);
  if (!ch) return;
  if (playlist) state.playlist = playlist;
  if (playerEl.hidden) state.lastFocusId = id;
  player.ch = ch;
  player.failed = new Set();
  playerEl.hidden = false;
  document.body.style.overflow = 'hidden';
  stopHero();
  stopHeroVideo();

  $('#piLogo').innerHTML = logoHtml(ch, false);
  $('#piName').textContent = ch.n;
  $('#piMeta').textContent = [ch.c ? countryLabel(ch.c) : '', ch.k.slice(0, 3).map(catName).join(', '), ch.w || '']
    .filter(Boolean).join(' · ');
  $('#favBtn').classList.toggle('on', state.favs.has(id));

  state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 40);
  store.set('recent', state.recent);

  const hasNav = state.playlist.length > 1;
  $('#prevCh').hidden = $('#nextCh').hidden = !hasNav;
  pokePlayer();
  playSource(0);
  if (!playerEl.contains(document.activeElement)) $('#playBtn').focus({ preventScroll: true });
}

function renderSources() {
  const ch = player.ch;
  $('#sources').innerHTML = ch.s.map((s, i) => {
    const labels = (s.l || []).map((l) => (l === 'Geo-blocked' ? 'Bloqueio regional' : l === 'Not 24/7' ? 'Não é 24h' : l));
    const extra = [s.q, ...labels].filter(Boolean).join(' · ');
    return `<button class="source ${i === player.idx ? 'active' : ''} ${player.failed.has(i) ? 'failed' : ''}" data-src="${i}">
      ${ICON.checkSmall}<span class="lbl">Fonte ${i + 1}</span><small>${esc(player.failed.has(i) ? 'falhou' : extra)}</small>
    </button>`;
  }).join('');
}

function playSource(i) {
  const ch = player.ch;
  stopPlayback();
  if (i >= ch.s.length) {
    renderSources();
    setStatus('Este canal não respondeu agora<small>Pode estar fora do ar ou bloqueado no seu país. Tente outra fonte ou outro canal.</small>');
    return;
  }
  player.idx = i;
  player.mode = 'hls';
  renderSources();
  setStatus('Conectando…', true);
  startMode();
}

function nextSource() {
  player.failed.add(player.idx);
  let n = player.idx + 1;
  while (n < player.ch.s.length && player.failed.has(n)) n++;
  playSource(n);
}

function armWatchdog() {
  clearTimeout(player.watchdog);
  player.watchdog = setTimeout(() => {
    if (video.readyState < 2) fail('tempo esgotado');
  }, 25000);
}

function fail(reason) {
  console.warn('Fonte falhou:', reason);
  // tenta reprodução nativa antes de desistir da fonte (ex.: Safari / links que não são HLS)
  if (player.mode === 'hls' && video.canPlayType('application/vnd.apple.mpegurl')) {
    player.mode = 'native';
    if (player.hls) { player.hls.destroy(); player.hls = null; }
    return startMode();
  }
  if (player.mode === 'hls' && !/\.m3u8/i.test(player.ch.s[player.idx].u)) {
    player.mode = 'native';
    if (player.hls) { player.hls.destroy(); player.hls = null; }
    return startMode();
  }
  nextSource();
}

function startMode() {
  const url = streamUrl(player.ch.s[player.idx]);
  armWatchdog();

  if (player.mode === 'hls' && window.Hls && Hls.isSupported()) {
    let mediaRecovered = false;
    const hls = new Hls({ enableWorker: true, manifestLoadingTimeOut: 15000, fragLoadingTimeOut: 20000, backBufferLength: 30 });
    player.hls = hls;
    hls.on(Hls.Events.MANIFEST_PARSED, () => tryPlay());
    hls.on(Hls.Events.ERROR, (_, data) => {
      if (!data.fatal || player.hls !== hls) return;
      if (data.type === Hls.ErrorTypes.MEDIA_ERROR && !mediaRecovered) {
        mediaRecovered = true;
        hls.recoverMediaError();
        return;
      }
      fail(data.details);
    });
    hls.loadSource(url);
    hls.attachMedia(video);
    return;
  }
  player.mode = 'native';
  video.src = url;
  tryPlay();
}

function tryPlay() {
  const p = video.play();
  if (p && p.catch) {
    p.catch((err) => {
      if (err.name === 'NotAllowedError') setStatus('Toque em ▶ para começar');
    });
  }
}

function togglePlay() {
  if (video.paused) tryPlay(); else video.pause();
  pokePlayer();
}

function closePlayer() {
  stopPlayback();
  setStatus('');
  $('#sourcesPanel').hidden = true;
  playerEl.hidden = true;
  playerEl.classList.remove('idle');
  document.body.style.overflow = '';
  if (document.pictureInPictureElement) document.exitPictureInPicture().catch(() => {});
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (currentHash() === 'inicio') route(true); // atualiza "Continuar assistindo"
  pumpThumbs();
  const back = state.lastFocusId && $(`.card[data-id="${CSS.escape(state.lastFocusId)}"]`);
  if (back) back.focus({ preventScroll: true });
}

function stepChannel(dir) {
  const list = state.playlist;
  if (list.length < 2 || !player.ch) return;
  const i = list.indexOf(player.ch.id);
  const next = list[(i + dir + list.length) % list.length];
  openChannel(next);
  toast(state.byId.get(next)?.n || '');
}

function toggleFullscreen() {
  if (document.fullscreenElement) return document.exitFullscreen().catch(() => {});
  if (playerEl.requestFullscreen) return playerEl.requestFullscreen().catch(() => {});
  if (video.webkitEnterFullscreen) video.webkitEnterFullscreen(); // iPhone
}

// Controles que se escondem sozinhos
let idleTimer;
let barHover = false;
function pokePlayer() {
  playerEl.classList.remove('idle');
  clearTimeout(idleTimer);
  idleTimer = setTimeout(() => {
    if (!video.paused && $('#sourcesPanel').hidden && !barHover) playerEl.classList.add('idle');
  }, 3500);
}

video.addEventListener('playing', () => { clearTimeout(player.watchdog); setStatus(''); });
video.addEventListener('waiting', () => { if (!video.paused) setStatus('Carregando…', true); });
video.addEventListener('play', () => { playerEl.classList.remove('paused'); pokePlayer(); });
video.addEventListener('pause', () => { playerEl.classList.add('paused'); playerEl.classList.remove('idle'); });
video.addEventListener('volumechange', () => {
  playerEl.classList.toggle('muted', video.muted || video.volume === 0);
  $('#volume').value = video.muted ? 0 : video.volume;
  store.set('volume', video.volume);
  store.set('muted', video.muted);
});
video.addEventListener('error', () => {
  if (player.mode === 'native' && player.ch && !playerEl.hidden && video.getAttribute('src')) fail('erro nativo');
});

video.volume = Math.min(1, Math.max(0, Number(store.get('volume', 1)) || 1));
video.muted = !!store.get('muted', false);
$('#volume').value = video.muted ? 0 : video.volume;
playerEl.classList.toggle('muted', video.muted);
if (!document.pictureInPictureEnabled) $('#pipBtn').hidden = true;

$('#playBtn').addEventListener('click', togglePlay);
$('#closePlayer').addEventListener('click', closePlayer);
$('#prevCh').addEventListener('click', () => stepChannel(-1));
$('#nextCh').addEventListener('click', () => stepChannel(1));
$('#favBtn').addEventListener('click', () => player.ch && toggleFav(player.ch.id));
$('#infoBtn').addEventListener('click', () => {
  const p = $('#sourcesPanel');
  p.hidden = !p.hidden;
  $('#infoBtn').classList.toggle('on', !p.hidden);
  if (!p.hidden) $('.source.active', p)?.focus({ preventScroll: true });
  pokePlayer();
});
$('#copyBtn').addEventListener('click', async () => {
  const ok = await copyText(player.ch.s[player.idx].u);
  toast(ok ? 'Link copiado — cole no VLC em “Abrir fluxo de rede”' : 'Não foi possível copiar o link');
});
$('#muteBtn').addEventListener('click', () => {
  if (video.muted || video.volume === 0) { video.muted = false; if (video.volume === 0) video.volume = 0.6; } else video.muted = true;
});
$('#volume').addEventListener('input', (e) => { video.volume = Number(e.target.value); video.muted = video.volume === 0; });
$('#pipBtn').addEventListener('click', async () => {
  try {
    if (document.pictureInPictureElement) await document.exitPictureInPicture();
    else await video.requestPictureInPicture();
  } catch { toast('Picture-in-Picture indisponível'); }
});
$('#fsBtn').addEventListener('click', toggleFullscreen);
$('#sources').addEventListener('click', (e) => {
  const b = e.target.closest('[data-src]');
  if (!b) return;
  player.failed.delete(Number(b.dataset.src));
  playSource(Number(b.dataset.src));
});

const plBottom = $('.pl-bottom');
plBottom.addEventListener('pointerenter', () => { barHover = true; });
plBottom.addEventListener('pointerleave', () => { barHover = false; pokePlayer(); });
playerEl.addEventListener('pointermove', pokePlayer);
playerEl.addEventListener('click', (e) => {
  if (e.target !== video && !e.target.classList.contains('pl-shade')) return;
  if (!$('#sourcesPanel').hidden) { $('#sourcesPanel').hidden = true; $('#infoBtn').classList.remove('on'); return pokePlayer(); }
  if (e.pointerType === 'touch' || e.pointerType === 'pen') {
    if (playerEl.classList.contains('idle')) pokePlayer(); else playerEl.classList.add('idle');
  } else togglePlay();
});
video.addEventListener('dblclick', toggleFullscreen);

// ---------------------------------------------------------------------------
// Miniaturas ao vivo e vídeo do destaque
// ---------------------------------------------------------------------------
// O navegador abre o stream (pelo proxy, para poder ler os pixels), captura um quadro,
// mostra na miniatura e envia para o servidor, que compartilha com os outros aparelhos.

const THUMB_TTL = 10 * 60 * 1000;
const THUMB_FAIL_TTL = 10 * 60 * 1000;
const thumbs = {
  mem: new Map(), // id -> { url, t }
  failed: new Map(), // id -> quando falhou
  queue: [],
  queued: new Set(),
  active: 0,
  max: matchMedia('(hover: hover)').matches ? 3 : 2,
};
const canCapture = () => !!(window.Hls && Hls.isSupported()) || !!document.createElement('video').canPlayType('application/vnd.apple.mpegurl');

function thumbFresh(id) {
  const t = thumbs.mem.get(id);
  return t && Date.now() - t.t < THUMB_TTL ? t : null;
}

function proxied(s) {
  let u = 'proxy?url=' + encodeURIComponent(s.u);
  if (s.ua) u += '&ua=' + encodeURIComponent(s.ua);
  if (s.r) u += '&ref=' + encodeURIComponent(s.r);
  return u;
}

function applyThumb(id) {
  const t = thumbFresh(id);
  if (!t || !state.settings.livePreviews) return;
  $$(`.card[data-id="${CSS.escape(id)}"] .art`).forEach((art) => {
    let img = $('.art-live', art);
    if (!img) {
      img = document.createElement('img');
      img.className = 'art-live';
      img.alt = '';
      img.decoding = 'async';
      $('.art-logo', art).before(img);
    }
    if (img.getAttribute('src') === t.url) return art.classList.add('has-live');
    img.onload = () => art.classList.add('has-live');
    img.src = t.url;
  });
  $$(`.hero-slide[data-id="${CSS.escape(id)}"]`).forEach((slide) => {
    const still = $('.hero-still', slide);
    if (still.getAttribute('src') === t.url) return slide.classList.add('has-still');
    still.onload = () => slide.classList.add('has-still');
    still.src = t.url;
  });
}

function setThumb(id, blob, upload) {
  const old = thumbs.mem.get(id);
  thumbs.mem.delete(id);
  thumbs.mem.set(id, { url: URL.createObjectURL(blob), t: Date.now() });
  if (old) setTimeout(() => URL.revokeObjectURL(old.url), 5000);
  while (thumbs.mem.size > 400) {
    const [k, v] = thumbs.mem.entries().next().value;
    thumbs.mem.delete(k);
    URL.revokeObjectURL(v.url);
  }
  applyThumb(id);
  if (upload) {
    fetch('api/thumb?id=' + encodeURIComponent(id), { method: 'POST', headers: { 'Content-Type': 'image/jpeg' }, body: blob }).catch(() => {});
  }
}

let thumbLab;
function captureFrame(s) {
  return new Promise((resolve) => {
    if (!thumbLab) {
      thumbLab = document.createElement('div');
      thumbLab.setAttribute('aria-hidden', 'true');
      thumbLab.style.cssText = 'position:fixed;right:0;bottom:0;width:2px;height:2px;opacity:.01;pointer-events:none;overflow:hidden;z-index:-1';
      document.body.appendChild(thumbLab);
    }
    const v = document.createElement('video');
    v.muted = true;
    v.playsInline = true;
    v.setAttribute('playsinline', '');
    v.style.cssText = 'width:2px;height:2px';
    thumbLab.appendChild(v);
    let hls = null;
    let done = false;
    let tries = 0;
    let busy = false;
    const finish = (blob) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (hls) hls.destroy();
      v.removeAttribute('src');
      v.load();
      v.remove();
      resolve(blob || null);
    };
    const timer = setTimeout(() => finish(null), 15000);
    const grab = () => {
      if (!v.videoWidth || !v.videoHeight) return false;
      const W = 480;
      const H = 270;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      const ctx = c.getContext('2d', { willReadFrequently: true });
      const scale = Math.max(W / v.videoWidth, H / v.videoHeight);
      const dw = v.videoWidth * scale;
      const dh = v.videoHeight * scale;
      ctx.drawImage(v, (W - dw) / 2, (H - dh) / 2, dw, dh);
      let px;
      try { px = ctx.getImageData(0, 0, W, H).data; } catch { finish(null); return true; }
      // evita quadros pretos ou chapados (comuns no começo dos streams)
      let sum = 0; let sum2 = 0; let n = 0;
      for (let i = 0; i < px.length; i += 4 * 97) {
        const l = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
        sum += l; sum2 += l * l; n++;
      }
      const avg = sum / n;
      const sd = Math.sqrt(Math.max(0, sum2 / n - avg * avg));
      if ((avg < 16 || sd < 6) && tries++ < 8) return false;
      c.toBlob((b) => finish(b), 'image/jpeg', 0.74);
      return true;
    };
    v.addEventListener('timeupdate', () => {
      if (busy || done || v.currentTime < 0.5) return;
      busy = true;
      if (!grab()) busy = false;
    });
    v.addEventListener('error', () => finish(null));
    const url = proxied(s);
    if (window.Hls && Hls.isSupported()) {
      hls = new Hls({ enableWorker: true, startLevel: 0, maxBufferLength: 6, maxMaxBufferLength: 8, backBufferLength: 0, manifestLoadingTimeOut: 8000, fragLoadingTimeOut: 10000 });
      hls.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
      hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) finish(null); });
      hls.loadSource(url);
      hls.attachMedia(v);
    } else {
      v.src = url;
      v.play().catch(() => {});
    }
  });
}

async function getThumb(id) {
  try {
    const r = await fetch('api/thumb?id=' + encodeURIComponent(id), { cache: 'no-store' });
    if (r.status === 200) return setThumb(id, await r.blob(), false);
  } catch { /* servidor sem miniatura */ }
  const ch = state.byId.get(id);
  if (!ch) return;
  for (const s of ch.s.slice(0, 2)) {
    if (!state.settings.livePreviews || !playerEl.hidden) return;
    const blob = await captureFrame(s);
    if (blob) return setThumb(id, blob, true);
  }
  thumbs.failed.set(id, Date.now());
}

function requestThumb(id, priority = false) {
  if (!state.settings.livePreviews || !canCapture()) return;
  if (thumbFresh(id)) return applyThumb(id);
  const f = thumbs.failed.get(id);
  if (f && Date.now() - f < THUMB_FAIL_TTL) return;
  if (thumbs.queued.has(id)) {
    if (priority) { thumbs.queue = thumbs.queue.filter((x) => x !== id); thumbs.queue.unshift(id); }
    return;
  }
  thumbs.queued.add(id);
  if (priority) thumbs.queue.unshift(id); else thumbs.queue.push(id);
  pumpThumbs();
}

function pumpThumbs() {
  while (thumbs.active < thumbs.max && thumbs.queue.length && playerEl.hidden && !document.hidden) {
    const id = thumbs.queue.shift();
    // ainda está na tela?
    if (!document.querySelector(`.card[data-id="${CSS.escape(id)}"], .hero-slide[data-id="${CSS.escape(id)}"]`)) {
      thumbs.queued.delete(id);
      continue;
    }
    thumbs.active++;
    getThumb(id).catch(() => {}).finally(() => {
      thumbs.active--;
      thumbs.queued.delete(id);
      pumpThumbs();
    });
  }
}

let thumbObserver = null;
const onScreen = new Set();
function resetThumbObserver() {
  if (thumbObserver) thumbObserver.disconnect();
  thumbObserver = null;
  onScreen.clear();
  // tira da fila o que não está mais na página
  thumbs.queue = thumbs.queue.filter((id) => { const keep = !!document.querySelector(`.card[data-id="${CSS.escape(id)}"]`); if (!keep) thumbs.queued.delete(id); return keep; });
}
function observeThumbs() {
  if (!state.settings.livePreviews || !canCapture()) return;
  if (!thumbObserver) {
    thumbObserver = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          onScreen.add(e.target);
          setTimeout(() => {
            if (onScreen.has(e.target)) requestThumb(e.target.closest('.card').dataset.id);
          }, 450);
        } else onScreen.delete(e.target);
      }
    }, { threshold: 0.35, rootMargin: '150px 0px' });
  }
  $$('.card .art:not([data-obs])').forEach((a) => { a.dataset.obs = '1'; thumbObserver.observe(a); });
}

// Vídeo ao vivo (sem som) no destaque
let heroVid = { hls: null, el: null, timer: null, startedAt: 0 };
function stopHeroVideo() {
  clearTimeout(heroVid.timer);
  if (heroVid.hls) heroVid.hls.destroy();
  if (heroVid.el) {
    heroVid.el.closest('.hero-slide')?.classList.remove('has-video');
    heroVid.el.removeAttribute('src');
    heroVid.el.load();
  }
  heroVid = { hls: null, el: null, timer: null, startedAt: 0 };
}
function scheduleHeroVideo() {
  stopHeroVideo();
  const id = state.hero.ids[state.hero.idx];
  if (!id || !$('#hero')) return;
  requestThumb(id, true);
  if (!state.settings.heroVideo || !playerEl.hidden || document.hidden) return;
  heroVid.timer = setTimeout(() => startHeroVideo(id), 1500);
}
function startHeroVideo(id) {
  const slide = $(`.hero-slide.on[data-id="${CSS.escape(id)}"]`);
  const ch = state.byId.get(id);
  if (!slide || !ch || !playerEl.hidden) return;
  const v = $('.hero-video', slide);
  heroVid.el = v;
  v.muted = true;
  v.onplaying = () => { slide.classList.add('has-video'); heroVid.startedAt = Date.now(); };
  const url = proxied(ch.s[0]);
  if (window.Hls && Hls.isSupported()) {
    const h = new Hls({ enableWorker: true, maxBufferLength: 10, backBufferLength: 0, capLevelToPlayerSize: true });
    heroVid.hls = h;
    h.on(Hls.Events.MANIFEST_PARSED, () => v.play().catch(() => {}));
    h.on(Hls.Events.ERROR, (_, d) => { if (d.fatal && heroVid.hls === h) stopHeroVideo(); });
    h.loadSource(url);
    h.attachMedia(v);
  } else if (v.canPlayType('application/vnd.apple.mpegurl')) {
    v.src = url;
    v.play().catch(() => {});
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden) return stopHeroVideo();
  if ($('#hero') && playerEl.hidden) scheduleHeroVideo();
  pumpThumbs();
});

// ---------------------------------------------------------------------------
// Navegação por setas (controle remoto / teclado)
// ---------------------------------------------------------------------------

const FOCUS_SEL = 'a[href], button:not([disabled]):not([tabindex="-1"]), select, input, summary';

function focusables(scope) {
  return $$(FOCUS_SEL, scope).filter((el) => {
    if (el.closest('[hidden]')) return false;
    if (el.closest('.shelf-head')) return false; // títulos ficam fora da navegação por setas (como no tvOS)
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return false;
    return getComputedStyle(el).visibility !== 'hidden';
  });
}

function moveFocus(dir) {
  const scope = openSheetEl() || (!playerEl.hidden ? playerEl : document.body);
  const list = focusables(scope);
  if (!list.length) return;
  const cur = document.activeElement;
  if (!list.includes(cur)) {
    const first = list.find((el) => {
      const r = el.getBoundingClientRect();
      return r.top >= 60 && r.bottom <= innerHeight && (el.matches('.card, .btn-play, .tile, .poster') || scope !== document.body);
    }) || list[0];
    first.focus();
    return;
  }
  const r = cur.getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;
  let best = null;
  let bestScore = Infinity;
  for (const el of list) {
    if (el === cur) continue;
    const b = el.getBoundingClientRect();
    const x = b.left + b.width / 2;
    const y = b.top + b.height / 2;
    const dx = x - cx;
    const dy = y - cy;
    let primary;
    let ortho;
    if (dir === 'right') { if (b.left < r.right - r.width * 0.3 || dx <= 0) continue; primary = dx; ortho = Math.abs(dy); }
    else if (dir === 'left') { if (b.right > r.left + r.width * 0.3 || dx >= 0) continue; primary = -dx; ortho = Math.abs(dy); }
    else if (dir === 'down') { if (b.top < r.bottom - r.height * 0.3 || dy <= 0) continue; primary = dy; ortho = Math.abs(dx); }
    else { if (b.bottom > r.top + r.height * 0.3 || dy >= 0) continue; primary = -dy; ortho = Math.abs(dx); }
    const score = primary + ortho * 2.2;
    if (score < bestScore) { bestScore = score; best = el; }
  }
  if (!best) return;
  // ao entrar nos pontos do carrossel, vai para o ponto ativo
  if (best.closest('.hero-dots') && !cur.closest('.hero-dots')) best = $('.hero-dots button.on') || best;
  best.focus({ preventScroll: true });
  if (best.closest('.hero') || best.closest('.nav')) {
    if (best.closest('.hero')) window.scrollTo({ top: 0, behavior: 'smooth' });
  } else {
    best.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    // mantém o item fora da área da barra fixa
    const nb = best.getBoundingClientRect();
    if (nb.top < 90) window.scrollBy({ top: nb.top - 110, behavior: 'smooth' });
  }
}

const ARROWS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };

document.addEventListener('keydown', (e) => {
  const inPlayer = !playerEl.hidden;
  const sheet = openSheetEl();
  const tag = e.target.tagName;

  if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
    if (sheet) { e.preventDefault(); return closeSheet('#' + sheet.id); }
    if (inPlayer) {
      if (!$('#sourcesPanel').hidden) { $('#sourcesPanel').hidden = true; $('#infoBtn').classList.remove('on'); return; }
      if (!document.fullscreenElement) { e.preventDefault(); closePlayer(); }
    }
    return;
  }

  if (inPlayer && !sheet) {
    pokePlayer();
    const inControls = e.target.closest && e.target.closest('.pl-bar, .pl-sources, .pl-top');
    if (tag === 'INPUT' && e.target.type === 'range' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return;
    if (e.key === 'ChannelUp' || e.key === 'PageUp') { e.preventDefault(); return stepChannel(1); }
    if (e.key === 'ChannelDown' || e.key === 'PageDown') { e.preventDefault(); return stepChannel(-1); }
    if (ARROWS[e.key]) {
      e.preventDefault();
      if (!inControls && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) return stepChannel(e.key === 'ArrowRight' ? 1 : -1);
      if (!inControls) return $('#playBtn').focus();
      return moveFocus(ARROWS[e.key]);
    }
    if (e.key === ' ' || (e.key === 'Enter' && !inControls)) { e.preventDefault(); return togglePlay(); }
    if (e.key === 'k' || e.key === 'K' || e.key === 'MediaPlayPause') { e.preventDefault(); return togglePlay(); }
    if (e.key === 'm' || e.key === 'M') return $('#muteBtn').click();
    if (e.key === 'f' || e.key === 'F') return toggleFullscreen();
    if (e.key === 'i' || e.key === 'I') return $('#infoBtn').click();
    return;
  }

  if (!ARROWS[e.key] || e.altKey || e.ctrlKey || e.metaKey) return;
  if (tag === 'SELECT' || tag === 'TEXTAREA') return;
  if (tag === 'INPUT' && e.target.type !== 'checkbox' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
  e.preventDefault();
  moveFocus(ARROWS[e.key]);
});

// ---------------------------------------------------------------------------
// Efeito de inclinação e brilho dos cards (mouse)
// ---------------------------------------------------------------------------

let tiltCard = null;
function resetTilt(card) {
  if (!card) return;
  card.style.removeProperty('--rx');
  card.style.removeProperty('--ry');
}
main.addEventListener('pointermove', (e) => {
  if (e.pointerType !== 'mouse') return;
  const card = e.target.closest('.card');
  if (card !== tiltCard) { resetTilt(tiltCard); tiltCard = card; }
  if (!card) return;
  const r = card.querySelector('.art').getBoundingClientRect();
  const px = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
  const py = Math.min(1, Math.max(0, (e.clientY - r.top) / r.height));
  card.style.setProperty('--ry', `${((px - 0.5) * 9).toFixed(2)}deg`);
  card.style.setProperty('--rx', `${((0.5 - py) * 7).toFixed(2)}deg`);
  card.style.setProperty('--mx', `${(px * 100).toFixed(1)}%`);
  card.style.setProperty('--my', `${(py * 100).toFixed(1)}%`);
});
main.addEventListener('pointerleave', () => { resetTilt(tiltCard); tiltCard = null; });

// ---------------------------------------------------------------------------
// Eventos gerais
// ---------------------------------------------------------------------------

function updateNavBg() {
  const hero = $('#hero');
  const overHero = !!hero && window.scrollY < hero.offsetHeight - 80;
  $('#nav').classList.toggle('over-hero', overHero);
  $('#nav').classList.toggle('scrolled', !overHero && (window.scrollY > 4 || currentHash() !== 'inicio'));
}
window.addEventListener('scroll', updateNavBg, { passive: true });

document.addEventListener('click', async (e) => {
  const el = e.target.closest('[data-action], [data-play], [data-fav], [data-slide], [data-slide-step], [data-scroll], [data-sort], [data-suggest], [data-movie], .card[data-id]');
  if (!el) return;

  if (el.dataset.movie) return openMovie(el.dataset.movie);
  if (el.matches('.card[data-id]')) {
    const row = el.closest('[data-list]');
    const playlist = row ? row.dataset.list.split('|') : state.grid.list.map((c) => c.id);
    return openChannel(el.dataset.id, playlist);
  }
  if (el.dataset.play) return openChannel(el.dataset.play, el.dataset.list ? el.dataset.list.split('|') : [el.dataset.play]);
  if (el.dataset.fav) return toggleFav(el.dataset.fav);
  if (el.dataset.slide) { showSlide(Number(el.dataset.slide)); return startHero(); }
  if (el.dataset.slideStep) { showSlide(state.hero.idx + Number(el.dataset.slideStep)); return startHero(); }
  if (el.dataset.scroll) {
    const sc = $('.shelf-scroll', el.closest('.shelf'));
    return sc.scrollBy({ left: Number(el.dataset.scroll) * sc.clientWidth * 0.85, behavior: 'smooth' });
  }
  if (el.dataset.sort) { state.sort = el.dataset.sort; return route(); }
  if (el.dataset.suggest) {
    state.query = el.dataset.suggest;
    $('#searchInput').value = state.query;
    return updateSearchResults();
  }

  const action = el.dataset.action;
  if (action === 'open-connect') openConnect();
  else if (action === 'pick-url') renderConnect(el.dataset.url);
  else if (action === 'copy-url') toast((await copyText(el.dataset.url)) ? 'Endereço copiado' : 'Não foi possível copiar');
  else if (action === 'hide-hero-qr') {
    store.set('hideHeroQr', true);
    el.closest('.connect-strip').remove();
    toast('O QR code continua no ícone do celular, no topo');
  }
});

// Busca
let searchTimer;
main.addEventListener('input', (e) => {
  if (e.target.id !== 'searchInput') return;
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim();
    updateSearchResults();
  }, 200);
});
main.addEventListener('click', (e) => {
  if (!e.target.closest('#searchClear')) return;
  e.preventDefault();
  state.query = '';
  $('#searchInput').value = '';
  $('#searchInput').focus();
  updateSearchResults();
});

// País
function updateCountryFlag() {
  const c = state.countries.get(state.country);
  $('#countryFlag').textContent = state.country && c ? c.flag || '🏳️' : '🌍';
}
$('#country').addEventListener('change', (e) => {
  state.country = e.target.value;
  store.set('country', state.country);
  updateCountryFlag();
  route();
});

window.addEventListener('hashchange', () => route());

// Ajustes e celular
const OPT_MAP = { optProxy: 'proxy', optHd: 'hd', optExtra: 'extra', optNsfw: 'nsfw', optLive: 'livePreviews', optHeroVideo: 'heroVideo' };

function applyTheme() {
  const t = ['light', 'dark', 'auto'].includes(state.settings.theme) ? state.settings.theme : 'light';
  document.documentElement.dataset.theme = t;
  const dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  $('meta[name="theme-color"]').setAttribute('content', dark ? '#000000' : '#f5f5f7');
  $$('#themeSeg button').forEach((b) => {
    b.classList.toggle('on', b.dataset.themeOpt === t);
    b.setAttribute('aria-checked', String(b.dataset.themeOpt === t));
  });
}
applyTheme();
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyTheme);
$('#themeSeg').addEventListener('click', (e) => {
  const b = e.target.closest('[data-theme-opt]');
  if (!b) return;
  state.settings.theme = b.dataset.themeOpt;
  saveSettings();
  applyTheme();
});
$('#connectBtn').addEventListener('click', openConnect);
$('#closeConnect').addEventListener('click', () => closeSheet('#connect'));
$('#settingsBtn').addEventListener('click', () => {
  for (const [el, key] of Object.entries(OPT_MAP)) $('#' + el).checked = !!state.settings[key];
  $('#catalogInfo').textContent = state.updatedAt ? `Atualizado em ${new Date(state.updatedAt).toLocaleString('pt-BR')}` : '';
  openSheet('#settings');
});
$('#closeSettings').addEventListener('click', () => closeSheet('#settings'));
$('#movieSheet').addEventListener('click', (e) => { if (e.target.closest('[data-close-sheet]')) closeSheet('#movieSheet'); });
$$('.sheet').forEach((s) => s.addEventListener('click', (e) => { if (e.target === s) closeSheet('#' + s.id); }));
for (const [el, key] of Object.entries(OPT_MAP)) {
  $('#' + el).addEventListener('change', (e) => {
    state.settings[key] = e.target.checked;
    saveSettings();
    if (key === 'heroVideo') return e.target.checked ? scheduleHeroVideo() : stopHeroVideo();
    if (key === 'livePreviews' && !e.target.checked) { thumbs.queue.length = 0; thumbs.queued.clear(); }
    if (key !== 'proxy') route(true);
  });
}
$('#refreshBtn').addEventListener('click', async () => {
  const btn = $('#refreshBtn');
  btn.disabled = true;
  btn.textContent = 'Atualizando…';
  try {
    const r = await fetch('api/refresh', { method: 'POST' });
    if (!r.ok) throw new Error();
    await loadCatalog();
    toast('Catálogo atualizado');
    $('#catalogInfo').textContent = `Atualizado em ${new Date(state.updatedAt).toLocaleString('pt-BR')}`;
  } catch {
    toast('Falha ao atualizar o catálogo');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Atualizar catálogo agora';
  }
});

// ---------------------------------------------------------------------------
// Inicialização
// ---------------------------------------------------------------------------

async function loadCatalog() {
  const res = await fetch('api/catalog');
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const data = await res.json();

  state.updatedAt = data.updatedAt;
  state.categories = data.categories;
  state.countries = new Map(data.countries.map((c) => {
    let name = c.name;
    if (regionNames) {
      try {
        const pt = regionNames.of(c.code === 'UK' ? 'GB' : c.code);
        if (pt && pt !== c.code) name = pt;
      } catch { /* código desconhecido */ }
    }
    return [c.code, { name, flag: c.flag }];
  }));
  state.channels = data.channels;
  state.byId = new Map();
  for (const ch of state.channels) {
    ch._s = norm(`${ch.n} ${ch.w || ''} ${ch.id}`);
    state.byId.set(ch.id, ch);
  }

  // Lista de países (só os que têm canais), Brasil e Portugal no topo
  const counts = {};
  for (const ch of state.channels) if (ch.c) counts[ch.c] = (counts[ch.c] || 0) + 1;
  const codes = Object.keys(counts).sort((a, b) => countryName(a).localeCompare(countryName(b), 'pt-BR'));
  const top = ['BR', 'PT'].filter((c) => counts[c]);
  const opt = (c) => `<option value="${c}">${esc(countryName(c))}</option>`;
  $('#country').innerHTML = '<option value="">Todos os países</option>' +
    top.map(opt).join('') + '<option disabled>──────────</option>' +
    codes.filter((c) => !top.includes(c)).map(opt).join('');
  if (state.country && !counts[state.country]) state.country = '';
  $('#country').value = state.country;
  updateCountryFlag();

  route();
}

// No PC, busca os endereços de rede antes de desenhar a página inicial (para o QR code)
loadHackers();
(IS_LOCAL_PC ? loadInfo() : Promise.resolve()).then(() => loadCatalog()).catch((err) => {
  console.error(err);
  main.innerHTML = `<div class="page">${emptyHtml('Não foi possível carregar os canais',
    'Verifique sua conexão com a internet e se o JOWTV está rodando no computador (janela preta aberta).')}
    <div style="text-align:center"><button class="btn-play" onclick="location.reload()">Tentar novamente</button></div></div>`;
});
