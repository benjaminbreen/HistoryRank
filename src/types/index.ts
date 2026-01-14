// Type definitions for HistoryRank

export interface Figure {
  id: string;
  canonicalName: string;
  birthYear: number | null;
  deathYear: number | null;
  domain: string | null;
  occupation: string | null;
  era: string | null;
  regionMacro: string | null;
  regionSub: string | null;
  birthPolity: string | null;
  birthPlace: string | null;
  birthLat: number | null;
  birthLon: number | null;
  wikipediaSlug: string | null;
  wikipediaExtract: string | null;
  pageviews2024: number | null;
  pageviews2025: number | null;
  pageviewsByLanguage: Record<string, number> | null;
  pageviewsGlobal: number | null;
  hpiRank: number | null;
  hpiScore: number | null;
  llmConsensusRank: number | null;
  varianceScore: number | null;
}

// Language codes and names for pageview display
export const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  de: 'German',
  fr: 'French',
  es: 'Spanish',
  ja: 'Japanese',
  ru: 'Russian',
  zh: 'Chinese',
  pt: 'Portuguese',
  it: 'Italian',
  ar: 'Arabic',
};

export const LANGUAGE_FLAGS: Record<string, string> = {
  en: '🇬🇧',
  de: '🇩🇪',
  fr: '🇫🇷',
  es: '🇪🇸',
  ja: '🇯🇵',
  ru: '🇷🇺',
  zh: '🇨🇳',
  pt: '🇵🇹',
  it: '🇮🇹',
  ar: '🇸🇦',
};

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
  regionSub: string | null;
  hpiRank: number | null;
  llmRank: number | null; // Position 1-1000 based on LLM consensus (null if no LLM data)
  llmConsensusRank: number | null; // Raw average consensus score
  varianceScore: number | null;
  pageviews: number | null;
  varianceLevel: VarianceLevel;
  badges: BadgeType[];
  wikipediaSlug: string | null; // For thumbnail fetching
}

// API response types
export interface FiguresResponse {
  figures: FigureRow[];
  total: number;
  stats?: {
    totalLists: number;
    totalModels: number;
  };
}

export interface MapPoint {
  id: string;
  name: string;
  lat: number;
  lon: number;
  birthYear: number | null;
  rank: number | null;
  domain: string | null;
  era: string | null;
  regionSub: string | null;
  wikipediaSlug: string | null;
}

export interface MapResponse {
  points: MapPoint[];
  meta: {
    domains: string[];
    eras: string[];
    sources: string[];
  };
}

export interface FigureDetailResponse {
  figure: Figure;
  rankings: Ranking[];
  aliases?: string[];
}

// Filter options
export interface FilterState {
  domain: string | null;
  era: string | null;
  search: string;
  sortBy: 'hpiRank' | 'llmConsensusRank' | 'varianceScore' | 'name' | 'pageviews' | 'regionSub' | 'domain' | 'era';
  sortOrder: 'asc' | 'desc';
}

// Variance levels for display (5-tier system)
export type VarianceLevel = 'undisputed' | 'consensus' | 'mixed' | 'contested' | 'controversial';

export function getVarianceLevel(score: number | null): VarianceLevel {
  if (score === null) return 'consensus';
  if (score < 0.1) return 'undisputed';
  if (score < 0.4) return 'consensus';
  if (score < 0.7) return 'mixed';
  if (score < 0.85) return 'contested';
  return 'controversial';
}

export const VARIANCE_LABELS: Record<VarianceLevel, string> = {
  'undisputed': 'High Consensus',
  'consensus': 'Consensus',
  'mixed': 'Neutral',
  'contested': 'Variance',
  'controversial': 'High Variance',
};

export const VARIANCE_COLORS: Record<VarianceLevel, { bg: string; text: string; border: string }> = {
  'undisputed': { bg: 'bg-emerald-50', text: 'text-emerald-700', border: 'border-emerald-200' },
  'consensus': { bg: 'bg-green-50', text: 'text-green-700', border: 'border-green-200' },
  'mixed': { bg: 'bg-amber-50', text: 'text-amber-700', border: 'border-amber-200' },
  'contested': { bg: 'bg-orange-50', text: 'text-orange-700', border: 'border-orange-200' },
  'controversial': { bg: 'bg-red-50', text: 'text-red-700', border: 'border-red-200' },
};

// Badge system for highlighting noteworthy patterns
export type BadgeType =
  | 'claude-favorite'
  | 'gpt-favorite'
  | 'gemini-favorite'
  | 'deepseek-favorite'
  | 'qwen-favorite'
  | 'legacy-leaning'        // Pantheon ranks much higher than LLMs
  | 'llm-favorite'          // LLMs rank much higher than HPI
  | 'popular'               // High pageviews, modest rank (was 'hyped')
  | 'hidden-gem'            // High rank + low attention + strong consensus
  | 'under-the-radar'       // High rank + low attention + HPI also undervalues
  | 'global-icon'           // Popular outside Anglophone world
  | 'universal-recognition';// High rank across LLMs, HPI, AND pageviews

export interface Badge {
  type: BadgeType;
  label: string;
  icon: string;
  description: string;
}

export const BADGE_DEFINITIONS: Record<BadgeType, Omit<Badge, 'type'>> = {
  'claude-favorite': {
    label: 'Claude',
    icon: '♡',
    description: 'Claude models rank this figure significantly higher than other sources',
  },
  'gpt-favorite': {
    label: 'GPT',
    icon: '♡',
    description: 'GPT models rank this figure significantly higher than other sources',
  },
  'gemini-favorite': {
    label: 'Gemini',
    icon: '♡',
    description: 'Gemini models rank this figure significantly higher than other sources',
  },
  'deepseek-favorite': {
    label: 'DeepSeek',
    icon: '♡',
    description: 'DeepSeek ranks this figure significantly higher than other sources',
  },
  'qwen-favorite': {
    label: 'Qwen',
    icon: '♡',
    description: 'Qwen ranks this figure significantly higher than other sources',
  },
  'legacy-leaning': {
    label: 'Legacy',
    icon: '📚',
    description: 'Pantheon ranks this figure much higher than LLM consensus',
  },
  'llm-favorite': {
    label: 'AI Pick',
    icon: '🤖',
    description: 'Ranked much higher by LLM consensus than by traditional historical metrics',
  },
  'popular': {
    label: 'Popular',
    icon: '📈',
    description: 'High public interest (pageviews) relative to historical ranking',
  },
  'hidden-gem': {
    label: 'Hidden Gem',
    icon: '💎',
    description: 'Top-ranked with strong LLM consensus but low public attention',
  },
  'under-the-radar': {
    label: 'Under the Radar',
    icon: '◍',
    description: 'Overlooked by both public attention and traditional metrics, but recognized by LLMs',
  },
  'global-icon': {
    label: 'Global',
    icon: '🌍',
    description: 'Highly regarded outside the Anglophone world by both AI models and Wikipedia readers',
  },
  'universal-recognition': {
    label: 'Universal',
    icon: '👑',
    description: 'Recognized across all sources: LLMs, Pantheon, and public attention',
  },
};

// Source display names
export const SOURCE_LABELS: Record<string, string> = {
  'pantheon': 'MIT Pantheon',
  'claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'claude-opus-4.5': 'Claude Opus 4.5',
  'deepseek-v3.2': 'DeepSeek v3.2',
  'gemini-flash-3': 'Gemini Flash 3',
  'gemini-flash-3-preview': 'Gemini Flash 3 Preview',
  'gemini-pro-3': 'Gemini Pro 3',
  'gpt-4o': 'GPT-4o',
  'gpt-5.2-thinking': 'GPT-5.2 Thinking',
  'grok-4.1-fast': 'Grok 4.1 Fast',
  'qwen3': 'Qwen 3',
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

// Region colors for visualization
export const REGION_COLORS: Record<string, string> = {
  'Northern Europe': '#5b7aa6',
  'Western Europe': '#4f6fa1',
  'Southern Europe': '#7a5a9e',
  'Eastern Europe': '#6b6fd1',
  'North Africa': '#b46a4e',
  'West Africa': '#b6783b',
  'East Africa': '#a0624a',
  'Central Africa': '#8a5a4d',
  'Southern Africa': '#7d4a3b',
  'Western Asia': '#b2735b',
  'Central Asia': '#9a7a4a',
  'South Asia': '#c28b3f',
  'East Asia': '#5a9a8f',
  'Southeast Asia': '#4aa39a',
  'North America': '#4f8e6f',
  'Central America': '#4d9b7d',
  'South America': '#6aa15d',
  'Oceania': '#4a8aa8',
};

// Era colors for visualization (warm gradient from ancient to modern)
export const ERA_COLORS: Record<string, string> = {
  'Ancient': '#7c2d12',        // deep brown
  'Classical': '#9a3412',      // burnt orange
  'Late Antiquity': '#b45309', // amber
  'Medieval': '#ca8a04',       // yellow
  'Early Modern': '#65a30d',   // lime
  'Industrial': '#16a34a',     // green
  'Modern': '#0891b2',         // cyan
  'Contemporary': '#7c3aed',   // violet
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
