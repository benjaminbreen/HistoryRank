const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const db = new Database('historyrank.db', { readonly: true });
const rows = db.prepare(`
  SELECT id, canonical_name, wikipedia_slug, hpi_rank, llm_consensus_rank
  FROM figures
  WHERE llm_consensus_rank IS NOT NULL
  ORDER BY llm_consensus_rank ASC
  LIMIT 300
`).all();

const STOP_WORDS = new Set(['the', 'of', 'saint', 'st', 'ibn', 'al', 'von', 'de', 'da', 'di']);

function normalize(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(name) {
  return normalize(name)
    .split(' ')
    .filter((t) => t && !STOP_WORDS.has(t));
}

function levenshtein(a, b) {
  const dp = Array.from({ length: b.length + 1 }, (_, i) => [i]);
  for (let j = 0; j <= a.length; j++) dp[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) dp[i][j] = dp[i - 1][j - 1];
      else dp[i][j] = Math.min(dp[i - 1][j - 1] + 1, dp[i][j - 1] + 1, dp[i - 1][j] + 1);
    }
  }
  return dp[b.length][a.length];
}

function jaccard(a, b) {
  const sa = new Set(a);
  const sb = new Set(b);
  const inter = [...sa].filter((x) => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union === 0 ? 0 : inter / union;
}

function isCandidate(a, b) {
  const an = normalize(a.canonical_name);
  const bn = normalize(b.canonical_name);
  if (an === bn) return false;
  const at = tokenize(a.canonical_name);
  const bt = tokenize(b.canonical_name);
  if (at.length === 0 || bt.length === 0) return false;

  const aLast = at[at.length - 1];
  const bLast = bt[bt.length - 1];
  const lastMatch = aLast === bLast && aLast.length >= 3;

  const shorterTokens = at.length <= bt.length ? at : bt;
  const shorterName = at.length <= bt.length ? an : bn;
  const longerName = at.length <= bt.length ? bn : an;

  if ((longerName.includes(shorterName)) && (lastMatch || shorterTokens.length >= 2)) {
    return true;
  }

  if (lastMatch && jaccard(at, bt) >= 0.6) return true;

  if (lastMatch && Math.min(levenshtein(an, bn), levenshtein(at[0], bt[0])) <= 2) {
    return true;
  }

  return false;
}

function isSafePair(a, b) {
  const at = tokenize(a.canonical_name);
  const bt = tokenize(b.canonical_name);
  if (at.length !== bt.length) return false;
  const used = new Array(bt.length).fill(false);
  for (const token of at) {
    let matched = false;
    for (let i = 0; i < bt.length; i++) {
      if (used[i]) continue;
      if (levenshtein(token, bt[i]) <= 2) {
        used[i] = true;
        matched = true;
        break;
      }
    }
    if (!matched) return false;
  }
  return true;
}

const pairs = [];
const safePairs = [];
for (let i = 0; i < rows.length; i++) {
  for (let j = i + 1; j < rows.length; j++) {
    if (isCandidate(rows[i], rows[j])) {
      pairs.push([rows[i], rows[j]]);
      if (isSafePair(rows[i], rows[j])) {
        safePairs.push([rows[i], rows[j]]);
      }
    }
  }
}

const out = [];
out.push(['id_a','name_a','id_b','name_b','a_rank','b_rank','a_slug','b_slug','a_hpi','b_hpi'].join(','));
for (const [a, b] of pairs) {
  out.push([
    a.id,
    JSON.stringify(a.canonical_name),
    b.id,
    JSON.stringify(b.canonical_name),
    a.llm_consensus_rank ?? '',
    b.llm_consensus_rank ?? '',
    a.wikipedia_slug || '',
    b.wikipedia_slug || '',
    a.hpi_rank ?? '',
    b.hpi_rank ?? ''
  ].join(','));
}

const reportDir = path.join(process.cwd(), 'data', 'reports');
fs.mkdirSync(reportDir, { recursive: true });
const reportPath = path.join(reportDir, 'top-300-duplicate-candidates.csv');
fs.writeFileSync(reportPath, out.join('\n') + '\n', 'utf8');
const safePath = path.join(reportDir, 'top-300-duplicate-safe.csv');
const safeOut = [out[0], ...safePairs.map(([a, b]) => [
  a.id,
  JSON.stringify(a.canonical_name),
  b.id,
  JSON.stringify(b.canonical_name),
  a.llm_consensus_rank ?? '',
  b.llm_consensus_rank ?? '',
  a.wikipedia_slug || '',
  b.wikipedia_slug || '',
  a.hpi_rank ?? '',
  b.hpi_rank ?? ''
].join(','))];
fs.writeFileSync(safePath, safeOut.join('\n') + '\n', 'utf8');
console.log(`Wrote ${pairs.length} candidate pairs to ${reportPath}`);
console.log(`Wrote ${safePairs.length} safe pairs to ${safePath}`);
