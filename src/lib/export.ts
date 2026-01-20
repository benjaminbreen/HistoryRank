/**
 * Export utilities for HistoryRank data
 * Enables researchers to download datasets for independent analysis
 */

export interface ExportMetadata {
  exported_at: string;
  version: string;
  total_records: number;
  filters_applied: Record<string, string | null>;
  models_included: string[];
  citation: string;
  documentation_url: string;
}

/**
 * Escape a value for CSV output
 * Handles strings with commas, quotes, and newlines
 */
export function escapeCSV(value: unknown): string {
  if (value === null || value === undefined) {
    return '';
  }

  const str = String(value);

  // If contains comma, quote, or newline, wrap in quotes and escape internal quotes
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

/**
 * Convert an array of objects to CSV string
 */
export function toCSV<T>(
  data: T[],
  columns: { key: keyof T; header: string }[]
): string {
  const headers = columns.map(c => escapeCSV(c.header)).join(',');

  const rows = data.map(row =>
    columns.map(c => escapeCSV(row[c.key])).join(',')
  );

  return [headers, ...rows].join('\n');
}

/**
 * Format a year for display (handles BCE dates)
 */
export function formatYear(year: number | null): string {
  if (year === null) return '';
  if (year < 0) return `${Math.abs(year)} BCE`;
  return String(year);
}

/**
 * Generate export metadata
 */
export function generateMetadata(
  totalRecords: number,
  filters: Record<string, string | null>,
  models: string[]
): ExportMetadata {
  return {
    exported_at: new Date().toISOString(),
    version: '1.0',
    total_records: totalRecords,
    filters_applied: filters,
    models_included: models,
    citation: 'HistoryRank (2026). LLM Consensus Rankings of Historical Figures. https://historyrank.org',
    documentation_url: 'https://historyrank.org/methodology',
  };
}

/**
 * Figure export row structure
 */
export interface FigureExportRow {
  rank: number;
  id: string;
  name: string;
  birth_year: string;
  death_year: string;
  domain: string;
  occupation: string;
  era: string;
  region: string;
  llm_consensus_rank: string;
  hpi_rank: string;
  variance_score: string;
  variance_level: string;
  pageviews_2025: string;
  pageviews_global: string;
  badges: string;
  wikipedia_url: string;
}

/**
 * Column definitions for figures CSV export
 */
export const FIGURE_CSV_COLUMNS: { key: keyof FigureExportRow; header: string }[] = [
  { key: 'rank', header: 'Rank' },
  { key: 'id', header: 'ID' },
  { key: 'name', header: 'Name' },
  { key: 'birth_year', header: 'Birth Year' },
  { key: 'death_year', header: 'Death Year' },
  { key: 'domain', header: 'Domain' },
  { key: 'occupation', header: 'Occupation' },
  { key: 'era', header: 'Era' },
  { key: 'region', header: 'Region' },
  { key: 'llm_consensus_rank', header: 'LLM Consensus Rank' },
  { key: 'hpi_rank', header: 'HPI Rank' },
  { key: 'variance_score', header: 'Variance Score' },
  { key: 'variance_level', header: 'Variance Level' },
  { key: 'pageviews_2025', header: 'Wikipedia Pageviews (2025)' },
  { key: 'pageviews_global', header: 'Wikipedia Pageviews (Global)' },
  { key: 'badges', header: 'Badges' },
  { key: 'wikipedia_url', header: 'Wikipedia URL' },
];

/**
 * Ranking export row structure
 */
export interface RankingExportRow {
  figure_id: string;
  figure_name: string;
  model: string;
  rank: number;
  contribution: string;
}

/**
 * Column definitions for rankings CSV export
 */
export const RANKING_CSV_COLUMNS: { key: keyof RankingExportRow; header: string }[] = [
  { key: 'figure_id', header: 'Figure ID' },
  { key: 'figure_name', header: 'Figure Name' },
  { key: 'model', header: 'Model' },
  { key: 'rank', header: 'Rank' },
  { key: 'contribution', header: 'Contribution' },
];

/**
 * Model labels for human-readable output
 */
export const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4.5': 'Claude Opus 4.5',
  'claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'gpt-5.2-thinking': 'GPT 5.2 Thinking',
  'gemini-pro-3': 'Gemini Pro 3',
  'gemini-flash-3-preview': 'Gemini Flash 3 Preview',
  'grok-4': 'Grok 4',
  'grok-4.1-fast': 'Grok 4.1 Fast',
  'deepseek-v3.2': 'DeepSeek V3.2',
  'qwen3': 'Qwen 3',
  'glm-4.7': 'GLM 4.7',
  'mistral-large-3': 'Mistral Large 3',
};

/**
 * Variance level labels
 */
export const VARIANCE_LEVEL_LABELS: Record<string, string> = {
  'undisputed': 'High Consensus',
  'consensus': 'Consensus',
  'mixed': 'Mixed',
  'contested': 'Contested',
  'controversial': 'High Variance',
};
