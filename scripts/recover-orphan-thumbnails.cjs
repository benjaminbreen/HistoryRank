#!/usr/bin/env node
/**
 * recover-orphan-thumbnails.cjs
 *
 * Matches orphan thumbnails (files in public/thumbnails/ with no matching figure ID)
 * to actual figure IDs using multiple fuzzy matching strategies.
 * Copies matched files to the correct filename (preserving originals).
 */

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'historyrank.db');
const THUMB_DIR = path.join(__dirname, '..', 'public', 'thumbnails');

const db = new Database(DB_PATH, { readonly: true });

// Get all figure IDs and canonical names
const figures = db.prepare('SELECT id, canonical_name FROM figures').all();
const figureIds = new Set(figures.map(f => f.id));

// Build lookup maps for matching
const nameToId = new Map();       // normalized canonical_name -> id
const wordsToId = new Map();      // sorted content words -> id
const shortNameToId = new Map();  // last-name or short form -> id

function normalize(s) {
  return s.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip diacritics
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function contentWords(s) {
  // Remove common prefixes/suffixes that vary between forms
  const stop = new Set([
    'of', 'the', 'and', 'de', 'di', 'von', 'van', 'ibn', 'al', 'el', 'la',
    'king', 'queen', 'emperor', 'empress', 'pope', 'saint', 'sir', 'lord',
    'prince', 'princess', 'ayatollah', 'guru', 'dom', 'count',
    'holy', 'roman', 'great', 'i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii',
    'ix', 'x', 'xi', 'xii', 'xiii', 'xiv', 'xv', 'xvi',
    'jr', 'sr',
  ]);
  return normalize(s)
    .split('-')
    .filter(w => w.length > 1 && !stop.has(w))
    .sort()
    .join('-');
}

for (const f of figures) {
  const normName = normalize(f.canonical_name);
  nameToId.set(normName, f.id);

  const words = contentWords(f.canonical_name);
  if (words.length > 2) {
    // Only set if not already set (avoid collisions)
    if (!wordsToId.has(words)) {
      wordsToId.set(words, f.id);
    }
  }

  // Short name: last word of canonical name
  const parts = f.canonical_name.split(/\s+/);
  if (parts.length >= 2) {
    const lastName = normalize(parts[parts.length - 1]);
    if (lastName.length > 3) {
      // Don't overwrite - first match wins to avoid collisions
      if (!shortNameToId.has(lastName)) {
        shortNameToId.set(lastName, f.id);
      } else {
        // Collision - remove to prevent false matches
        shortNameToId.set(lastName, null);
      }
    }
  }
}

// Manual mappings for tricky cases
const MANUAL_MAP = {
  '14th-dalai-lama': 'tenzin-gyatso',
  'dalai-lama': 'tenzin-gyatso',
  'ab-bakr': 'abu-bakr',
  'aiskhylos': 'aeschylus',
  'alexander-solzhenitsyn': 'aleksandr-solzhenitsyn',
  'antonin-dvo-k': 'anton-n-dvo-k',
  'basho': 'matsuo-basho',
  'bh-skara-ii': 'bhaskara-ii',
  'camillo-benso-count-of-cavour': 'camillo-di-cavour',
  'camillo-benso-di-cavour': 'camillo-di-cavour',
  'diogenes-of-sinope': 'diogenes',
  'emperor-taizong-of-tang': null, // not in DB
  'gustavus-adolphus': 'gustavus-adolphus-of-sweden',
  'jan-amos-comenius': 'john-amos-comenius',
  'king-hussein-of-jordan': 'king-hussein',
  'matsuo-bash': 'matsuo-basho',
  'maximilian-robespierre': 'robespierre',
  'maximilien-robespierre': 'robespierre',
  'pel': 'pele',
  'saig-takamori': 'saigo-takamori',
  'shivaji-bhonsle': 'shivaji',
  'the-buddha': 'gautama-buddha',
  'wilhelm-ii-german-emperor': 'wilhelm-ii',
  'albrecht-durer': 'albrecht-d-rer',
  'atat-rk': 'mustafa-kemal-atat-rk',
  'attila': 'attila-the-hun',
  'cleopatra': 'cleopatra-vii',
  'ali': 'ali-ibn-abi-talib',
  'umar': 'umar-ibn-al-khattab',
  'uthman': 'uthman-ibn-affan',
  'diderot': 'denis-diderot',
  'hannibal': 'hannibal-barca',
  'solomon': 'king-solomon',
  'thales': 'thales-of-miletus',
  'lao-tzu': 'laozi',
  'the-buddha': 'gautama-buddha',
  'euclid-of-alexandria': 'euclid',
  'giotto': 'giotto-di-bondone',
  'boccaccio': 'giovanni-boccaccio',
  'kalidasa': 'k-lid-sa',
  'sappho-of-lesbos': 'sappho',
  'tito': 'josip-broz-tito',
  'rasputin': 'grigori-rasputin',
  'metternich': 'klemens-von-metternich',
  'vesalius': 'andreas-vesalius',
  'rembrandt-van-rijn': 'rembrandt',
  'salvador-dali': 'salvador-dal-',
  'rene-magritte': 'ren-magritte',
  'vasily-kandinsky': 'wassily-kandinsky',
  'soren-kierkegaard': 's-ren-kierkegaard',
  'maximilien-de-robespierre': 'robespierre',
  'simon-bolivar': 'sim-n-bol-var',
  'lech-walesa': 'lech-wa-sa',
  'gabriel-garcia-marquez': 'gabriel-garc-a-m-rquez',
  'giuseppe-verdi': 'giuseppe-verdi',
  'robert-oppenheimer': 'j-robert-oppenheimer',
  'johann-gutenberg': 'johannes-gutenberg',
  'h-ch-minh': 'ho-chi-minh',
  'toussaint-l-ouverture': 'toussaint-louverture',
  'wu-zetian': 'wu-zetian', // might already match
  'alcuin': 'alcuin-of-york',
  'henri-dunant': 'henry-dunant',
  'hugo-chavez': 'hugo-ch-vez',
  'kurt-godel': 'kurt-g-del',
  'nicol-s-cop-rnico': 'nicolaus-copernicus',
  'nicolaus-of-cusa': 'nicholas-of-cusa',
  'pope-leo-x': 'leo-x',
  'king-david': 'david',
  'king-alfred-the-great': 'alfred-the-great',
  'richard-i': 'richard-the-lionheart',
  'richard-i-of-england': 'richard-the-lionheart',
  'richard-iii': 'richard-iii-of-england',
  'george-iii': 'george-iii-of-great-britain',
  'louis-xvi': 'louis-xvi-of-france',
  'nicholas-ii': 'nicholas-ii-of-russia',
  'william-ewart-gladstone': 'william-gladstone',
  'emperor-ashoka': 'ashoka',
  'ashoka-the-great': 'ashoka',
  'emperor-nero': 'nero',
  'emperor-trajan': 'trajan',
  'emperor-claudius': 'claudius',
  'emperor-diocletian': 'diocletian',
  'emperor-hirohito': 'hirohito',
  'emperor-qianlong': 'qianlong-emperor',
  'emperor-septimius-severus': 'septimius-severus',
  'emperor-taizong-of-tang': null, // not in DB
  'emperor-basil-ii': 'basil-ii',
  'emperor-menelik-ii': 'menelik-ii',
  'empress-dowager-cixi': 'cixi',
  'empress-maria-theresa': 'maria-theresa',
  'catherine-ii': 'catherine-the-great',
  'juan-peron': 'juan-per-n',
  'eva-peron': 'eva-per-n',
  'jose-marti': 'jos-mart-',
  'jose-rizal': 'jos-rizal',
  'joseph-ii': 'joseph-ii-of-austria',
  'henry-viii': 'henry-viii-of-england',
  'charles-v-holy-roman-emperor': 'charles-v',
  'otto-i-holy-roman-emperor': 'otto-i',
  'otto-i-the-great': 'otto-i',
  'king-philip-ii-of-spain': 'philip-ii-of-spain',
  'king-sejong-the-great': 'sejong-the-great',
  'king-john-of-england': 'john-of-england',
  'king-hussein-of-jordan': 'king-hussein',
  'ferdinand-and-isabella': null, // skip - two people
  'cyril-and-methodius': null, // skip - two people
  'amir-timur': 'timur',
  'tamerlane': 'timur',
  'archduke-franz-ferdinand-of-austria': 'franz-ferdinand',
  'artaxerxes-i': 'artaxerxes-i-of-persia',
  'ruhollah-khomeini': 'ayatollah-khomeini',
  'ayatollah-ruhollah-khomeini': 'ayatollah-khomeini',
  'darius-the-great': 'darius-i',
  'desiderius-erasmus': 'erasmus',
  'gustavus-adolphus': 'gustavus-adolphus-of-sweden',
  'mehmed-the-conqueror': 'mehmed-ii',
  'montezuma-ii': 'moctezuma-ii',
  'han-wudi': 'emperor-wu-of-han',
  'han-fei': 'han-feizi',
  'saint-francis-of-assisi': 'francis-of-assisi',
  'saint-jerome': 'jerome',
  'saint-thomas-aquinas': 'thomas-aquinas',
  'saint-thomas-more': 'thomas-more',
  'benedict-of-nursia': 'saint-benedict',
  'bede-the-venerable': 'bede',
  'gilbert-du-motier': 'marquis-de-lafayette',
  'george-c-marshall': 'george-marshall',
  'gregory-i': 'pope-gregory-i',
  'gregory-the-great': 'pope-gregory-i',
  'eugenio-pacelli': 'pope-pius-xii',
  'dom-pedro-i': 'pedro-i-of-brazil',
  'dom-pedro-i-of-brazil': 'pedro-i-of-brazil',
  'dom-pedro-ii-of-brazil': 'pedro-ii-of-brazil',
  'pedro-ii-of-brazil': 'pedro-ii-of-brazil',
  'camillo-benso-count-of-cavour': 'camillo-di-cavour',
  'camillo-benso-di-cavour': 'camillo-di-cavour',
  'cavour': 'camillo-di-cavour',
  'claudius-ptolemy': 'ptolemy',
  'marcus-tullius-cicero': 'cicero',
  'john-forbes-nash-jr': 'john-nash',
  'john-rockefeller': 'john-d-rockefeller',
  'james-joule': 'james-prescott-joule',
  'edmund-halley': 'edmond-halley',
  'emile-zola': 'mile-zola',
  'g-w-f-hegel': 'georg-wilhelm-friedrich-hegel',
  'douard-manet': 'edouard-manet',
  'leopold-senghor': 'l-opold-s-dar-senghor',
  'lula-da-silva': 'luiz-in-cio-lula-da-silva',
  'malthus': 'thomas-malthus',
  'thomas-robert-malthus': 'thomas-malthus',
  'toynbee': 'arnold-toynbee',
  'doppler': 'christian-doppler',
  'pearson': 'karl-pearson',
  'mendelssohn': 'felix-mendelssohn',
  'michaelangelo': 'michelangelo',
  'antonio-salazar': 'ant-nio-de-oliveira-salazar',
  'reza-shah-pahlavi': 'reza-shah',
  'herbert-simon': 'herbert-a-simon',
  'ito-hirobumi': 'it-hirobumi',
  'katsushika-hokusai': 'hokusai',
  'ramanujan': 'srinivasa-ramanujan',
  'moshe-ben-maimon': 'maimonides',
  'moses-in-islam': null, // skip - not a distinct figure entry
  'jalal-ad-din-rumi': 'rumi',
  'jalaluddin-rumi': 'rumi',
  'askia-muhammad': 'askia-muhammad-i',
  'miguel-hidalgo': 'miguel-hidalgo-y-costilla',
  'muhammed-ali-pasha': 'muhammad-ali-of-egypt',
  'muhammad-ali-pasha': 'muhammad-ali-of-egypt',
  'perikles': 'pericles',
  'ogedei-khan': '-gedei-khan',
  'saloth-sar': 'pol-pot',
  'saig-takamori': 'saigo-takamori',
  'henrietta-leavitt': 'henrietta-swan-leavitt',
  'homi-j-bhabha': 'homi-bhabha',
  'jan-amos-comenius': 'john-amos-comenius',
  'girolamo-cardano': 'gerolamo-cardano',
  'camilo-golgi': 'camillo-golgi',
  'viking-leader-leif-erikson': 'leif-erikson',
  'vo-nguyen-giap': 'v-nguy-n-gi-p',
  'wilhelm-ii-german-emperor': 'wilhelm-ii',
  'wilhelm-conrad-r-ntgen': 'wilhelm-r-ntgen',
  'jacques-yves-cousteau': 'jacques-cousteau',
  'subhash-chandra-bose': 'subhas-chandra-bose',
  'yasir-arafat': 'yasser-arafat',
  'zheng-chenggong': 'koxinga',
  'niels-henrik-abel': 'niels-abel',
  'saadi': 'saadi-shirazi',
  'georges-jacques-danton': 'georges-danton',
  'di-shankara': 'adi-shankara',
  'bh-skara-ii': 'bhaskara-ii',
  'dith-piaf': 'edith-piaf',
  'maria-sk-odowska-curie': 'marie-curie',
  'h-rrem-sultan': 'hurrem-sultan',
  'prince-sh-toku': 'prince-shotoku',
  'queen-lili-uokalani': 'queen-liliuokalani',
  'kenzaburo-oe': 'kenzabur-e',
  's-kou-tour': 'ahmed-s-kou-tour',
  'jos-de-san-mart-n': 'jose-de-san-martin',
  'tarik-ibn-ziyad': 'tariq-ibn-ziyad',
  'ts-ai-lun': 'cai-lun',
  'ulrich-zwingli': 'huldrych-zwingli',
  'umar-khayyam': 'omar-khayyam',
  't-pac-amaru-ii': 'tupac-amaru-ii',
  'baha-u-llah': 'bah-u-ll-h',
  'guru-gobind-singh-ji': 'guru-gobind-singh',
  'guru-har-krishan-ji': 'guru-har-krishan',
  'guru-har-rai-ji': 'guru-har-rai',
  'guru-ram-das-ji': 'guru-ram-das',
  'swami-dayananda-saraswati': 'dayananda-saraswati',
  'sardar-patel': 'vallabhbhai-patel',
  'sardar-vallabhbhai-patel': 'vallabhbhai-patel',
  'hammamurabi': 'hammurabi',
  'antoine-lavoisier': 'antoine-lavoisier',
  'auguste-and-louis-lumi-re': null, // two people; auguste-lumiere and louis-lumiere exist separately
  'abd-al-rahman-al-sufi': 'abd-al-rahman-al-sufi',
};

// Get all thumbnail files
const files = fs.readdirSync(THUMB_DIR);
const thumbMap = new Map(); // stem -> filename
for (const f of files) {
  const stem = f.replace(/\.[^.]*$/, '');
  thumbMap.set(stem, f);
}

// Find orphans (thumbnails with no matching figure ID)
const orphans = [];
for (const [stem, filename] of thumbMap) {
  if (!figureIds.has(stem)) {
    orphans.push({ stem, filename });
  }
}

console.log(`Total thumbnails: ${files.length}`);
console.log(`Total figures: ${figureIds.size}`);
console.log(`Orphan thumbnails: ${orphans.length}`);
console.log('');

// Try to match each orphan
let matched = 0;
let skipped = 0;
let unmatched = 0;
const copies = []; // { from, to }
const unmatchedList = [];

for (const { stem, filename } of orphans) {
  let targetId = null;

  // Strategy 1: Manual mapping
  if (MANUAL_MAP.hasOwnProperty(stem)) {
    const mapped = MANUAL_MAP[stem];
    if (mapped === null) {
      skipped++;
      continue;
    }
    if (figureIds.has(mapped)) {
      targetId = mapped;
    }
  }

  // Strategy 2: Direct normalized name match
  if (!targetId) {
    const normStem = normalize(stem);
    const directMatch = nameToId.get(normStem);
    if (directMatch && figureIds.has(directMatch)) {
      targetId = directMatch;
    }
  }

  // Strategy 3: Content words match
  if (!targetId) {
    const words = contentWords(stem);
    if (words.length > 2) {
      const wordsMatch = wordsToId.get(words);
      if (wordsMatch && figureIds.has(wordsMatch)) {
        targetId = wordsMatch;
      }
    }
  }

  if (targetId) {
    // Check if target already has a thumbnail
    const ext = path.extname(filename);
    const targetFile = `${targetId}${ext}`;
    const targetHasThumb = files.some(f => f.startsWith(targetId + '.'));

    if (targetHasThumb) {
      // Already has a thumbnail, skip
      skipped++;
    } else {
      copies.push({
        from: path.join(THUMB_DIR, filename),
        to: path.join(THUMB_DIR, targetFile),
        orphanStem: stem,
        targetId,
      });
      matched++;
    }
  } else {
    unmatched++;
    unmatchedList.push(stem);
  }
}

console.log(`Matched: ${matched}`);
console.log(`Skipped (null mapping or target already has thumb): ${skipped}`);
console.log(`Unmatched: ${unmatched}`);
console.log('');

if (unmatchedList.length > 0) {
  console.log('Unmatched orphans:');
  for (const s of unmatchedList) {
    console.log(`  ${s}`);
  }
  console.log('');
}

// Perform copies
console.log(`Copying ${copies.length} files...`);
for (const c of copies) {
  console.log(`  ${c.orphanStem} -> ${c.targetId}`);
  fs.copyFileSync(c.from, c.to);
}

console.log(`\nDone! Recovered ${copies.length} thumbnails.`);

db.close();
