// Type definitions for HistoryRank

export interface Figure {
  id: string;
  canonicalName: string;
  birthYear: number | null;
  deathYear: number | null;
  domain: string | null;
  occupation: string | null;
  era: string | null;
  wikipediaSlug: string | null;
  wikipediaExtract: string | null;
  pageviews2024: number | null;
  pageviews2025: number | null;
  hpiRank: number | null;
  hpiScore: number | null;
  llmConsensusRank: number | null;
  varianceScore: number | null;
}

export interface Ranking {
  id: number;
  figureId: string;
  source: string;
  sampleId: string | null;
  rank: number;
  contribution: string | null;
  rawName: string;
}

export interface FigureWithRankings extends Figure {
  rankings: Ranking[];
}

// For the table display
export interface FigureRow {
  id: string;
  name: string;
  birthYear: number | null;
  domain: string | null;
  era: string | null;
  hpiRank: number | null;
  llmRank: number | null; // Position 1-1000 based on LLM consensus (null if no LLM data)
  llmConsensusRank: number | null; // Raw average consensus score
  varianceScore: number | null;
  pageviews: number | null;
  varianceLevel: 'low' | 'medium' | 'high';
  wikipediaSlug: string | null; // For thumbnail fetching
}

// API response types
export interface FiguresResponse {
  figures: FigureRow[];
  total: number;
}

export interface FigureDetailResponse {
  figure: Figure;
  rankings: Ranking[];
}

// Filter options
export interface FilterState {
  domain: string | null;
  era: string | null;
  search: string;
  sortBy: 'hpiRank' | 'llmConsensusRank' | 'varianceScore' | 'name' | 'pageviews';
  sortOrder: 'asc' | 'desc';
}

// Variance levels for display
export function getVarianceLevel(score: number | null): 'low' | 'medium' | 'high' {
  if (score === null) return 'low';
  if (score < 0.15) return 'low';
  if (score < 0.3) return 'medium';
  return 'high';
}

// Source display names
export const SOURCE_LABELS: Record<string, string> = {
  'pantheon': 'MIT Pantheon',
  'claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'claude-opus-4.5': 'Claude Opus 4.5',
  'gemini-flash-3': 'Gemini Flash 3',
  'gemini-pro-3': 'Gemini Pro 3',
  'gpt-4o': 'GPT-4o',
};

// Domain colors for visualization
export const DOMAIN_COLORS: Record<string, string> = {
  'Science': '#3b82f6',
  'Religion': '#8b5cf6',
  'Philosophy': '#6366f1',
  'Politics': '#ef4444',
  'Military': '#f97316',
  'Arts': '#10b981',
  'Exploration': '#06b6d4',
  'Economics': '#f59e0b',
  'Medicine': '#ec4899',
  'Social Reform': '#14b8a6',
  'Other': '#6b7280',
};

// Era colors for visualization (warm gradient from ancient to modern)
export const ERA_COLORS: Record<string, string> = {
  'Ancient': '#92400e',      // warm brown
  'Classical': '#b45309',    // amber
  'Medieval': '#ca8a04',     // yellow
  'Early Modern': '#65a30d', // lime
  'Modern': '#0891b2',       // cyan
  'Contemporary': '#7c3aed', // violet
};

// Scatter plot types
export type AxisOption =
  | 'hpiRank'
  | 'llmConsensusRank'
  | 'pageviews'
  | 'claude-sonnet-4.5'
  | 'claude-opus-4.5'
  | 'gemini-flash-3'
  | 'gemini-pro-3';

export type ColorMode = 'domain' | 'era' | 'variance' | 'solid';
export type SizeMode = 'fixed' | 'pageviews' | 'variance';

export interface ScatterPlotConfig {
  xAxis: AxisOption;
  yAxis: AxisOption;
  colorMode: ColorMode;
  sizeMode: SizeMode;
  showDiagonal: boolean;
  showTrendLine: boolean;
  showOutlierLabels: boolean;
  domains: string[];
  eras: string[];
  rankRange: [number, number];
  highlightSearch: string;
}

export interface ScatterDataPoint {
  id: string;
  name: string;
  x: number | null;
  y: number | null;
  domain: string | null;
  era: string | null;
  birthYear: number | null;
  pageviews: number | null;
  varianceScore: number | null;
  hpiRank: number | null;
  llmConsensusRank: number | null;
  // Individual source ranks are added dynamically
  [key: string]: string | number | null | undefined;
}

export interface ScatterPlotResponse {
  points: ScatterDataPoint[];
  availableSources: string[];
}

export const AXIS_LABELS: Record<AxisOption, string> = {
  'hpiRank': 'Pantheon HPI Rank',
  'llmConsensusRank': 'LLM Consensus Rank',
  'pageviews': 'Wikipedia Pageviews (2025)',
  'claude-sonnet-4.5': 'Claude Sonnet 4.5 Rank',
  'claude-opus-4.5': 'Claude Opus 4.5 Rank',
  'gemini-flash-3': 'Gemini Flash 3 Rank',
  'gemini-pro-3': 'Gemini Pro 3 Rank',
};
