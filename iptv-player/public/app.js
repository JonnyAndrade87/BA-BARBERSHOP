/* IPTV Player — interface */
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
// Abas principais (as demais categorias ficam em "Categorias")
const MAIN_TABS = ['movies', 'series', 'sports', 'kids', 'news', 'music', 'documentary'];
// Fileiras da página inicial
const HOME_ROWS = ['movies', 'series', 'sports', 'news', 'kids', 'animation', 'music', 'documentary',
  'comedy', 'entertainment', 'classic', 'culture'];

const PAGE_SIZE = 60;
const ROW_SIZE = 30;
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
  settings: Object.assign({ proxy: true, hd: false, extra: false, nsfw: false }, store.get('settings', {})),
  favs: new Set(store.get('favs', [])),
  recent: store.get('recent', []),
  country: store.get('country', ''),
  query: '',
  sort: 'az',
  grid: { list: [], pos: 0 },
  playlist: [], // ids para navegar entre canais no player
};

const $ = (s, el = document) => el.querySelector(s);
const main = $('#main');

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const fmt = (n) => n.toLocaleString('pt-BR');
const catName = (id) => CATEGORY_PT[id] || (state.categories.find((c) => c.id === id) || {}).name || id;
const qualityNum = (q) => (q ? parseInt(q, 10) || 0 : 0);
const bestQuality = (ch) => ch.s.reduce((m, s) => Math.max(m, qualityNum(s.q)), 0);

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
function logoHtml(ch) {
  const ini = `<span class="initials" style="color:hsl(${hueFor(ch.n)} 80% 70%)">${esc(initials(ch.n))}</span>`;
  if (!ch.g) return ini;
  return `<img src="${esc(ch.g)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" data-ini="${esc(initials(ch.n))}" data-hue="${hueFor(ch.n)}">`;
}
// Logo quebrado -> iniciais
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG' || !img.dataset.ini) return;
  const span = document.createElement('span');
  span.className = 'initials';
  span.style.color = `hsl(${img.dataset.hue} 80% 70%)`;
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

function rank(a, b) {
  // canais com logo e melhor qualidade primeiro
  return (b.g ? 1 : 0) - (a.g ? 1 : 0) || bestQuality(b) - bestQuality(a) || a.n.localeCompare(b.n, 'pt-BR');
}

function sortList(list) {
  const l = list.slice();
  if (state.sort === 'az') l.sort((a, b) => a.n.localeCompare(b.n, 'pt-BR', { sensitivity: 'base' }));
  else if (state.sort === 'quality') l.sort((a, b) => bestQuality(b) - bestQuality(a) || a.n.localeCompare(b.n, 'pt-BR'));
  else if (state.sort === 'country') l.sort((a, b) => countryLabel(a.c).localeCompare(countryLabel(b.c), 'pt-BR') || a.n.localeCompare(b.n, 'pt-BR'));
  return l;
}

// ---------------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------------

function cardHtml(ch) {
  const q = bestQuality(ch);
  const meta = [ch.c ? countryLabel(ch.c) : '', catName(ch.k[0])].filter(Boolean).join(' · ');
  return `<button class="card" data-id="${esc(ch.id)}" title="${esc(ch.n)}">
    <div class="thumb">${logoHtml(ch)}</div>
    ${state.favs.has(ch.id) ? '<span class="fav">★</span>' : ''}
    ${q >= 720 ? `<span class="badge">${q >= 2160 ? '4K' : q >= 1080 ? 'FHD' : 'HD'}</span>` : ''}
    <div class="body"><div class="name">${esc(ch.n)}</div><div class="meta">${esc(meta)}</div></div>
  </button>`;
}

function renderTabs(active) {
  const tabs = [['inicio', 'Início'], ['todos', 'Ao vivo']]
    .concat(MAIN_TABS.map((k) => ['cat-' + k, catName(k)]))
    .concat([['categorias', 'Categorias'], ['favoritos', '★ Favoritos']]);
  $('#tabs').innerHTML = tabs
    .map(([h, label]) => `<a href="#${h}" class="${h === active ? 'active' : ''}">${esc(label)}</a>`)
    .join('');
  const el = $('#tabs .active');
  if (el) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

function rowHtml(title, list, link, count) {
  if (!list.length) return '';
  return `<section class="row">
    <div class="row-head"><h2>${title}${count ? ` <small>${fmt(count)} canais</small>` : ''}</h2>${link ? `<a href="#${link}">Ver tudo ›</a>` : ''}</div>
    <div class="row-scroll" data-list="${esc(list.map((c) => c.id).join('|'))}">${list.map(cardHtml).join('')}</div>
  </section>`;
}

function renderHome() {
  const vis = state.channels.filter((c) => visible(c));
  const countries = new Set(vis.map((c) => c.c).filter(Boolean));
  let html = `<section class="hero">
    <h1>${state.country ? `TV ao vivo · ${esc(countryLabel(state.country))}` : 'TV ao vivo do mundo inteiro'}</h1>
    <p>Canais abertos de TV ao vivo do projeto iptv-org: filmes, séries, esportes, notícias, infantil e muito mais. Clique em um canal para assistir.</p>
    <div class="stats">
      <div><b>${fmt(vis.length)}</b><span>canais</span></div>
      <div><b>${fmt(countries.size)}</b><span>países</span></div>
      <div><b>${fmt(vis.filter((c) => c.k.includes('movies')).length)}</b><span>canais de filmes</span></div>
      <div><b>${fmt(vis.filter((c) => c.k.includes('sports')).length)}</b><span>canais de esportes</span></div>
    </div>
  </section>`;

  const recent = state.recent.map((id) => state.byId.get(id)).filter((c) => c && visible(c));
  html += rowHtml('Assistidos recentemente', recent.slice(0, ROW_SIZE), 'recentes');
  const favs = [...state.favs].map((id) => state.byId.get(id)).filter((c) => c && visible(c));
  html += rowHtml('★ Seus favoritos', favs.slice(0, ROW_SIZE), 'favoritos');

  if (!state.country) {
    const br = vis.filter((c) => c.c === 'BR').sort(rank);
    html += rowHtml('🇧🇷 Canais do Brasil', br.slice(0, ROW_SIZE), 'pais-BR', br.length);
    const pt = vis.filter((c) => c.c === 'PT').sort(rank);
    html += rowHtml('🇵🇹 Canais de Portugal', pt.slice(0, ROW_SIZE), 'pais-PT', pt.length);
  }

  for (const k of HOME_ROWS) {
    const list = vis.filter((c) => c.k.includes(k)).sort(rank);
    html += rowHtml(`${CATEGORY_ICON[k] || ''} ${esc(catName(k))}`, list.slice(0, ROW_SIZE), 'cat-' + k, list.length);
  }
  if (!vis.length) html += emptyHtml();
  main.innerHTML = html;
  window.scrollTo(0, 0);
}

function renderCategories() {
  const vis = state.channels.filter((c) => visible(c));
  const counts = {};
  for (const c of vis) for (const k of c.k) counts[k] = (counts[k] || 0) + 1;
  const cats = Object.keys(counts).sort((a, b) => counts[b] - counts[a]);
  main.innerHTML = `<div class="page-head"><h1>Categorias</h1></div>
    <div class="grid">${cats.map((k) => `<a class="card" href="#cat-${k}" style="text-decoration:none;color:inherit">
      <div class="thumb"><span style="font-size:44px">${CATEGORY_ICON[k] || '📡'}</span></div>
      <div class="body"><div class="name">${esc(catName(k))}</div><div class="meta">${fmt(counts[k])} canais</div></div>
    </a>`).join('')}</div>`;
  window.scrollTo(0, 0);
}

function emptyHtml(msg) {
  return `<div class="empty"><b>Nenhum canal encontrado</b>${msg || 'Tente outro país, outra busca ou ajuste as configurações.'}</div>`;
}

let gridObserver;
function renderGrid(title, list, opts = {}) {
  const sorted = opts.keepOrder ? list : sortList(list);
  state.grid = { list: sorted, pos: 0 };
  const sortChips = opts.keepOrder ? '' : `<div class="chips">
      ${[['az', 'A–Z'], ['quality', 'Melhor qualidade'], ['country', 'País']]
        .map(([v, l]) => `<button class="chip ${state.sort === v ? 'active' : ''}" data-sort="${v}">${l}</button>`).join('')}
    </div>`;
  main.innerHTML = `<div class="page-head"><h1>${title} <small>${fmt(sorted.length)} canais</small></h1>${sortChips}</div>
    ${sorted.length ? '<div class="grid" id="grid"></div><div class="sentinel" id="sentinel"></div>' : emptyHtml(opts.empty)}`;
  window.scrollTo(0, 0);
  if (!sorted.length) return;
  if (gridObserver) gridObserver.disconnect();
  appendGrid();
  const sentinel = $('#sentinel');
  if (!sentinel) return; // tudo já coube na primeira página
  gridObserver = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting)) appendGrid();
  }, { rootMargin: '800px' });
  gridObserver.observe(sentinel);
}

function appendGrid() {
  const g = state.grid;
  const grid = $('#grid');
  if (!grid || g.pos >= g.list.length) return;
  const slice = g.list.slice(g.pos, g.pos + PAGE_SIZE);
  g.pos += slice.length;
  grid.insertAdjacentHTML('beforeend', slice.map(cardHtml).join(''));
  if (g.pos >= g.list.length) $('#sentinel')?.remove();
}

// ---------------------------------------------------------------------------
// Rotas (hash)
// ---------------------------------------------------------------------------

function route() {
  if (!state.channels.length) return;
  const hash = decodeURIComponent(location.hash.slice(1)) || 'inicio';

  if (state.query) {
    renderTabs('');
    const q = norm(state.query);
    const list = state.channels.filter((c) => visible(c) && c._s.includes(q));
    // resultados que começam com o termo aparecem primeiro
    list.sort((a, b) => (norm(b.n).startsWith(q) ? 1 : 0) - (norm(a.n).startsWith(q) ? 1 : 0) || a.n.localeCompare(b.n, 'pt-BR'));
    return renderGrid(`Resultados para “${esc(state.query)}”`, list, { keepOrder: true });
  }

  renderTabs(hash);
  const vis = () => state.channels.filter((c) => visible(c));
  if (hash === 'inicio') return renderHome();
  if (hash === 'todos') return renderGrid('Todos os canais ao vivo', vis());
  if (hash === 'categorias') return renderCategories();
  if (hash === 'favoritos') {
    const list = [...state.favs].map((id) => state.byId.get(id)).filter((c) => c && visible(c));
    return renderGrid('★ Favoritos', list, { empty: 'Abra um canal e toque em “Favoritar” para salvá-lo aqui.' });
  }
  if (hash === 'recentes') {
    const list = state.recent.map((id) => state.byId.get(id)).filter((c) => c && visible(c));
    return renderGrid('Assistidos recentemente', list, { keepOrder: true });
  }
  if (hash.startsWith('cat-')) {
    const k = hash.slice(4);
    return renderGrid(`${CATEGORY_ICON[k] || ''} ${esc(catName(k))}`, vis().filter((c) => c.k.includes(k)));
  }
  if (hash.startsWith('pais-')) {
    const code = hash.slice(5);
    const list = state.channels.filter((c) => c.c === code && visible(c, true));
    return renderGrid(esc(countryLabel(code)), list);
  }
  location.hash = 'inicio';
}

// ---------------------------------------------------------------------------
// Player
// ---------------------------------------------------------------------------

const video = $('#video');
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

function setStatus(msg) { $('#videoStatus').innerHTML = msg || ''; }

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
  player.ch = ch;
  player.failed = new Set();
  $('#player').hidden = false;
  document.body.style.overflow = 'hidden';

  $('#piLogo').innerHTML = logoHtml(ch);
  $('#piName').textContent = ch.n;
  $('#piMeta').textContent = [ch.c ? countryLabel(ch.c) : '', ch.k.map(catName).join(', '), ch.w || '']
    .filter(Boolean).join(' · ');
  updateFavBtn();

  state.recent = [id, ...state.recent.filter((x) => x !== id)].slice(0, 40);
  store.set('recent', state.recent);

  const hasNav = state.playlist.length > 1;
  $('#prevCh').hidden = $('#nextCh').hidden = !hasNav;
  playSource(0);
}

function renderSources() {
  const ch = player.ch;
  $('#sources').innerHTML = ch.s.map((s, i) => {
    const labels = (s.l || []).map((l) => (l === 'Geo-blocked' ? 'Bloqueio regional' : l === 'Not 24/7' ? 'Não é 24h' : l));
    return `<button class="source ${i === player.idx ? 'active' : ''} ${player.failed.has(i) ? 'failed' : ''}" data-src="${i}">
      <span>Fonte ${i + 1}${s.q ? ` · ${esc(s.q)}` : ''}</span>
      <small>${esc(labels.join(', ') || (i === player.idx ? 'tocando' : ''))}</small>
    </button>`;
  }).join('');
}

function playSource(i) {
  const ch = player.ch;
  stopPlayback();
  if (i >= ch.s.length) {
    renderSources();
    setStatus('😕 Nenhuma fonte deste canal respondeu agora.<br><small>Pode estar fora do ar ou bloqueado no seu país. Tente mais tarde ou outro canal.</small>');
    return;
  }
  player.idx = i;
  player.mode = 'hls';
  renderSources();
  setStatus('Conectando...');
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
      if (err.name === 'NotAllowedError') setStatus('▶ Toque no play para começar');
    });
  }
}

video.addEventListener('playing', () => { clearTimeout(player.watchdog); setStatus(''); });
video.addEventListener('waiting', () => { if (!video.paused) setStatus('Carregando...'); });
video.addEventListener('error', () => {
  if (player.mode === 'native' && player.ch && !$('#player').hidden && video.getAttribute('src')) fail('erro nativo');
});

function closePlayer() {
  stopPlayback();
  setStatus('');
  $('#player').hidden = true;
  document.body.style.overflow = '';
  if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  if (!state.query && (location.hash === '' || location.hash === '#inicio')) renderHome(); // atualiza "recentes"
}

function stepChannel(dir) {
  const list = state.playlist;
  if (list.length < 2 || !player.ch) return;
  const i = list.indexOf(player.ch.id);
  const next = list[(i + dir + list.length) % list.length];
  openChannel(next);
}

function updateFavBtn() {
  const on = state.favs.has(player.ch.id);
  $('#favBtn').textContent = on ? '★ Favorito' : '☆ Favoritar';
}

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
// Eventos
// ---------------------------------------------------------------------------

main.addEventListener('click', (e) => {
  const sortBtn = e.target.closest('[data-sort]');
  if (sortBtn) {
    state.sort = sortBtn.dataset.sort;
    return route();
  }
  const card = e.target.closest('button.card[data-id]');
  if (!card) return;
  const row = card.closest('[data-list]');
  const playlist = row ? row.dataset.list.split('|') : state.grid.list.map((c) => c.id);
  openChannel(card.dataset.id, playlist);
});

$('#sources').addEventListener('click', (e) => {
  const b = e.target.closest('[data-src]');
  if (!b) return;
  player.failed.delete(Number(b.dataset.src));
  playSource(Number(b.dataset.src));
});
$('#closePlayer').addEventListener('click', closePlayer);
$('#player').addEventListener('click', (e) => { if (e.target.id === 'player') closePlayer(); });
$('#prevCh').addEventListener('click', () => stepChannel(-1));
$('#nextCh').addEventListener('click', () => stepChannel(1));
$('#favBtn').addEventListener('click', () => {
  const id = player.ch.id;
  if (state.favs.has(id)) { state.favs.delete(id); toast('Removido dos favoritos'); }
  else { state.favs.add(id); toast('Adicionado aos favoritos ★'); }
  store.set('favs', [...state.favs]);
  updateFavBtn();
  document.querySelectorAll(`.card[data-id="${CSS.escape(id)}"]`).forEach((el) => el.outerHTML = cardHtml(player.ch));
});
$('#copyBtn').addEventListener('click', async () => {
  const ok = await copyText(player.ch.s[player.idx].u);
  toast(ok ? 'Link copiado! Cole no VLC em “Abrir fluxo de rede”.' : 'Não foi possível copiar o link');
});

document.addEventListener('keydown', (e) => {
  const inPlayer = !$('#player').hidden;
  if (e.key === 'Escape') {
    if (!$('#settings').hidden) $('#settings').hidden = true;
    else if (inPlayer && !document.fullscreenElement) closePlayer();
    return;
  }
  if (!inPlayer || e.target.tagName === 'INPUT') return;
  if (e.key === 'ArrowRight' || e.key === 'ChannelUp' || e.key === 'PageUp') { e.preventDefault(); stepChannel(1); }
  else if (e.key === 'ArrowLeft' || e.key === 'ChannelDown' || e.key === 'PageDown') { e.preventDefault(); stepChannel(-1); }
  else if (e.key === 'f' || e.key === 'F') {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else video.requestFullscreen?.().catch(() => {});
  }
});

let searchTimer;
$('#search').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    state.query = e.target.value.trim();
    route();
  }, 220);
});

$('#country').addEventListener('change', (e) => {
  state.country = e.target.value;
  store.set('country', state.country);
  route();
});

window.addEventListener('hashchange', () => {
  if (state.query) { state.query = ''; $('#search').value = ''; }
  route();
});

// Configurações
const OPT_MAP = { optProxy: 'proxy', optHd: 'hd', optExtra: 'extra', optNsfw: 'nsfw' };
$('#settingsBtn').addEventListener('click', () => {
  for (const [el, key] of Object.entries(OPT_MAP)) $('#' + el).checked = !!state.settings[key];
  $('#catalogInfo').textContent = state.updatedAt
    ? `Catálogo de ${new Date(state.updatedAt).toLocaleString('pt-BR')}` : '';
  $('#settings').hidden = false;
});
$('#closeSettings').addEventListener('click', () => { $('#settings').hidden = true; });
$('#settings').addEventListener('click', (e) => { if (e.target.id === 'settings') $('#settings').hidden = true; });
for (const [el, key] of Object.entries(OPT_MAP)) {
  $('#' + el).addEventListener('change', (e) => {
    state.settings[key] = e.target.checked;
    saveSettings();
    if (key !== 'proxy') route();
  });
}
$('#refreshBtn').addEventListener('click', async () => {
  const btn = $('#refreshBtn');
  btn.disabled = true;
  btn.textContent = 'Atualizando...';
  try {
    const r = await fetch('api/refresh', { method: 'POST' });
    if (!r.ok) throw new Error();
    await loadCatalog();
    toast('Catálogo atualizado!');
    $('#catalogInfo').textContent = `Catálogo de ${new Date(state.updatedAt).toLocaleString('pt-BR')}`;
  } catch {
    toast('Falha ao atualizar o catálogo');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Atualizar catálogo';
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
  const codes = Object.keys(counts).sort((a, b) =>
    state.countries.get(a)?.name.localeCompare(state.countries.get(b)?.name || b, 'pt-BR') ?? 0);
  const top = ['BR', 'PT'].filter((c) => counts[c]);
  const opt = (c) => `<option value="${c}">${esc(countryLabel(c))} (${counts[c]})</option>`;
  $('#country').innerHTML = '<option value="">🌍 Todos os países</option>' +
    top.map(opt).join('') + '<option disabled>──────────</option>' +
    codes.filter((c) => !top.includes(c)).map(opt).join('');
  if (state.country && !counts[state.country]) state.country = '';
  $('#country').value = state.country;

  route();
}

loadCatalog().catch((err) => {
  console.error(err);
  main.innerHTML = `<div class="empty"><b>Não foi possível carregar os canais</b>
    Verifique sua conexão com a internet e se o servidor (<code>node server.js</code>) está rodando.<br><br>
    <button class="btn" onclick="location.reload()">Tentar novamente</button></div>`;
});
