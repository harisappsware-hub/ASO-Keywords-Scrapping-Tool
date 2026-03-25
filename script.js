/**
 * KeywordSpy ASO — script.js
 * Pure HTML + CSS + JS — No backend, no Node.js, no Python
 * Works on GitHub Pages / Netlify / any static hosting
 *
 * HOW IT WORKS:
 * Browser cannot directly call play.google.com (CORS block)
 * So we use FREE public CORS proxy services as middlemen:
 *   allorigins.win       → fetches Play Store page for us
 *   corsproxy.io         → backup proxy
 *   thingproxy.freeboard → second backup
 * These are 100% free, no signup, no API key needed.
 */

'use strict';

/* ============================================================
   STOPWORDS — words that are NOT keywords
   ============================================================ */
const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for','of',
  'with','by','from','up','about','into','is','are','was','were',
  'be','been','being','have','has','had','do','does','did','will',
  'would','could','should','may','might','can','not','no','so',
  'if','as','than','then','when','where','how','all','any','just',
  'now','also','very','get','got','make','use','our','your','its',
  'this','that','these','those','we','you','they','it','he','she',
  'my','his','her','their','what','which','who','more','most',
  'some','only','same','new','free','best','app','apps','google',
  'android','play','store','com','www','download','install','easy',
  'fast','great','good','top','user','users','phone','device','one',
  'way','amp','quot','apos','nbsp','data','click','tap','open',
  'see','go','let','set','add','find','need','want','give','keep',
]);

/* ============================================================
   UTILITY FUNCTIONS
   ============================================================ */

/** Extract package ID from Play Store URL or raw package name */
function extractPackageId(input) {
  input = input.trim();
  // Raw package name like com.spotify.music
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*)+$/.test(input)) {
    return input;
  }
  // From URL: ?id=com.xxx.yyy
  const m = input.match(/[?&]id=([a-zA-Z0-9._]+)/);
  return m ? m[1] : null;
}

/** Strip all HTML tags and decode entities */
function stripHtml(str) {
  if (!str) return '';
  return str
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/?[^>]+(>|$)/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Decode unicode escape sequences like \u0027 */
function decodeUnicode(str) {
  if (!str) return '';
  try {
    return str
      .replace(/\\u003c/gi, '<')
      .replace(/\\u003e/gi, '>')
      .replace(/\\u0027/gi, "'")
      .replace(/\\u0026/gi, '&')
      .replace(/\\u003d/gi, '=')
      .replace(/\\n/g, ' ')
      .replace(/\\r/g, ' ')
      .replace(/\\\//g, '/');
  } catch(e) { return str; }
}

/** Extract keywords from text — real words + bigrams */
function extractKeywords(text) {
  if (!text || text.length < 3) return [];

  const lower   = text.toLowerCase();
  const cleaned = lower.replace(/[^a-z0-9\s\-]/g, ' ').replace(/\s+/g, ' ').trim();
  const words   = cleaned.split(' ');

  const tokens = [];

  // Single words
  words.forEach(w => {
    const clean = w.replace(/^-+|-+$/g, '');
    if (clean.length >= 3 && !STOPWORDS.has(clean) && !/^\d+$/.test(clean)) {
      tokens.push({ term: clean, type: 'word' });
    }
  });

  // 2-word phrases (bigrams)
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].replace(/^-+|-+$/g, '');
    const w2 = words[i+1].replace(/^-+|-+$/g, '');
    if (
      w1.length >= 3 && w2.length >= 3 &&
      !STOPWORDS.has(w1) && !STOPWORDS.has(w2) &&
      !/^\d+$/.test(w1) && !/^\d+$/.test(w2)
    ) {
      tokens.push({ term: `${w1} ${w2}`, type: 'phrase' });
    }
  }

  return tokens;
}

/** Build keyword frequency map from all sources */
function buildKeywordMap(sources) {
  const map = {};

  function process(text, label) {
    if (!text) return;
    const tokens = extractKeywords(text);
    tokens.forEach(({ term, type }) => {
      if (!map[term]) map[term] = { term, freq: 0, sources: new Set(), type };
      map[term].freq++;
      map[term].sources.add(label);
      if (type === 'phrase') map[term].type = 'phrase';
    });
  }

  process(sources.title, 'title');
  process(sources.short, 'short');
  process(sources.long,  'long');

  return Object.values(map);
}

/* ============================================================
   PARSE PLAY STORE HTML
   Extracts real title, short desc, long desc from raw HTML
   ============================================================ */
function parsePlayStoreHTML(html) {
  if (!html || html.length < 200) throw new Error('Empty page received');

  const grab = (patterns) => {
    for (const re of patterns) {
      const m = html.match(re);
      if (m && m[1] && m[1].length > 1) return decodeUnicode(stripHtml(m[1]));
    }
    return '';
  };

  // TITLE
  let title = grab([
    /<title>([^<|]+)/i,
    /property="og:title"\s+content="([^"]+)"/i,
    /name="title"\s+content="([^"]+)"/i,
  ]);
  title = title.replace(/\s*[-–|]\s*Apps on Google Play.*/i, '').trim();

  // SHORT DESCRIPTION
  let shortDesc = grab([
    /name="description"\s+content="([^"]{10,300})"/i,
    /property="og:description"\s+content="([^"]{10,300})"/i,
  ]);

  // LONG DESCRIPTION — multiple patterns to catch Play Store's structure
  let longDesc = '';

  const jsonPatterns = [
    /"description":\{"defaultValue":\{"value":"([\s\S]{50,8000}?)"\}/,
    /"fullDescription":\{"defaultValue":\{"value":"([\s\S]{50,8000}?)"\}/,
    /,"description":"([\s\S]{80,8000}?)","translatedFromEnglish"/,
  ];

  for (const re of jsonPatterns) {
    const m = html.match(re);
    if (m && m[1] && m[1].length > 80) {
      longDesc = decodeUnicode(stripHtml(m[1]));
      break;
    }
  }

  if (!longDesc || longDesc.length < 50) {
    const m = html.match(/itemprop="description"[^>]*>([\s\S]{80,6000}?)<\/div>/i);
    if (m) longDesc = stripHtml(m[1]);
  }

  if (!longDesc || longDesc.length < 50) {
    const m = html.match(/data-g-id="description"[^>]*>([\s\S]{80,6000}?)<\/div>/i);
    if (m) longDesc = stripHtml(m[1]);
  }

  // ICON
  let icon = grab([
    /rel="icon"\s+href="([^"]+\.(?:png|jpg|jpeg|webp)[^"]*)"/i,
    /property="og:image"\s+content="([^"]+)"/i,
  ]);

  // DEVELOPER
  let developer = grab([
    /"author":\{"@type":"[^"]*","name":"([^"]+)"/i,
  ]);

  // RATING
  let rating = grab([
    /"starRating":([0-9.]+)/,
    /"rating":([0-9.]{3,5})[,}]/,
  ]);

  if (!title && !longDesc && !shortDesc) {
    throw new Error('Could not extract app data. Play Store may have changed its page structure. Try again.');
  }

  return { title, short: shortDesc, long: longDesc, icon, developer, rating };
}

/* ============================================================
   FETCH STRATEGIES — all free, no API key, no backend
   ============================================================ */

async function tryAllOrigins(packageId) {
  const playUrl = `https://play.google.com/store/apps/details?id=${packageId}&hl=en&gl=us`;
  const apiUrl  = `https://api.allorigins.win/get?url=${encodeURIComponent(playUrl)}`;

  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`allorigins HTTP ${res.status}`);

  const json = await res.json();
  if (!json.contents || json.contents.length < 500) throw new Error('allorigins returned empty content');

  return parsePlayStoreHTML(json.contents);
}

async function tryCorsproxy(packageId) {
  const playUrl = `https://play.google.com/store/apps/details?id=${packageId}&hl=en&gl=us`;
  const apiUrl  = `https://corsproxy.io/?${encodeURIComponent(playUrl)}`;

  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`corsproxy HTTP ${res.status}`);

  const html = await res.text();
  if (!html || html.length < 500) throw new Error('corsproxy returned empty content');

  return parsePlayStoreHTML(html);
}

async function tryThingproxy(packageId) {
  const playUrl = `https://play.google.com/store/apps/details?id=${packageId}&hl=en&gl=us`;
  const apiUrl  = `https://thingproxy.freeboard.io/fetch/${playUrl}`;

  const res = await fetch(apiUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`thingproxy HTTP ${res.status}`);

  const html = await res.text();
  if (!html || html.length < 500) throw new Error('thingproxy returned empty');

  return parsePlayStoreHTML(html);
}

/** Master function: try each proxy until one works */
async function fetchAppData(packageId, onStatus) {
  const strategies = [
    { label: 'Connecting via Proxy 1…',  fn: () => tryAllOrigins(packageId) },
    { label: 'Connecting via Proxy 2…',  fn: () => tryCorsproxy(packageId)  },
    { label: 'Connecting via Proxy 3…',  fn: () => tryThingproxy(packageId) },
  ];

  let lastError;
  for (const s of strategies) {
    try {
      onStatus(s.label);
      const result = await s.fn();
      if (result) return result;
    } catch (err) {
      console.warn(`[ASO] ${s.label} failed:`, err.message);
      lastError = err;
    }
  }

  throw new Error(
    'All proxy services failed. Possible reasons:\n' +
    '• Package ID does not exist on Play Store\n' +
    '• Proxy services temporarily busy — try again in 10 seconds\n' +
    '• Your network may be blocking these requests'
  );
}

/* ============================================================
   DOM ELEMENTS
   ============================================================ */
const appUrlInput    = document.getElementById('appUrl');
const scrapeBtn      = document.getElementById('scrapeBtn');
const btnText        = document.getElementById('btnText');
const clearBtn       = document.getElementById('clearBtn');
const loader         = document.getElementById('loader');
const loaderText     = document.getElementById('loaderText');
const errorBox       = document.getElementById('errorBox');
const errorMsg       = document.getElementById('errorMsg');
const retryBtn       = document.getElementById('retryBtn');
const resultsSection = document.getElementById('results');
const kwBody         = document.getElementById('kwBody');
const filterInput    = document.getElementById('filterInput');
const sortSelect     = document.getElementById('sortSelect');
const exportBtn      = document.getElementById('exportBtn');
const noRows         = document.getElementById('noRows');
const toggleRaw      = document.getElementById('toggleRaw');
const rawContent     = document.getElementById('rawContent');
const srcFilterBtns  = document.querySelectorAll('.src-filter');
const appIcon        = document.getElementById('appIcon');
const appTitleDisp   = document.getElementById('appTitle');
const appDev         = document.getElementById('appDev');
const appRating      = document.getElementById('appRating');
const statTitle      = document.getElementById('statTitle');
const statShort      = document.getElementById('statShort');
const statLong       = document.getElementById('statLong');
const statTotal      = document.getElementById('statTotal');
const rawTitleEl     = document.getElementById('rawTitle');
const rawShortEl     = document.getElementById('rawShort');
const rawLongEl      = document.getElementById('rawLong');

/* ============================================================
   STATE
   ============================================================ */
let allKeywords  = [];
let activeSource = 'all';

/* ============================================================
   RENDER TABLE
   ============================================================ */
function escHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function renderTable() {
  const filterText = filterInput.value.toLowerCase().trim();
  const sort       = sortSelect.value;

  let data = allKeywords.filter(kw => {
    const textOk = !filterText || kw.term.includes(filterText);
    const srcOk  = activeSource === 'all' || kw.sources.has(activeSource);
    return textOk && srcOk;
  });

  if (sort === 'freq')  data.sort((a, b) => b.freq - a.freq);
  if (sort === 'alpha') data.sort((a, b) => a.term.localeCompare(b.term));
  if (sort === 'len')   data.sort((a, b) => b.term.length - a.term.length);

  kwBody.innerHTML = '';

  if (!data.length) {
    noRows.classList.remove('hidden');
    return;
  }
  noRows.classList.add('hidden');

  data.forEach((kw, idx) => {
    const srcTags = [...kw.sources].map(src => {
      const cls   = src === 'title' ? 'src-tag-title' : src === 'short' ? 'src-tag-short' : 'src-tag-long';
      const label = src === 'title' ? 'Title'         : src === 'short' ? 'Short Desc'     : 'Long Desc';
      return `<span class="src-tag ${cls}">${label}</span>`;
    }).join('');

    const typeCls   = kw.type === 'phrase' ? 'type-phrase' : 'type-single';
    const typeLabel = kw.type === 'phrase' ? 'Phrase'      : 'Word';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-num">${idx + 1}</td>
      <td class="td-kw">${escHtml(kw.term)}</td>
      <td><div class="source-tags">${srcTags}</div></td>
      <td class="td-freq">${kw.freq}×</td>
      <td class="td-len">${kw.term.length}</td>
      <td><span class="type-badge ${typeCls}">${typeLabel}</span></td>
    `;
    kwBody.appendChild(tr);
  });
}

/* ============================================================
   UPDATE META / STATS / RAW TEXT
   ============================================================ */
function updateMeta(d) {
  appTitleDisp.textContent = d.title     || 'Unknown App';
  appDev.textContent       = d.developer ? `by ${d.developer}` : '';
  appRating.textContent    = d.rating    ? `⭐ ${parseFloat(d.rating).toFixed(1)}` : '⭐ —';

  if (d.icon) {
    appIcon.src = d.icon;
    appIcon.style.display = 'block';
  } else {
    appIcon.style.display = 'none';
  }
}

function updateStats(keywords, sources) {
  statTitle.textContent = keywords.filter(k => k.sources.has('title')).length;
  statShort.textContent = keywords.filter(k => k.sources.has('short')).length;
  statLong.textContent  = keywords.filter(k => k.sources.has('long')).length;
  statTotal.textContent = keywords.length;

  rawTitleEl.textContent = sources.title || '(not found)';
  rawShortEl.textContent = sources.short || '(not found)';
  rawLongEl.textContent  = sources.long
    ? sources.long.slice(0, 800) + (sources.long.length > 800 ? '…' : '')
    : '(not found)';
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
function exportCSV() {
  if (!allKeywords.length) return;
  const rows = allKeywords.map(k =>
    [`"${k.term}"`, k.type, k.freq, `"${[...k.sources].join('+')}"`, k.term.length].join(',')
  );
  const csv  = ['Keyword,Type,Frequency,Found In,Char Length', ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `${extractPackageId(appUrlInput.value) || 'app'}_keywords.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   MAIN SCRAPE HANDLER
   ============================================================ */
async function handleScrape() {
  const input = appUrlInput.value.trim();

  if (!input) {
    appUrlInput.focus();
    appUrlInput.style.outline = '2px solid var(--red)';
    setTimeout(() => { appUrlInput.style.outline = ''; }, 1500);
    return;
  }

  const packageId = extractPackageId(input);
  if (!packageId) {
    showError('❌ Invalid URL or package name.\n\nExamples:\nhttps://play.google.com/store/apps/details?id=com.spotify.music\ncom.spotify.music');
    return;
  }

  // Reset UI
  errorBox.classList.add('hidden');
  resultsSection.classList.add('hidden');
  loader.classList.remove('hidden');
  scrapeBtn.disabled  = true;
  btnText.textContent = 'Scraping…';

  try {
    const appData = await fetchAppData(packageId, msg => {
      loaderText.textContent = msg;
    });

    const sources  = { title: appData.title, short: appData.short, long: appData.long };
    const keywords = buildKeywordMap(sources);
    keywords.sort((a, b) => b.freq - a.freq);
    allKeywords = keywords;

    // Reset controls
    filterInput.value = '';
    sortSelect.value  = 'freq';
    activeSource      = 'all';
    srcFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.src === 'all'));

    updateMeta(appData);
    updateStats(keywords, sources);
    renderTable();

    loader.classList.add('hidden');
    resultsSection.classList.remove('hidden');
    resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  } catch (err) {
    console.error('[ASO] Error:', err);
    loader.classList.add('hidden');
    showError(err.message);
  } finally {
    scrapeBtn.disabled  = false;
    btnText.textContent = 'Extract Keywords';
  }
}

function showError(msg) {
  errorMsg.textContent = msg;
  errorBox.classList.remove('hidden');
}

/* ============================================================
   EVENT LISTENERS
   ============================================================ */
scrapeBtn.addEventListener('click', handleScrape);
appUrlInput.addEventListener('keydown', e => { if (e.key === 'Enter') handleScrape(); });
clearBtn.addEventListener('click', () => { appUrlInput.value = ''; appUrlInput.focus(); });

document.querySelectorAll('.ex-link').forEach(btn => {
  btn.addEventListener('click', () => {
    appUrlInput.value = btn.dataset.url;
    handleScrape();
  });
});

filterInput.addEventListener('input', renderTable);
sortSelect.addEventListener('change', renderTable);

srcFilterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    activeSource = btn.dataset.src;
    srcFilterBtns.forEach(b => b.classList.toggle('active', b === btn));
    renderTable();
  });
});

exportBtn.addEventListener('click', exportCSV);
retryBtn.addEventListener('click', () => { errorBox.classList.add('hidden'); handleScrape(); });

toggleRaw.addEventListener('click', () => {
  const hidden = rawContent.classList.toggle('hidden');
  toggleRaw.textContent = hidden ? 'Show' : 'Hide';
});
