/**
 * ASO Scout — script.js
 * ─────────────────────────────────────────────────────────────
 * Handles: country population, form submission, mock data
 * generation, keyword rendering, filtering, sorting, CSV export.
 *
 * Architecture note:
 * The data layer (generateKeywords / fetchKeywords) is designed
 * to be API-ready. Swap the mock logic with a real HTTP call to
 * any ASO API (AppFollow, Sensor Tower, AppTweak, etc.) without
 * touching the UI layer.
 * ─────────────────────────────────────────────────────────────
 */

'use strict';

/* ============================================================
   1. COUNTRY DATA
   Each entry: { code, name, language, nativeSample[] }
   ============================================================ */
const COUNTRIES = [
  { code: 'us',  name: 'United States',   lang: 'English',    sample: ['music streaming', 'podcast player', 'offline music', 'playlist maker', 'audio player', 'radio app', 'sleep sounds', 'workout music', 'music discovery', 'concert tickets'] },
  { code: 'gb',  name: 'United Kingdom',  lang: 'English',    sample: ['music app UK', 'streaming service', 'podcast app', 'free music', 'artist radio', 'chart music', 'BBC sounds', 'download songs', 'HD audio', 'music library'] },
  { code: 'fr',  name: 'France',          lang: 'French',     sample: ['écouter musique', 'streaming musical', 'podcast gratuit', 'radio en ligne', 'music en ligne', 'playlist rap', 'télécharger chanson', 'musique hors ligne', 'découvrir artiste', 'son HD'] },
  { code: 'de',  name: 'Germany',         lang: 'German',     sample: ['musik streaming', 'podcast app', 'musik offline', 'radio app deutsch', 'musik entdecken', 'free musik', 'playlist erstellen', 'konzert tickets', 'Hörbuch app', 'audiobuch'] },
  { code: 'jp',  name: 'Japan',           lang: 'Japanese',   sample: ['音楽ストリーミング', 'ポッドキャスト', 'オフライン再生', 'J-POP', 'カラオケアプリ', 'ラジオアプリ', '音楽発見', 'プレイリスト', '無料音楽', 'ハイレゾ音源'] },
  { code: 'kr',  name: 'South Korea',     lang: 'Korean',     sample: ['음악 스트리밍', '팟캐스트 앱', '오프라인 음악', 'K-POP 앱', '가사 앱', '라디오 앱', '뮤직 플레이어', '음악 추천', '무료 음악', '고음질'] },
  { code: 'cn',  name: 'China',           lang: 'Chinese',    sample: ['音乐播放器', '流媒体音乐', '播客应用', '离线音乐', '国语歌曲', '粤语音乐', '音乐下载', '免费音乐', '高清音质', '热门歌曲'] },
  { code: 'in',  name: 'India',           lang: 'Hindi/Eng',  sample: ['संगीत ऐप', 'music streaming India', 'Bollywood songs', 'Hindi songs', 'Tamil music', 'podcast app', 'free songs', 'gaana app', 'music download', 'radio app India'] },
  { code: 'br',  name: 'Brazil',          lang: 'Portuguese', sample: ['streaming música', 'podcasts grátis', 'música offline', 'rádio online', 'playlist sertanejo', 'funk music', 'MPB streaming', 'baixar músicas', 'descobrir artista', 'áudio HD'] },
  { code: 'es',  name: 'Spain',           lang: 'Spanish',    sample: ['música streaming', 'podcast gratis', 'radio online', 'escuchar música', 'playlist flamenco', 'música offline', 'reggaeton app', 'letra canciones', 'radio España', 'descubrir música'] },
  { code: 'mx',  name: 'Mexico',          lang: 'Spanish',    sample: ['música gratis', 'streaming canciones', 'podcast español', 'radio mexicana', 'playlist banda', 'corridos app', 'música offline', 'bajar canciones', 'descubrir artistas', 'reggaeton MX'] },
  { code: 'it',  name: 'Italy',           lang: 'Italian',    sample: ['streaming musica', 'podcast italiano', 'radio online', 'musica offline', 'scarica canzoni', 'musica gratis', 'playlist italiana', 'scopri artisti', 'audio HD', 'musica classica'] },
  { code: 'ru',  name: 'Russia',          lang: 'Russian',    sample: ['музыка онлайн', 'стриминг музыки', 'слушать подкасты', 'радио онлайн', 'скачать музыку', 'русская музыка', 'плейлист', 'музыка без интернета', 'найти артиста', 'HiFi аудио'] },
  { code: 'tr',  name: 'Turkey',          lang: 'Turkish',    sample: ['müzik dinle', 'streaming app', 'podcast Türkçe', 'radyo uygulaması', 'müzik indir', 'Türkçe şarkılar', 'çevrimdışı müzik', 'sanatçı keşfet', 'ücretsiz müzik', 'yüksek kalite ses'] },
  { code: 'sa',  name: 'Saudi Arabia',    lang: 'Arabic',     sample: ['بث الموسيقى', 'استماع موسيقى', 'تطبيق بودكاست', 'راديو أونلاين', 'تنزيل أغاني', 'موسيقى عربية', 'تشغيل بدون إنترنت', 'اكتشاف فنانين', 'موسيقى مجانية', 'جودة عالية'] },
  { code: 'au',  name: 'Australia',       lang: 'English',    sample: ['music app Australia', 'podcast streaming', 'offline music AU', 'radio app', 'discover artists', 'music download', 'triple j app', 'concert finder', 'live music', 'free streaming'] },
  { code: 'ca',  name: 'Canada',          lang: 'Eng/French', sample: ['music streaming CA', 'podcast app', 'music hors-ligne', 'radio Canada', 'musique gratuite', 'discover artists', 'playlist maker', 'écouter musique', 'live music', 'free music app'] },
  { code: 'id',  name: 'Indonesia',       lang: 'Indonesian', sample: ['streaming musik', 'podcast Indonesia', 'download lagu', 'radio online', 'musik offline', 'dangdut app', 'temukan artis', 'musik gratis', 'putar musik', 'lagu pop Indonesia'] },
  { code: 'ph',  name: 'Philippines',     lang: 'Filipino',   sample: ['music streaming PH', 'OPM songs', 'podcast app', 'radio app', 'download songs', 'offline music', 'tagalog songs', 'pinoy music', 'free music PH', 'OPM playlist'] },
  { code: 'ng',  name: 'Nigeria',         lang: 'English',    sample: ['music app Nigeria', 'afrobeats streaming', 'naija songs', 'podcast app', 'download music NG', 'radio Nigeria', 'free music Africa', 'afropop app', 'gospel music app', 'highlife music'] },
];

/* ============================================================
   2. MOCK APP DATABASE
   In a real tool, this is replaced by an API call to
   App Store / Play Store scraping services.
   ============================================================ */
const APP_DATABASE = {
  spotify: {
    title: 'Spotify',
    category: 'Music',
    description: 'music streaming podcast playlist offline songs radio audio player discover artist album',
  },
  youtube: {
    title: 'YouTube',
    category: 'Video',
    description: 'video streaming watch movies shorts podcast live stream content creator subscribe channel playlist',
  },
  whatsapp: {
    title: 'WhatsApp',
    category: 'Messaging',
    description: 'messaging chat video call voice call group chat file transfer free SMS end-to-end encryption status',
  },
  instagram: {
    title: 'Instagram',
    category: 'Social',
    description: 'photo sharing reels stories social media follow explore influencer feed aesthetic filter creator',
  },
  tiktok: {
    title: 'TikTok',
    category: 'Social Video',
    description: 'short video trending dance creator viral content live stream duet FYP for you page entertainment',
  },
  netflix: {
    title: 'Netflix',
    category: 'Streaming',
    description: 'movie streaming series binge watch TV show original documentary horror comedy thriller subscription',
  },
  uber: {
    title: 'Uber',
    category: 'Transport',
    description: 'ride sharing taxi cab driver trip airport pickup delivery food order location map GPS real-time',
  },
  default: {
    title: null,
    category: 'App',
    description: 'app utility tool productivity manager tracker organizer planner sync cloud backup share connect',
  },
};

/* ============================================================
   3. HELPER UTILITIES
   ============================================================ */

/** Look up mock app record by fuzzy name match */
function findApp(query) {
  const q = query.toLowerCase().replace(/[.\-_]/g, '').replace('com', '');
  for (const key of Object.keys(APP_DATABASE)) {
    if (key !== 'default' && q.includes(key)) return { key, ...APP_DATABASE[key] };
  }
  return { key: 'default', ...APP_DATABASE.default, title: toTitleCase(query) };
}

function toTitleCase(str) {
  return str.replace(/\w\S*/g, t => t.charAt(0).toUpperCase() + t.slice(1));
}

/** Seeded pseudo-random: keeps numbers stable per keyword */
function seededRand(seed, min, max) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0; }
  const rand = ((h >>> 0) % 1000) / 1000;
  return Math.round(rand * (max - min) + min);
}

/** Format large traffic numbers: 12000 → "12K" */
function formatTraffic(n) {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000)     return (n / 1_000).toFixed(1) + 'K';
  return String(n);
}

/** Convert difficulty score (1-100) to label */
function diffLabel(score) {
  if (score <= 35) return 'Low';
  if (score <= 65) return 'Medium';
  return 'High';
}

/* ============================================================
   4. KEYWORD GENERATION ENGINE
   ─────────────────────────────────────────────────────────────
   This is the function to replace with a real API call.
   Signature stays the same; just swap the body.

   Real APIs to integrate:
   • AppFollow   → https://appfollow.io/api
   • AppTweak    → https://api.apptweak.com
   • Sensor Tower → https://sensortower.com/api
   • 42matters   → https://api.42matters.com
   ============================================================ */
async function fetchKeywords(appQuery, countryCode) {
  // Simulate network latency (remove when using real API)
  await new Promise(r => setTimeout(r, 1600));

  const app     = findApp(appQuery);
  const country = COUNTRIES.find(c => c.code === countryCode);
  if (!country) throw new Error('Country not found');

  // Base keywords from app description + country-specific samples
  const baseWords  = app.description.split(/\s+/);
  const localWords = country.sample;

  // Combine: interleave app keywords with local keywords
  const combined = [...new Set([...baseWords, ...localWords])];

  // Build keyword rows with seeded-random metrics
  const rows = combined.map(kw => {
    const seed       = kw + countryCode;
    const freq       = seededRand(seed + 'f', 1, 12);
    const diffScore  = seededRand(seed + 'd', 5, 95);
    const traffic    = seededRand(seed + 't', 200, 180_000);
    const isRanked   = seededRand(seed + 'r', 0, 10) > 4; // ~60% ranked
    const ranking    = isRanked ? seededRand(seed + 'p', 1, 50) : null;

    // Determine keyword language
    const language = localWords.includes(kw) ? country.lang : 'English';

    return {
      keyword:    kw,
      language,
      frequency:  freq,
      difficulty: diffLabel(diffScore),
      diffScore,
      traffic,
      ranking,
      status:     isRanked ? 'Ranked' : 'Not Ranked',
    };
  });

  return rows;
}

/* ============================================================
   5. DOM REFERENCES
   ============================================================ */
const appInput       = document.getElementById('appInput');
const countrySelect  = document.getElementById('countrySelect');
const platformSelect = document.getElementById('platformSelect');
const searchBtn      = document.getElementById('searchBtn');
const loader         = document.getElementById('loader');
const resultsSection = document.getElementById('resultsSection');
const kwTableBody    = document.getElementById('kwTableBody');
const kwSearch       = document.getElementById('kwSearch');
const sortBy         = document.getElementById('sortBy');
const exportBtn      = document.getElementById('exportBtn');
const noResults      = document.getElementById('noResults');
const summaryApp     = document.getElementById('summaryApp');
const summaryCountry = document.getElementById('summaryCountry');
const summaryCount   = document.getElementById('summaryCount');
const summaryRanked  = document.getElementById('summaryRanked');

/* ============================================================
   6. POPULATE COUNTRY DROPDOWN
   ============================================================ */
function populateCountries() {
  COUNTRIES.forEach(c => {
    const opt = document.createElement('option');
    opt.value       = c.code;
    opt.textContent = `${c.name} — ${c.lang}`;
    countrySelect.appendChild(opt);
  });
}

/* ============================================================
   7. RENDER TABLE
   ============================================================ */
let allKeywords = []; // Global store for current results

function renderTable(data) {
  kwTableBody.innerHTML = '';

  if (!data || data.length === 0) {
    noResults.classList.remove('hidden');
    return;
  }
  noResults.classList.add('hidden');

  data.forEach((row, idx) => {
    // Difficulty CSS class
    const diffClass =
      row.difficulty === 'Low'    ? 'diff-low'  :
      row.difficulty === 'Medium' ? 'diff-med'  : 'diff-high';

    // Ranking CSS class
    let rankClass = 'rank-none';
    let rankText  = '—';
    if (row.ranking !== null) {
      rankText  = `#${row.ranking}`;
      rankClass = row.ranking <= 10 ? 'rank-top' :
                  row.ranking <= 25 ? 'rank-mid'  : 'rank-low';
    }

    // Status badge
    const statusClass = row.status === 'Ranked' ? 'status-ranked' : 'status-not-ranked';
    const dotClass    = row.status === 'Ranked' ? 'dot-ranked'    : 'dot-not-ranked';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-num">${idx + 1}</td>
      <td class="td-keyword">${escapeHTML(row.keyword)}</td>
      <td><span class="lang-badge">${escapeHTML(row.language)}</span></td>
      <td class="td-freq">${row.frequency}×</td>
      <td><span class="diff-pill ${diffClass}">${row.difficulty}</span></td>
      <td class="td-traffic">${formatTraffic(row.traffic)}</td>
      <td class="td-ranking ${rankClass}">${rankText}</td>
      <td>
        <span class="status-badge ${statusClass}">
          <span class="status-dot ${dotClass}"></span>
          ${row.status}
        </span>
      </td>
    `;
    kwTableBody.appendChild(tr);
  });
}

/** Simple HTML escape to prevent XSS */
function escapeHTML(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/* ============================================================
   8. FILTER + SORT
   ============================================================ */
function applyFilterSort() {
  const filterText = kwSearch.value.toLowerCase().trim();
  const sortKey    = sortBy.value;

  let filtered = allKeywords.filter(row =>
    row.keyword.toLowerCase().includes(filterText) ||
    row.language.toLowerCase().includes(filterText)
  );

  // Sort
  filtered.sort((a, b) => {
    switch (sortKey) {
      case 'traffic':    return b.traffic    - a.traffic;
      case 'ranking':    {
        // Ranked keywords first, then by position asc
        if (a.ranking === null && b.ranking === null) return 0;
        if (a.ranking === null) return 1;
        if (b.ranking === null) return -1;
        return a.ranking - b.ranking;
      }
      case 'frequency':  return b.frequency  - a.frequency;
      case 'difficulty': return b.diffScore  - a.diffScore;
      default:           return 0;
    }
  });

  renderTable(filtered);
}

/* ============================================================
   9. EXPORT TO CSV
   ============================================================ */
function exportCSV() {
  if (!allKeywords.length) return;

  const headers = ['Keyword', 'Language', 'Frequency', 'Difficulty', 'Traffic', 'Ranking', 'Status'];
  const rows    = allKeywords.map(r => [
    `"${r.keyword}"`,
    r.language,
    r.frequency,
    r.difficulty,
    r.traffic,
    r.ranking ?? 'N/A',
    r.status,
  ]);

  const csv     = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const blob    = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url     = URL.createObjectURL(blob);
  const link    = document.createElement('a');
  const appName = (appInput.value || 'aso').replace(/\s+/g, '_');
  link.href     = url;
  link.download = `${appName}_keywords.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

/* ============================================================
   10. UPDATE SUMMARY STRIP
   ============================================================ */
function updateSummary(appQuery, countryCode, keywords) {
  const country    = COUNTRIES.find(c => c.code === countryCode);
  const rankedCount = keywords.filter(k => k.status === 'Ranked').length;

  summaryApp.textContent     = toTitleCase(appQuery);
  summaryCountry.textContent = country ? country.name : countryCode.toUpperCase();
  summaryCount.textContent   = keywords.length;
  summaryRanked.textContent  = rankedCount;
}

/* ============================================================
   11. MAIN SEARCH HANDLER
   ============================================================ */
async function handleSearch() {
  const appQuery   = appInput.value.trim();
  const countryCode = countrySelect.value;

  // — Validation —
  if (!appQuery) {
    appInput.focus();
    appInput.style.borderColor = 'var(--red)';
    setTimeout(() => { appInput.style.borderColor = ''; }, 1500);
    return;
  }
  if (!countryCode) {
    countrySelect.style.borderColor = 'var(--red)';
    setTimeout(() => { countrySelect.style.borderColor = ''; }, 1500);
    return;
  }

  // — Show loader, hide results —
  resultsSection.classList.add('hidden');
  loader.classList.remove('hidden');
  searchBtn.disabled = true;
  searchBtn.querySelector('.btn-label').textContent = 'Analyzing…';

  try {
    const keywords = await fetchKeywords(appQuery, countryCode);
    allKeywords    = keywords;

    updateSummary(appQuery, countryCode, keywords);
    kwSearch.value = '';
    sortBy.value   = 'traffic';
    applyFilterSort();

    loader.classList.add('hidden');
    resultsSection.classList.remove('hidden');
  } catch (err) {
    console.error('ASO Scout error:', err);
    loader.classList.add('hidden');
    alert('Something went wrong. Please try again.');
  } finally {
    searchBtn.disabled = false;
    searchBtn.querySelector('.btn-label').textContent = 'Analyze Keywords';
  }
}

/* ============================================================
   12. EVENT LISTENERS
   ============================================================ */
searchBtn.addEventListener('click', handleSearch);

appInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') handleSearch();
});

kwSearch.addEventListener('input', applyFilterSort);
sortBy.addEventListener('change', applyFilterSort);
exportBtn.addEventListener('click', exportCSV);

/* ============================================================
   13. INIT
   ============================================================ */
populateCountries();
