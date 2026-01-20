'use client';

import { Input } from '@/components/ui/input';
import { Tooltip } from '@/components/ui/tooltip';
import { Search, X, Gem, Radar, Globe, Crown, TrendingUp, Bot, BookOpen, ScrollText, PenLine, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { BadgeType } from '@/types';
import { BADGE_DEFINITIONS } from '@/types';

interface RankingsFiltersProps {
  search: string;
  onSearchChange: (value: string) => void;
  domain: string | null;
  onDomainChange: (value: string | null) => void;
  era: string | null;
  onEraChange: (value: string | null) => void;
  region: string | null;
  onRegionChange: (value: string | null) => void;
  modelSource: string | null;
  onModelSourceChange: (value: string | null) => void;
  badgeFilter: BadgeType | null;
  onBadgeFilterChange: (value: BadgeType | null) => void;
  isLoading?: boolean;
  resultCount?: number;
  totalCount?: number;
}

// Badge filter buttons configuration
const BADGE_FILTERS: { type: BadgeType; icon: typeof Gem; color: string }[] = [
  { type: 'hidden-gem', icon: Gem, color: 'text-cyan-600 bg-cyan-50 border-cyan-200 hover:bg-cyan-100' },
  { type: 'under-the-radar', icon: Radar, color: 'text-sky-600 bg-sky-50 border-sky-200 hover:bg-sky-100' },
  { type: 'historians-favorite', icon: ScrollText, color: 'text-stone-600 bg-stone-100 border-stone-300 hover:bg-stone-200' },
  { type: 'underwritten', icon: PenLine, color: 'text-orange-600 bg-orange-50 border-orange-200 hover:bg-orange-100' },
  { type: 'global-icon', icon: Globe, color: 'text-teal-600 bg-teal-50 border-teal-200 hover:bg-teal-100' },
  { type: 'universal-recognition', icon: Crown, color: 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100' },
  { type: 'popular', icon: TrendingUp, color: 'text-rose-600 bg-rose-50 border-rose-200 hover:bg-rose-100' },
  { type: 'llm-favorite', icon: Bot, color: 'text-indigo-600 bg-indigo-50 border-indigo-200 hover:bg-indigo-100' },
  { type: 'legacy-leaning', icon: BookOpen, color: 'text-violet-600 bg-violet-50 border-violet-200 hover:bg-violet-100' },
];

const DOMAINS = [
  'Science',
  'Religion',
  'Philosophy',
  'Politics',
  'Military',
  'Arts',
  'Exploration',
  'Economics',
  'Medicine',
  'Social Reform',
];

const ERAS = [
  'Ancient',
  'Classical',
  'Late Antiquity',
  'Medieval',
  'Early Modern',
  'Industrial',
  'Modern',
  'Contemporary',
];

const REGIONS = [
  'Northern Europe',
  'Western Europe',
  'Southern Europe',
  'Eastern Europe',
  'North Africa',
  'West Africa',
  'East Africa',
  'Central Africa',
  'Southern Africa',
  'Western Asia',
  'Central Asia',
  'South Asia',
  'East Asia',
  'Southeast Asia',
  'North America',
  'Central America',
  'South America',
  'Oceania',
];

const MODEL_SOURCES = [
  { id: null, label: 'All LLMs (average)' },
  { id: 'claude-opus-4.5', label: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { id: 'deepseek-v3.2', label: 'DeepSeek v3.2' },
  { id: 'gemini-flash-3-preview', label: 'Gemini Flash 3 Preview' },
  { id: 'gemini-pro-3', label: 'Gemini Pro 3' },
  { id: 'gpt-5.2-thinking', label: 'GPT 5.2 Thinking' },
  { id: 'grok-4.1-fast', label: 'Grok 4.1 Fast' },
  { id: 'mistral-large-3', label: 'Mistral Large 3' },
  { id: 'qwen3', label: 'Qwen 3' },
];

export function RankingsFilters({
  search,
  onSearchChange,
  domain,
  onDomainChange,
  era,
  onEraChange,
  region,
  onRegionChange,
  modelSource,
  onModelSourceChange,
  badgeFilter,
  onBadgeFilterChange,
  isLoading = false,
  resultCount,
  totalCount,
}: RankingsFiltersProps) {
  const hasActiveFilters = search || domain || era || region || modelSource || badgeFilter;
  const showResultCount = hasActiveFilters && resultCount !== undefined && totalCount !== undefined;

  return (
    <div className="flex flex-wrap gap-2 sm:gap-3 items-center">
      {/* Search */}
      <div className="relative w-full sm:flex-1 sm:min-w-[160px] sm:max-w-[240px]">
        {isLoading ? (
          <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500 animate-spin" />
        ) : (
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 dark:text-slate-500" />
        )}
        <Input
          placeholder="Search figures..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className={cn(
            "pl-9 bg-white dark:bg-slate-800 border-stone-200 dark:border-slate-600",
            isLoading && "border-amber-300 dark:border-amber-700"
          )}
        />
        {search && !isLoading && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 dark:text-slate-500 hover:text-stone-600 dark:hover:text-slate-300 min-w-[44px] min-h-[44px] flex items-center justify-center -mr-2"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Result count indicator */}
      {showResultCount && (
        <div className="hidden sm:flex items-center text-xs text-stone-500 dark:text-slate-400 whitespace-nowrap">
          <span className="font-medium text-stone-700 dark:text-slate-300">{resultCount}</span>
          <span className="mx-1">of</span>
          <span>{totalCount}</span>
        </div>
      )}

      {/* Domain filter */}
      <select
        value={domain || ''}
        onChange={(e) => onDomainChange(e.target.value || null)}
        className="flex-1 sm:flex-none px-2 sm:px-3 py-2 text-xs sm:text-sm border border-stone-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-stone-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[44px]"
      >
        <option value="">Domain</option>
        {DOMAINS.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>

      {/* Era filter */}
      <select
        value={era || ''}
        onChange={(e) => onEraChange(e.target.value || null)}
        className="flex-1 sm:flex-none px-2 sm:px-3 py-2 text-xs sm:text-sm border border-stone-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-stone-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[44px]"
      >
        <option value="">Era</option>
        {ERAS.map((e) => (
          <option key={e} value={e}>
            {e}
          </option>
        ))}
      </select>

      {/* Region filter */}
      <select
        value={region || ''}
        onChange={(e) => onRegionChange(e.target.value || null)}
        className="flex-1 sm:flex-none px-2 sm:px-3 py-2 text-xs sm:text-sm border border-stone-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-stone-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[44px]"
      >
        <option value="">Region</option>
        {REGIONS.map((r) => (
          <option key={r} value={r}>
            {r}
          </option>
        ))}
      </select>

      {/* Model selector */}
      <select
        value={modelSource || ''}
        onChange={(e) => onModelSourceChange(e.target.value || null)}
        className="w-full sm:w-auto px-2 sm:px-3 py-2 text-xs sm:text-sm border border-stone-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-stone-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500 min-h-[44px]"
      >
        {MODEL_SOURCES.map((m) => (
          <option key={m.label} value={m.id || ''}>
            {m.label}
          </option>
        ))}
      </select>

      {/* Badge filter icons */}
      <div className="flex items-center gap-1 w-full sm:w-auto sm:border-l border-stone-200 dark:border-slate-700 sm:pl-3 sm:ml-1 pt-2 sm:pt-0 border-t sm:border-t-0">
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {BADGE_FILTERS.map(({ type, icon: Icon, color }) => {
            const badge = BADGE_DEFINITIONS[type];
            const isActive = badgeFilter === type;
            return (
              <Tooltip
                key={type}
                content={
                  <div className="max-w-xs">
                    <p className="font-medium">{badge.label}</p>
                    <p className="text-stone-500 dark:text-slate-400 text-xs mt-0.5">{badge.description}</p>
                  </div>
                }
              >
                <button
                  onClick={() => onBadgeFilterChange(isActive ? null : type)}
                  className={cn(
                    'p-2 sm:p-1 rounded border transition-all min-w-[44px] min-h-[44px] sm:min-w-0 sm:min-h-0 flex items-center justify-center',
                    isActive
                      ? `${color} ring-2 ring-offset-1 ring-stone-400 dark:ring-slate-500`
                      : 'text-stone-400 dark:text-slate-500 bg-white dark:bg-slate-800 border-stone-200 dark:border-slate-600 hover:text-stone-600 dark:hover:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-700'
                  )}
                  aria-label={`Filter by ${badge.label}`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              </Tooltip>
            );
          })}
        </div>
      </div>

      {/* Clear filters */}
      {(domain || era || region || modelSource || search || badgeFilter) && (
        <button
          onClick={() => {
            onSearchChange('');
            onDomainChange(null);
            onEraChange(null);
            onRegionChange(null);
            onModelSourceChange(null);
            onBadgeFilterChange(null);
          }}
          className="text-sm text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200 underline py-2"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
