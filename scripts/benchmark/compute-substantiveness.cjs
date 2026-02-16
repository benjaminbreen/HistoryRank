#!/usr/bin/env node
/**
 * HistoryBench: Compute description substantiveness metrics.
 *
 * For each model in the rankings table, analyzes ALL contribution texts
 * (across all sample_ids) and computes:
 *   - Mean and median description length (characters)
 *   - % keyword-only (under 20 characters)
 *   - % title-cased labels (short, mostly capitalized phrases)
 *   - % containing causal connectors
 *   - % that are actual sentences (verb-like word + punctuation)
 *
 * Can be required as a module (exports compute()) or run directly.
 */

const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, '..', '..', 'historyrank.db');

// Causal connector patterns (case-insensitive)
const CAUSAL_CONNECTORS = [
  'enabling',
  'catalyzing',
  'leading to',
  'resulting in',
  'reshaping',
  'transforming',
  'establishing',
  'triggering',
  'pioneering',
  'revolutionizing',
  'introducing',
  'advancing',
  'shaping',
];

const CAUSAL_REGEX = new RegExp(CAUSAL_CONNECTORS.join('|'), 'i');

/**
 * Check if a description looks like a title-cased label.
 * Heuristic: split on spaces, >50% of words start with uppercase,
 * and word count <= 4.
 */
function isTitleCasedLabel(text) {
  const trimmed = text.trim();
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0 || words.length > 4) return false;

  const uppercaseStarts = words.filter(w => /^[A-Z]/.test(w)).length;
  return (uppercaseStarts / words.length) > 0.5;
}

/**
 * Check if a description is an actual sentence.
 * Must contain at least one verb-like word AND contain a period or comma.
 *
 * Verb-like heuristic: words ending in common verb suffixes
 * (-ed, -ing, -ize, -ise, -ate, -ify) or common short verbs.
 */
function isSentence(text) {
  const hasPunctuation = /[.,]/.test(text);
  if (!hasPunctuation) return false;

  const verbPattern = /\b\w+(ed|ing|ize|ise|ate|ify)\b/i;
  const commonVerbs = /\b(is|was|were|are|had|has|have|did|does|made|led|set|put|ran|got|gave|took|came|went|said|became|created|founded|built|wrote|fought|changed|shaped|formed|played|served|helped|caused|brought|used|known)\b/i;

  return verbPattern.test(text) || commonVerbs.test(text);
}

/**
 * Compute the median of a sorted numeric array.
 */
function median(arr) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

/**
 * Main computation function. Returns:
 * {
 *   substantiveness: {
 *     [model]: {
 *       meanLength, medianLength, pctKeywordOnly, pctTitleCased,
 *       pctCausalLanguage, pctSentences, totalDescriptions
 *     }
 *   }
 * }
 */
function compute() {
  const db = new Database(DB_PATH, { readonly: true });

  // Get all models
  const models = db.prepare(
    'SELECT DISTINCT source FROM rankings ORDER BY source'
  ).all().map(r => r.source);

  const substantiveness = {};

  for (const model of models) {
    // Fetch all non-null contributions for this model
    const rows = db.prepare(`
      SELECT contribution FROM rankings
      WHERE source = ?
        AND contribution IS NOT NULL
        AND LENGTH(TRIM(contribution)) > 0
    `).all(model);

    const contributions = rows.map(r => r.contribution.trim());
    const total = contributions.length;

    if (total === 0) {
      substantiveness[model] = {
        meanLength: 0,
        medianLength: 0,
        pctKeywordOnly: 0,
        pctTitleCased: 0,
        pctCausalLanguage: 0,
        pctSentences: 0,
        totalDescriptions: 0,
      };
      continue;
    }

    // Length metrics
    const lengths = contributions.map(c => c.length);
    const meanLength = round1(lengths.reduce((a, b) => a + b, 0) / total);
    const medianLength = round1(median(lengths));

    // % under 20 characters (keyword-only)
    const keywordOnly = contributions.filter(c => c.length < 20).length;
    const pctKeywordOnly = round2((keywordOnly / total) * 100);

    // % title-cased labels
    const titleCased = contributions.filter(c => isTitleCasedLabel(c)).length;
    const pctTitleCased = round2((titleCased / total) * 100);

    // % with causal connectors
    const causal = contributions.filter(c => CAUSAL_REGEX.test(c)).length;
    const pctCausalLanguage = round2((causal / total) * 100);

    // % that are actual sentences
    const sentences = contributions.filter(c => isSentence(c)).length;
    const pctSentences = round2((sentences / total) * 100);

    substantiveness[model] = {
      meanLength,
      medianLength,
      pctKeywordOnly,
      pctTitleCased,
      pctCausalLanguage,
      pctSentences,
      totalDescriptions: total,
    };
  }

  db.close();

  return { substantiveness };
}

module.exports = { compute };

// --- Main block: run directly ---
if (require.main === module) {
  const result = compute();
  const models = Object.entries(result.substantiveness)
    .sort(([, a], [, b]) => b.meanLength - a.meanLength);

  console.log('');
  console.log('========================================================================');
  console.log('  HistoryBench: Description Substantiveness Metrics');
  console.log('========================================================================');
  console.log('');

  const hdr = [
    'Model'.padEnd(26),
    'Mean'.padStart(6),
    'Med'.padStart(6),
    'Kw%'.padStart(6),
    'Title%'.padStart(7),
    'Causal%'.padStart(8),
    'Sent%'.padStart(7),
    'N'.padStart(6),
  ].join(' ');

  console.log(hdr);
  console.log('-'.repeat(hdr.length));

  for (const [model, m] of models) {
    console.log([
      model.padEnd(26),
      String(m.meanLength).padStart(6),
      String(m.medianLength).padStart(6),
      m.pctKeywordOnly.toFixed(1).padStart(6),
      m.pctTitleCased.toFixed(1).padStart(7),
      m.pctCausalLanguage.toFixed(1).padStart(8),
      m.pctSentences.toFixed(1).padStart(7),
      String(m.totalDescriptions).padStart(6),
    ].join(' '));
  }

  console.log('');
  console.log('Legend:');
  console.log('  Mean/Med  = Mean/Median description length (chars)');
  console.log('  Kw%       = % of descriptions under 20 chars (keyword-only)');
  console.log('  Title%    = % that look like title-cased labels (<=4 words, >50% capitalized)');
  console.log('  Causal%   = % containing causal connectors (enabling, reshaping, etc.)');
  console.log('  Sent%     = % that are actual sentences (verb + punctuation)');
  console.log('  N         = Total descriptions analyzed');
  console.log('');
}
