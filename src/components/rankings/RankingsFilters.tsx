'use client';

import { useState, useRef, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Search, X, Gem, Radar, Globe, Crown, TrendingUp, Bot, BookOpen, ScrollText, PenLine, Loader2, Tag, ChevronDown } from 'lucide-react';
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
  smartSearch: boolean;
  onSmartSearchChange: (value: boolean) => void;
  showSmartSearchToggle: boolean;
  onSearchFocus?: () => void;
  onSearchBlur?: () => void;
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

const selectClass = "h-9 px-3 py-0 text-sm border border-stone-200 dark:border-slate-600 rounded-md bg-white dark:bg-slate-800 text-stone-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/40 focus:border-amber-400";

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
  smartSearch,
  onSmartSearchChange,
  showSmartSearchToggle,
  onSearchFocus,
  onSearchBlur,
  isLoading = false,
  resultCount,
  totalCount,
}: RankingsFiltersProps) {
  const hasActiveFilters = search || domain || era || region || modelSource || badgeFilter;
  const showResultCount = hasActiveFilters && resultCount !== undefined && totalCount !== undefined;
  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const tagsRef = useRef<HTMLDivElement>(null);

  // Close tags popover on outside click
  useEffect(() => {
    if (!isTagsOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (tagsRef.current && !tagsRef.current.contains(e.target as Node)) {
        setIsTagsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isTagsOpen]);

  const activeBadgeLabel = badgeFilter ? BADGE_DEFINITIONS[badgeFilter]?.label : null;

  return (
    <div className="space-y-3">
      {/* Row 1: Search (prominent) + selects */}
      <div className="flex flex-wrap gap-2 items-center">
        {/* Search — wider, more prominent */}
        <div className="relative w-full sm:flex-1 sm:min-w-[220px] sm:max-w-[320px]">
          {isLoading ? (
            <Loader2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-amber-500 animate-spin" />
          ) : (
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400 dark:text-slate-500" />
          )}
          <Input
            placeholder="Search figures..."
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            onFocus={onSearchFocus}
            onBlur={onSearchBlur}
            className={cn(
              "pl-9 h-9 bg-white dark:bg-slate-800 border-stone-200 dark:border-slate-600 text-sm",
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

        {showSmartSearchToggle && (
          <label className="flex items-center gap-2 text-xs text-stone-600 dark:text-slate-400 select-none">
            <input
              type="checkbox"
              checked={smartSearch}
              onChange={(e) => onSmartSearchChange(e.target.checked)}
              className="h-4 w-4 rounded border-stone-300 text-amber-600 focus:ring-amber-500"
            />
            Smart search
          </label>
        )}

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
          className={cn(selectClass, "flex-1 sm:flex-none")}
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
          className={cn(selectClass, "flex-1 sm:flex-none")}
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
          className={cn(selectClass, "flex-1 sm:flex-none")}
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
          className={cn(selectClass, "w-full sm:w-auto")}
        >
          {MODEL_SOURCES.map((m) => (
            <option key={m.label} value={m.id || ''}>
              {m.label}
            </option>
          ))}
        </select>

        {/* Tags popover — replaces 9 inline badge buttons */}
        <div ref={tagsRef} className="relative">
          <button
            onClick={() => setIsTagsOpen((o) => !o)}
            className={cn(
              "flex items-center gap-1.5 h-9 px-3 text-sm rounded-md border transition-colors",
              badgeFilter
                ? "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-700 dark:bg-amber-900/30 dark:text-amber-200"
                : "border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-300 hover:border-stone-300 dark:hover:border-slate-500"
            )}
          >
            <Tag className="h-3.5 w-3.5" />
            <span className="hidden sm:inline">{activeBadgeLabel || 'Tags'}</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isTagsOpen ? 'rotate-180' : ''}`} />
          </button>
          <div
            className={`absolute right-0 sm:left-0 mt-2 w-64 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 z-50 transition-all ${
              isTagsOpen ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-1'
            }`}
          >
            {badgeFilter && (
              <button
                onClick={() => { onBadgeFilterChange(null); setIsTagsOpen(false); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-stone-500 dark:text-slate-400 hover:bg-stone-50 dark:hover:bg-slate-700/50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Clear filter
              </button>
            )}
            {BADGE_FILTERS.map(({ type, icon: Icon, color }) => {
              const badge = BADGE_DEFINITIONS[type];
              const isActive = badgeFilter === type;
              return (
                <button
                  key={type}
                  onClick={() => {
                    onBadgeFilterChange(isActive ? null : type);
                    setIsTagsOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center gap-2.5 px-3 py-2 text-sm transition-colors',
                    isActive
                      ? `${color} font-medium`
                      : 'text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-700/50'
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{badge.label}</span>
                </button>
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
            className="text-sm text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200 underline underline-offset-2 py-2"
          >
            Clear all
          </button>
        )}
      </div>
    </div>
  );
}
