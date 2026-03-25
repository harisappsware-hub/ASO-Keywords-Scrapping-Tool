/**
 * KeywordSpy ASO — script.js
 * ─────────────────────────────────────────────────────────────
 * REAL keyword scraper for Google Play Store apps.
 *
 * HOW IT WORKS:
 * 1. User pastes a Play Store URL
 * 2. We extract the package ID (e.g. com.spotify.music)
 * 3. We try multiple free APIs to fetch real app metadata
 * 4. We parse the REAL title, short desc, long desc
 * 5. We extract & count REAL keywords from that text
 * 6. We display results with source tagging
 *
 * API CHAIN (tries each until one works):
 *  A) gplayapi.cashlessconsumer.in  — free unofficial JSON API
 *  B) api.allorigins.win            — CORS proxy → scrape HTML
 *  C) corsproxy.io                  — backup CORS proxy
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

/* ============================================================
   STOPWORDS — common words that are NOT keywords
   ============================================================ */
const STOPWORDS = new Set([
  'a','an','the','and','or','but','in','on','at','to','for',
  'of','with','by','from','up','about','into','through','during',
  'is','are','was','were','be','been','being','have','has','had',
  'do','does','did','will','would','could','should','may','might',
  'shall','can','need','dare','ought','used','i','you','he','she',
  'we','they','it','me','him','her','us','them','my','your','his',
  'its','our','their','this','that','these','those','what','which',
  'who','not','no','so','if','as','than','then','when','where',
  'how','all','any','both','each','few','more','most','other',
  'some','such','only','own','same','just','now','also','very',
  'get','got','make','made','use','using','using','available',
  'new','free','best','app','apps','play','google','android',
  'download','install','easy','fast','great','good','top','amp',
  'your','our','its','their','you','can','will','one','way',
  'com','www','http','https','store','data','user','users',
  'phone','device','devices','support','version','update','quot',
]);

/* ============================================================
   UTILITIES
   ============================================================ */

/** Extract package ID from any Play Store URL format */
function extractPackageId(input) {
  input = input.trim();
  // Direct package ID (no URL)
  if (/^[a-zA-Z][a-zA-Z0-9_]*(\.[a-zA-Z][a-zA-Z0-9_]*){1,}$/.test(input)) return input;
  // From URL
  const match = input.match(/[?&]id=([a-zA-Z0-9._]+)/);
  return match ? match[1] : null;
}

/** Strip HTML tags from a string */
function stripHtml(str) {
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

/** Tokenise text into individual words and 2-word phrases */
function tokenise(text) {
  // Clean: lowercase, remove non-alpha except hyphens between words
  const cleaned = text.toLowerCase().replace(/[^a-z0-9\-\s]/g, ' ').replace(/\s+/g, ' ').trim();
  const words   = cleaned.split(' ').filter(w => w.length > 2);

  const tokens = [];

  // Single words (not stopwords, min length 3)
  words.forEach(w => {
    const clean = w.replace(/^-+|-+$/g, ''); // strip leading/trailing hyphens
    if (clean.length >= 3 && !STOPWORDS.has(clean) && !/^\d+$/.test(clean)) {
      tokens.push({ term: clean, type: 'single' });
    }
  });

  // 2-word phrases (bigrams): neither word is a stopword
  for (let i = 0; i < words.length - 1; i++) {
    const w1 = words[i].replace(/^-+|-+$/g, '');
    const w2 = words[i + 1].replace(/^-+|-+$/g, '');
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

/** Count keyword frequency across sources and merge */
function buildKeywordMap(sources) {
  // sources = { title: string, short: string, long: string }
  const map = {}; // term → { freq, sources: Set, type }

  const process = (text, srcLabel) => {
    if (!text) return;
    const tokens = tokenise(text);
    tokens.forEach(({ term, type }) => {
      if (!map[term]) map[term] = { term, freq: 0, sources: new Set(), type };
      map[term].freq++;
      map[term].sources.add(srcLabel);
      // phrases always stay as phrase type
      if (type === 'phrase') map[term].type = 'phrase';
    });
  };

  process(sources.title, 'title');
  process(sources.short, 'short');
  process(sources.long,  'long');

  return Object.values(map);
}

/* ============================================================
   API FETCHING — Real Play Store Data
   ============================================================ */

/**
 * Strategy A: gplayapi (free JSON API)
 * Returns structured JSON with title, summary, description, etc.
 */
async function fetchViaGplayAPI(packageId) {
  const url = `https://gplayapi.cashlessconsumer.in/api/apps/${packageId}`;
  const res  = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`gplayAPI ${res.status}`);
  const data = await res.json();

  if (!data || !data.title) throw new Error('gplayAPI: no title in response');

  return {
    title:       stripHtml(data.title       || ''),
    short:       stripHtml(data.summary     || data.shortDescription || ''),
    long:        stripHtml(data.description || ''),
    icon:        data.icon        || data.headerImage || '',
    developer:   data.developer   || data.developerId || '',
    rating:      data.score       ? data.score.toFixed(1) : null,
    installs:    data.installs    || data.minInstalls  || null,
    category:    data.genre       || data.genreId      || null,
  };
}

/**
 * Strategy B: AllOrigins CORS proxy → scrape HTML
 * Fetches raw Play Store page and parses metadata from HTML
 */
async function fetchViaAllOrigins(packageId) {
  const playUrl  = `https://play.google.com/store/apps/details?id=${packageId}&hl=en`;
  const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(playUrl)}`;

  const res  = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`AllOrigins ${res.status}`);
  const json = await res.json();
  const html = json.contents || '';

  return parsePlayStoreHTML(html, packageId);
}

/**
 * Strategy C: corsproxy.io — another CORS proxy
 */
async function fetchViaCorsproxy(packageId) {
  const playUrl  = `https://play.google.com/store/apps/details?id=${packageId}&hl=en`;
  const proxyUrl = `https://corsproxy.io/?${encodeURIComponent(playUrl)}`;

  const res  = await fetch(proxyUrl, { signal: AbortSignal.timeout(12000) });
  if (!res.ok) throw new Error(`corsproxy ${res.status}`);
  const html = await res.text();

  return parsePlayStoreHTML(html, packageId);
}

/**
 * Parse Google Play Store HTML to extract real metadata
 * Works with Play Store's server-rendered HTML structure
 */
function parsePlayStoreHTML(html, packageId) {
  if (!html || html.length < 500) throw new Error('HTML too short / empty');

  // Helper: extract first regex match
  const grab = (re) => { const m = html.match(re); return m ? stripHtml(m[1]) : ''; };

  // Title — appears in <title> tag and og:title
  let title = grab(/<title>([^|<]+)/i)
           || grab(/property="og:title"\s+content="([^"]+)"/i)
           || '';
  title = title.replace(/\s*-\s*Apps on Google Play/i, '').trim();

  // Description — Play Store embeds it in a JSON data blob or meta
  let long = '';
  // Try meta description first (often the short desc)
  let metaDesc = grab(/name="description"\s+content="([^"]+)"/i);

  // Try to find the full description from structured data / JSON blobs
  // Play Store injects data as JS arrays — look for description patterns
  const descMatch = html.match(/"description":\s*\{"defaultValue":\s*\{"value":\s*"([\s\S]{50,5000}?)"\}/);
  if (descMatch) {
    long = descMatch[1].replace(/\\n/g, ' ').replace(/\\u003c/g, '<').replace(/\\u003e/g, '>');
    long = stripHtml(long);
  }

  // Fallback: grab large text blocks from itemprop or data-g-id attributes
  if (!long || long.length < 50) {
    const itemprop = html.match(/itemprop="description"[^>]*>\s*<span[^>]*>([\s\S]{50,5000}?)<\/span>/i);
    if (itemprop) long = stripHtml(itemprop[1]);
  }

  // Developer name
  let developer = grab(/itemprop="author"[\s\S]{0,200}?itemprop="name"[^>]*>([^<]+)/i)
               || grab(/"author":\s*\{"@type":"Person","name":"([^"]+)"/i)
               || '';

  // Icon
  let icon = grab(/rel="icon"\s+href="([^"]+)"/i)
          || grab(/property="og:image"\s+content="([^"]+)"/i)
          || '';

  // If we got a short meta description but no long, use meta as short
  const short = metaDesc && metaDesc.length < 300 ? metaDesc : '';

  if (!title && !long && !short) throw new Error('Could not parse app data from HTML');

  return { title, short, long: long || metaDesc || '', icon, developer, rating: null, installs: null, category: null };
}

/**
 * Master fetch function — tries each strategy in order
 */
async function fetchAppData(packageId, onStatusUpdate) {
  const strategies = [
    { name: 'Fetching via Play Store API…',    fn: () => fetchViaGplayAPI(packageId)   },
    { name: 'Fetching via CORS proxy…',         fn: () => fetchViaAllOrigins(packageId) },
    { name: 'Fetching via backup proxy…',       fn: () => fetchViaCorsproxy(packageId)  },
  ];

  let lastErr;
  for (const strategy of strategies) {
    try {
      onStatusUpdate(strategy.name);
      const result = await strategy.fn();
      if (result && (result.title || result.long)) return result;
    } catch (e) {
      console.warn(`Strategy failed: ${strategy.name}`, e.message);
      lastErr = e;
    }
  }
  throw new Error('All fetch strategies failed. The app may not exist or Play Store is blocking requests. Try again in a moment.');
}

/* ============================================================
   DOM REFERENCES
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

// Meta display elements
const appIcon        = document.getElementById('appIcon');
const appTitleDisp   = document.getElementById('appTitle');
const appDev         = document.getElementById('appDev');
const appRating      = document.getElementById('appRating');
const appInstalls    = document.getElementById('appInstalls');
const appCategory    = document.getElementById('appCategory');
const statTitle      = document.getElementById('statTitle');
const statShort      = document.getElementById('statShort');
const statLong       = document.getElementById('statLong');
const statTotal      = document.getElementById('statTotal');
const rawTitle       = document.getElementById('rawTitle');
const rawShort       = document.getElementById('rawShort');
const rawLong        = document.getElementById('rawLong');

/* ============================================================
   STATE
   ============================================================ */
let allKeywords    = [];  // Full extracted keyword list
let activeSource   = 'all';

/* ============================================================
   RENDER TABLE
   ============================================================ */
function renderTable() {
  const filterText = filterInput.value.toLowerCase().trim();
  const sort       = sortSelect.value;

  // Filter by text + source
  let data = allKeywords.filter(kw => {
    const textMatch = kw.term.includes(filterText);
    const srcMatch  = activeSource === 'all' || kw.sources.has(activeSource);
    return textMatch && srcMatch;
  });

  // Sort
  if (sort === 'freq')  data.sort((a, b) => b.freq - a.freq);
  if (sort === 'alpha') data.sort((a, b) => a.term.localeCompare(b.term));
  if (sort === 'len')   data.sort((a, b) => b.term.length - a.term.length);

  kwBody.innerHTML = '';

  if (data.length === 0) {
    noRows.classList.remove('hidden');
    return;
  }
  noRows.classList.add('hidden');

  data.forEach((kw, idx) => {
    // Source tags
    const srcHTML = [...kw.sources].map(src => {
      const cls  = src === 'title' ? 'src-tag-title' : src === 'short' ? 'src-tag-short' : 'src-tag-long';
      const label = src === 'title' ? 'Title' : src === 'short' ? 'Short' : 'Long';
      return `<span class="src-tag ${cls}">${label}</span>`;
    }).join('');

    // Type badge
    const typeClass = kw.type === 'phrase' ? 'type-phrase' : 'type-single';
    const typeLabel = kw.type === 'phrase' ? 'Phrase' : 'Word';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-num">${idx + 1}</td>
      <td class="td-kw">${escHtml(kw.term)}</td>
      <td><div class="source-tags">${srcHTML}</div></td>
      <td class="td-freq">${kw.freq}×</td>
      <td class="td-len">${kw.term.length} chars</td>
      <td><span class="type-badge ${typeClass}">${typeLabel}</span></td>
    `;
    kwBody.appendChild(tr);
  });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

/* ============================================================
   UPDATE META CARD
   ============================================================ */
function updateMeta(data) {
  appTitleDisp.textContent = data.title || 'Unknown App';
  appDev.textContent       = data.developer ? `by ${data.developer}` : '';
  appRating.textContent    = data.rating   ? `⭐ ${data.rating}` : '⭐ —';
  appInstalls.textContent  = data.installs ? `📥 ${data.installs}` : '📥 —';
  appCategory.textContent  = data.category ? `🏷 ${data.category}` : '🏷 —';

  if (data.icon) {
    appIcon.src = data.icon;
    appIcon.style.display = 'block';
  } else {
    appIcon.style.display = 'none';
  }
}

/* ============================================================
   UPDATE STATS
   ============================================================ */
function updateStats(keywords, sources) {
  const fromTitle = keywords.filter(k => k.sources.has('title')).length;
  const fromShort = keywords.filter(k => k.sources.has('short')).length;
  const fromLong  = keywords.filter(k => k.sources.has('long')).length;

  statTitle.textContent = fromTitle;
  statShort.textContent = fromShort;
  statLong.textContent  = fromLong;
  statTotal.textContent = keywords.length;

  rawTitle.textContent = sources.title || '(empty)';
  rawShort.textContent = sources.short || '(empty)';
  rawLong.textContent  = sources.long  ? sources.long.slice(0, 600) + (sources.long.length > 600 ? '…' : '') : '(empty)';
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
function exportCSV() {
  if (!allKeywords.length) return;
  const headers = ['Keyword', 'Type', 'Frequency', 'Found In', 'Char Length'];
  const rows = allKeywords.map(k => [
    `"${k.term}"`,
    k.type,
    k.freq,
    `"${[...k.sources].join(', ')}"`,
    k.term.length,
  ]);
  const csv  = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  const pkg  = extractPackageId(appUrlInput.value) || 'app';
  a.href = url; a.download = `${pkg}_keywords.csv`; a.click();
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
    showError('Invalid URL or package ID. Please paste a valid Play Store link.\nExample: https://play.google.com/store/apps/details?id=com.spotify.music');
    return;
  }

  // UI: loading state
  errorBox.classList.add('hidden');
  resultsSection.classList.add('hidden');
  loader.classList.remove('hidden');
  scrapeBtn.disabled = true;
  btnText.textContent = 'Extracting…';

  try {
    // Fetch real data
    const appData = await fetchAppData(packageId, (msg) => {
      loaderText.textContent = msg;
    });

    // Validate we got something useful
    const hasContent = appData.title || appData.short || appData.long;
    if (!hasContent) throw new Error('App data returned empty. The app may not be available in the Play Store or blocked.');

    const sources = {
      title: appData.title || '',
      short: appData.short || '',
      long:  appData.long  || '',
    };

    // Extract keywords
    const keywords = buildKeywordMap(sources);

    // Sort by frequency desc by default
    keywords.sort((a, b) => b.freq - a.freq);
    allKeywords = keywords;

    // Reset filters
    filterInput.value  = '';
    sortSelect.value   = 'freq';
    activeSource       = 'all';
    srcFilterBtns.forEach(b => b.classList.toggle('active', b.dataset.src === 'all'));

    // Update UI
    updateMeta(appData);
    updateStats(keywords, sources);
    renderTable();

    loader.classList.add('hidden');
    resultsSection.classList.remove('hidden');

  } catch (err) {
    console.error('Scrape error:', err);
    loader.classList.add('hidden');
    showError(err.message || 'Failed to fetch app data. Please try again.');
  } finally {
    scrapeBtn.disabled = false;
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

appUrlInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleScrape();
});

clearBtn.addEventListener('click', () => {
  appUrlInput.value = '';
  appUrlInput.focus();
});

// Example quick-fill buttons
document.querySelectorAll('.ex-link').forEach(btn => {
  btn.addEventListener('click', () => {
    appUrlInput.value = btn.dataset.url;
    handleScrape();
  });
});

// Live filter
filterInput.addEventListener('input', renderTable);
sortSelect.addEventListener('change', renderTable);

// Source filter buttons
srcFilterBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    activeSource = btn.dataset.src;
    srcFilterBtns.forEach(b => b.classList.toggle('active', b === btn));
    renderTable();
  });
});

// Export
exportBtn.addEventListener('click', exportCSV);

// Retry
retryBtn.addEventListener('click', () => {
  errorBox.classList.add('hidden');
  handleScrape();
});

// Raw text toggle
toggleRaw.addEventListener('click', () => {
  const isHidden = rawContent.classList.toggle('hidden');
  toggleRaw.textContent = isHidden ? 'Show' : 'Hide';
});
