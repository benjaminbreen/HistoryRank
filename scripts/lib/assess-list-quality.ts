/**
 * List Quality Assessment Module
 *
 * Analyzes generated LLM lists for quality issues like repetition,
 * pattern collapse, and structural problems. Used both for automatic
 * post-generation assessment and batch quality reviews.
 */

export type ListEntry = {
  rank: number;
  name: string;
  primary_contribution: string;
};

export type RepetitionIssue = {
  type: 'exact_duplicate' | 'fuzzy_duplicate';
  name: string;
  variants?: string[];
  ranks: number[];
};

export type PatternCollapseIssue = {
  type: 'pattern_collapse';
  pattern: string;
  startRank: number;
  endRank: number;
  count: number;
  examples: string[];
};

export type CategoryCyclingIssue = {
  type: 'category_cycling';
  pattern: string[];
  occurrences: number;
};

export type QualityStatus = 'PASS' | 'WARN' | 'FAIL';

export type ScoreDetail = {
  status: QualityStatus;
  details: string;
};

export type QualityScores = {
  repetition: ScoreDetail & { exact: number; fuzzy: number };
  pattern_collapse: ScoreDetail & { maxSequence: number; sequences: PatternCollapseIssue[] };
  structural: ScoreDetail & { entries: number; validJson: boolean; sequentialRanks: boolean };
  anchor_coverage: ScoreDetail & { found: number; expected: number; missing: string[] };
};

export type DiversityMetrics = {
  estimatedRegions: Record<string, number>;
  estimatedEras: Record<string, number>;
  estimatedDomains: Record<string, number>;
};

export type QualityReport = {
  file: string;
  model: string;
  timestamp: string;
  verdict: QualityStatus;
  scores: QualityScores;
  issues: (RepetitionIssue | PatternCollapseIssue | CategoryCyclingIssue)[];
  diversity: DiversityMetrics;
  summary: string;
};

// Anchor figures that should appear in any reasonable list
const ANCHOR_FIGURES = [
  'jesus', 'muhammad', 'buddha', 'confucius',
  'isaac newton', 'newton', 'albert einstein', 'einstein',
  'charles darwin', 'darwin', 'galileo', 'galileo galilei',
  'aristotle', 'plato', 'socrates',
  'julius caesar', 'caesar', 'alexander', 'alexander the great',
  'napoleon', 'napoleon bonaparte',
  'shakespeare', 'william shakespeare',
  'karl marx', 'marx', 'sigmund freud', 'freud',
  'leonardo da vinci', 'da vinci', 'michelangelo',
  'george washington', 'abraham lincoln', 'lincoln',
  'mao zedong', 'mao', 'gandhi', 'mahatma gandhi',
  'martin luther', 'martin luther king',
  'homer', 'moses', 'paul', 'saint paul', 'paul the apostle',
  'genghis khan', 'qin shi huang',
  'pythagoras', 'euclid', 'archimedes',
  'bach', 'beethoven', 'mozart',
  'copernicus', 'kepler', 'descartes',
  'voltaire', 'rousseau', 'locke', 'john locke',
  'hitler', 'adolf hitler', 'stalin', 'joseph stalin',
];

// Common patterns indicating local minima / pattern collapse
const COLLAPSE_PATTERNS = [
  /basketball player/i,
  /football player/i,
  /soccer player/i,
  /tennis player/i,
  /baseball player/i,
  /hockey player/i,
  /cricket player/i,
  /golfer/i,
  /swimmer/i,
  /athlete/i,
  /youtuber/i,
  /tiktoker/i,
  /influencer/i,
  /blogger/i,
  /streamer/i,
  /podcaster/i,
  /reality tv/i,
  /contestant/i,
];

/**
 * Normalize a name for comparison
 */
function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Levenshtein distance between two strings
 */
function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if two names are fuzzy matches
 */
function isFuzzyMatch(name1: string, name2: string): boolean {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);

  if (n1 === n2) return true;

  // Check if one contains the other (e.g., "Alexander" vs "Alexander the Great")
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Check Levenshtein distance for short names
  const maxLen = Math.max(n1.length, n2.length);
  if (maxLen < 15) {
    const distance = levenshteinDistance(n1, n2);
    if (distance <= 2) return true;
  }

  return false;
}

/**
 * Detect exact and fuzzy duplicate names
 */
function detectRepetition(entries: ListEntry[]): {
  exact: number;
  fuzzy: number;
  issues: RepetitionIssue[];
} {
  const nameMap = new Map<string, number[]>();
  const issues: RepetitionIssue[] = [];

  // First pass: exact duplicates
  for (const entry of entries) {
    const normalized = normalizeName(entry.name);
    const ranks = nameMap.get(normalized) || [];
    ranks.push(entry.rank);
    nameMap.set(normalized, ranks);
  }

  let exactCount = 0;
  for (const [name, ranks] of nameMap) {
    if (ranks.length > 1) {
      exactCount += ranks.length - 1;
      issues.push({
        type: 'exact_duplicate',
        name,
        ranks: ranks.sort((a, b) => a - b),
      });
    }
  }

  // Second pass: fuzzy duplicates (only for unique names)
  const uniqueNames = Array.from(nameMap.entries())
    .filter(([, ranks]) => ranks.length === 1)
    .map(([name, ranks]) => ({ name, rank: ranks[0] }));

  let fuzzyCount = 0;
  const fuzzyGroups = new Map<string, { variants: string[]; ranks: number[] }>();

  for (let i = 0; i < uniqueNames.length; i++) {
    for (let j = i + 1; j < uniqueNames.length; j++) {
      if (isFuzzyMatch(uniqueNames[i].name, uniqueNames[j].name)) {
        const key = uniqueNames[i].name;
        const group = fuzzyGroups.get(key) || { variants: [key], ranks: [uniqueNames[i].rank] };
        if (!group.variants.includes(uniqueNames[j].name)) {
          group.variants.push(uniqueNames[j].name);
          group.ranks.push(uniqueNames[j].rank);
          fuzzyCount++;
        }
        fuzzyGroups.set(key, group);
      }
    }
  }

  for (const [name, group] of fuzzyGroups) {
    if (group.variants.length > 1) {
      issues.push({
        type: 'fuzzy_duplicate',
        name,
        variants: group.variants,
        ranks: group.ranks.sort((a, b) => a - b),
      });
    }
  }

  return { exact: exactCount, fuzzy: fuzzyCount, issues };
}

/**
 * Detect pattern collapse (local minima) in contributions
 */
function detectPatternCollapse(entries: ListEntry[]): {
  maxSequence: number;
  sequences: PatternCollapseIssue[];
} {
  const sequences: PatternCollapseIssue[] = [];
  let maxSequence = 0;

  for (const pattern of COLLAPSE_PATTERNS) {
    let currentRun: ListEntry[] = [];

    for (const entry of entries) {
      if (pattern.test(entry.primary_contribution)) {
        currentRun.push(entry);
      } else {
        if (currentRun.length >= 5) {
          sequences.push({
            type: 'pattern_collapse',
            pattern: pattern.source,
            startRank: currentRun[0].rank,
            endRank: currentRun[currentRun.length - 1].rank,
            count: currentRun.length,
            examples: currentRun.slice(0, 3).map(e => `${e.rank}. ${e.name}`),
          });
          maxSequence = Math.max(maxSequence, currentRun.length);
        }
        currentRun = [];
      }
    }

    // Check final run
    if (currentRun.length >= 5) {
      sequences.push({
        type: 'pattern_collapse',
        pattern: pattern.source,
        startRank: currentRun[0].rank,
        endRank: currentRun[currentRun.length - 1].rank,
        count: currentRun.length,
        examples: currentRun.slice(0, 3).map(e => `${e.rank}. ${e.name}`),
      });
      maxSequence = Math.max(maxSequence, currentRun.length);
    }
  }

  // Also check for generic consecutive similarity
  const windowSize = 10;
  for (let i = 0; i <= entries.length - windowSize; i++) {
    const window = entries.slice(i, i + windowSize);
    const contributions = window.map(e => e.primary_contribution.toLowerCase());

    // Extract common significant words (>4 chars)
    const wordCounts = new Map<string, number>();
    for (const contrib of contributions) {
      const words = contrib.split(/\s+/).filter(w => w.length > 4);
      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }

    // Check if any word appears in 80%+ of entries
    for (const [word, count] of wordCounts) {
      if (count >= windowSize * 0.8 && !['their', 'which', 'about', 'known', 'famous'].includes(word)) {
        // Extend the window to find full extent
        let start = i;
        let end = i + windowSize - 1;

        while (start > 0 && entries[start - 1].primary_contribution.toLowerCase().includes(word)) {
          start--;
        }
        while (end < entries.length - 1 && entries[end + 1].primary_contribution.toLowerCase().includes(word)) {
          end++;
        }

        const sequenceLength = end - start + 1;
        if (sequenceLength >= 10) {
          const existingSeq = sequences.find(s =>
            s.startRank <= entries[start].rank && s.endRank >= entries[end].rank
          );

          if (!existingSeq) {
            sequences.push({
              type: 'pattern_collapse',
              pattern: word,
              startRank: entries[start].rank,
              endRank: entries[end].rank,
              count: sequenceLength,
              examples: entries.slice(start, start + 3).map(e => `${e.rank}. ${e.name}`),
            });
            maxSequence = Math.max(maxSequence, sequenceLength);
          }
        }
      }
    }
  }

  return { maxSequence, sequences };
}

/**
 * Check structural validity
 */
function checkStructural(entries: ListEntry[]): {
  entries: number;
  validJson: boolean;
  sequentialRanks: boolean;
  status: QualityStatus;
  details: string;
} {
  const entryCount = entries.length;
  const validJson = true; // If we got here, JSON was valid

  // Check sequential ranks
  const ranks = entries.map(e => e.rank).sort((a, b) => a - b);
  let sequentialRanks = true;
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) {
      sequentialRanks = false;
      break;
    }
  }

  const issues: string[] = [];
  if (entryCount !== 1000) issues.push(`${entryCount} entries (expected 1000)`);
  if (!sequentialRanks) issues.push('non-sequential ranks');

  let status: QualityStatus = 'PASS';
  if (entryCount < 900 || !sequentialRanks) status = 'FAIL';
  else if (entryCount < 1000) status = 'WARN';

  return {
    entries: entryCount,
    validJson,
    sequentialRanks,
    status,
    details: issues.length ? issues.join('; ') : 'OK',
  };
}

/**
 * Check anchor figure coverage
 */
function checkAnchorCoverage(entries: ListEntry[]): {
  found: number;
  expected: number;
  missing: string[];
  status: QualityStatus;
  details: string;
} {
  const normalizedNames = new Set(entries.map(e => normalizeName(e.name)));

  // Group anchors by canonical figure
  const anchorGroups: string[][] = [];
  const processedAnchors = new Set<string>();

  for (const anchor of ANCHOR_FIGURES) {
    if (processedAnchors.has(anchor)) continue;

    const group = [anchor];
    for (const other of ANCHOR_FIGURES) {
      if (other !== anchor && isFuzzyMatch(anchor, other)) {
        group.push(other);
        processedAnchors.add(other);
      }
    }
    processedAnchors.add(anchor);
    anchorGroups.push(group);
  }

  const missing: string[] = [];
  let found = 0;

  for (const group of anchorGroups) {
    const hasMatch = group.some(anchor => {
      for (const name of normalizedNames) {
        if (name.includes(anchor) || anchor.includes(name)) {
          return true;
        }
      }
      return false;
    });

    if (hasMatch) {
      found++;
    } else {
      missing.push(group[0]);
    }
  }

  const expected = anchorGroups.length;
  const coverage = found / expected;

  let status: QualityStatus = 'PASS';
  if (coverage < 0.7) status = 'FAIL';
  else if (coverage < 0.9) status = 'WARN';

  return {
    found,
    expected,
    missing: missing.slice(0, 10), // Limit to first 10
    status,
    details: `${found}/${expected} anchor figures found (${(coverage * 100).toFixed(0)}%)`,
  };
}

/**
 * Estimate diversity metrics from contributions
 */
function estimateDiversity(entries: ListEntry[]): DiversityMetrics {
  const regions: Record<string, number> = {
    'Europe': 0,
    'Asia': 0,
    'Middle East': 0,
    'Africa': 0,
    'Americas': 0,
    'Oceania': 0,
    'Unknown': 0,
  };

  const eras: Record<string, number> = {
    'Ancient (pre-500)': 0,
    'Medieval (500-1500)': 0,
    'Early Modern (1500-1800)': 0,
    'Modern (1800-1950)': 0,
    'Contemporary (1950+)': 0,
    'Unknown': 0,
  };

  const domains: Record<string, number> = {
    'Politics/Leadership': 0,
    'Science/Technology': 0,
    'Philosophy/Religion': 0,
    'Arts/Literature': 0,
    'Military': 0,
    'Other': 0,
  };

  // Simple keyword-based estimation
  const regionKeywords: Record<string, string[]> = {
    'Europe': ['english', 'french', 'german', 'italian', 'spanish', 'british', 'russian', 'greek', 'roman', 'european'],
    'Asia': ['chinese', 'japanese', 'indian', 'korean', 'vietnamese', 'thai', 'asian'],
    'Middle East': ['persian', 'arab', 'islamic', 'ottoman', 'turkish', 'jewish', 'israeli'],
    'Africa': ['egyptian', 'african', 'ethiopian', 'nigerian'],
    'Americas': ['american', 'mexican', 'brazilian', 'canadian'],
  };

  const domainKeywords: Record<string, string[]> = {
    'Politics/Leadership': ['emperor', 'king', 'queen', 'president', 'prime minister', 'ruler', 'leader', 'statesman', 'politician'],
    'Science/Technology': ['scientist', 'physicist', 'chemist', 'mathematician', 'inventor', 'engineer', 'biologist', 'astronomer'],
    'Philosophy/Religion': ['philosopher', 'theologian', 'prophet', 'religious', 'founder of', 'spiritual'],
    'Arts/Literature': ['artist', 'painter', 'composer', 'musician', 'writer', 'poet', 'playwright', 'novelist', 'author'],
    'Military': ['general', 'admiral', 'military', 'conqueror', 'warrior', 'commander'],
  };

  for (const entry of entries) {
    const contrib = entry.primary_contribution.toLowerCase();

    // Estimate region
    let foundRegion = false;
    for (const [region, keywords] of Object.entries(regionKeywords)) {
      if (keywords.some(kw => contrib.includes(kw))) {
        regions[region]++;
        foundRegion = true;
        break;
      }
    }
    if (!foundRegion) regions['Unknown']++;

    // Estimate domain
    let foundDomain = false;
    for (const [domain, keywords] of Object.entries(domainKeywords)) {
      if (keywords.some(kw => contrib.includes(kw))) {
        domains[domain]++;
        foundDomain = true;
        break;
      }
    }
    if (!foundDomain) domains['Other']++;
  }

  // Era estimation would require birth years, just mark as unknown for now
  eras['Unknown'] = entries.length;

  return {
    estimatedRegions: regions,
    estimatedEras: eras,
    estimatedDomains: domains,
  };
}

/**
 * Main assessment function
 */
export function assessListQuality(
  entries: ListEntry[],
  filename: string,
  model: string
): QualityReport {
  const timestamp = new Date().toISOString();

  // Run all checks
  const repetition = detectRepetition(entries);
  const collapse = detectPatternCollapse(entries);
  const structural = checkStructural(entries);
  const anchors = checkAnchorCoverage(entries);
  const diversity = estimateDiversity(entries);

  // Compile issues
  const issues: (RepetitionIssue | PatternCollapseIssue | CategoryCyclingIssue)[] = [
    ...repetition.issues,
    ...collapse.sequences,
  ];

  // Determine repetition status
  // Generous thresholds: mixing models averages out duplicate errors
  // 200 duplicates = 20% error rate, but 80% signal still useful for consensus
  let repetitionStatus: QualityStatus = 'PASS';
  if (repetition.exact > 200) repetitionStatus = 'FAIL';  // 20%+ error rate = too noisy
  else if (repetition.exact > 50) repetitionStatus = 'WARN';  // 5%+ is notable

  // Determine collapse status
  // 100+ consecutive similar entries = model lost the global task constraint
  let collapseStatus: QualityStatus = 'PASS';
  if (collapse.maxSequence > 100) collapseStatus = 'FAIL';
  else if (collapse.maxSequence > 30) collapseStatus = 'WARN';

  // Compile scores
  const scores: QualityScores = {
    repetition: {
      exact: repetition.exact,
      fuzzy: repetition.fuzzy,
      status: repetitionStatus,
      details: repetition.exact > 0
        ? `${repetition.exact} exact duplicates found`
        : repetition.fuzzy > 0
          ? `${repetition.fuzzy} fuzzy duplicates found`
          : 'No duplicates',
    },
    pattern_collapse: {
      maxSequence: collapse.maxSequence,
      sequences: collapse.sequences,
      status: collapseStatus,
      details: collapse.maxSequence > 0
        ? `Max sequence of ${collapse.maxSequence} similar entries`
        : 'No pattern collapse detected',
    },
    structural: {
      entries: structural.entries,
      validJson: structural.validJson,
      sequentialRanks: structural.sequentialRanks,
      status: structural.status,
      details: structural.details,
    },
    anchor_coverage: {
      found: anchors.found,
      expected: anchors.expected,
      missing: anchors.missing,
      status: anchors.status,
      details: anchors.details,
    },
  };

  // Determine overall verdict
  const statuses = [repetitionStatus, collapseStatus, structural.status, anchors.status];
  let verdict: QualityStatus = 'PASS';
  if (statuses.includes('FAIL')) verdict = 'FAIL';
  else if (statuses.includes('WARN')) verdict = 'WARN';

  // Generate summary
  const summaryParts: string[] = [];
  if (repetition.exact > 0) summaryParts.push(`${repetition.exact} exact duplicates`);
  if (collapse.maxSequence > 5) summaryParts.push(`pattern collapse (max ${collapse.maxSequence})`);
  if (structural.status !== 'PASS') summaryParts.push(structural.details);
  if (anchors.status !== 'PASS') summaryParts.push(`${anchors.missing.length} missing anchors`);

  const summary = verdict === 'PASS'
    ? 'List passes all quality checks'
    : `Issues: ${summaryParts.join('; ')}`;

  return {
    file: filename,
    model,
    timestamp,
    verdict,
    scores,
    issues,
    diversity,
    summary,
  };
}

/**
 * Format report as readable text
 */
export function formatReportAsText(report: QualityReport): string {
  const lines: string[] = [
    `Quality Assessment Report`,
    `========================`,
    `File: ${report.file}`,
    `Model: ${report.model}`,
    `Timestamp: ${report.timestamp}`,
    ``,
    `VERDICT: ${report.verdict}`,
    ``,
    `Summary: ${report.summary}`,
    ``,
    `Scores:`,
    `  Repetition: ${report.scores.repetition.status} - ${report.scores.repetition.details}`,
    `  Pattern Collapse: ${report.scores.pattern_collapse.status} - ${report.scores.pattern_collapse.details}`,
    `  Structural: ${report.scores.structural.status} - ${report.scores.structural.details}`,
    `  Anchor Coverage: ${report.scores.anchor_coverage.status} - ${report.scores.anchor_coverage.details}`,
  ];

  if (report.issues.length > 0) {
    lines.push(``, `Issues (${report.issues.length}):`);
    for (const issue of report.issues.slice(0, 10)) {
      if (issue.type === 'exact_duplicate') {
        lines.push(`  - Exact duplicate: "${issue.name}" at ranks ${issue.ranks.join(', ')}`);
      } else if (issue.type === 'fuzzy_duplicate') {
        lines.push(`  - Fuzzy duplicate: ${issue.variants?.join(' / ')} at ranks ${issue.ranks.join(', ')}`);
      } else if (issue.type === 'pattern_collapse') {
        lines.push(`  - Pattern collapse: "${issue.pattern}" (${issue.count} entries, ranks ${issue.startRank}-${issue.endRank})`);
      }
    }
    if (report.issues.length > 10) {
      lines.push(`  ... and ${report.issues.length - 10} more issues`);
    }
  }

  lines.push(``, `Diversity Estimates:`);
  lines.push(`  Regions: ${Object.entries(report.diversity.estimatedRegions).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ')}`);
  lines.push(`  Domains: ${Object.entries(report.diversity.estimatedDomains).filter(([,v]) => v > 0).map(([k,v]) => `${k}: ${v}`).join(', ')}`);

  return lines.join('\n');
}

/**
 * Parse a list file and return entries
 */
export function parseListFile(content: string): ListEntry[] {
  const start = content.indexOf('[');
  const end = content.lastIndexOf(']');
  if (start === -1 || end === -1) {
    throw new Error('No JSON array found in file');
  }
  const jsonStr = content.slice(start, end + 1);
  const parsed = JSON.parse(jsonStr);
  if (!Array.isArray(parsed)) {
    throw new Error('Parsed content is not an array');
  }
  return parsed as ListEntry[];
}
