'use client';

import { Input } from '@/components/ui/input';
import { Search, X } from 'lucide-react';

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
}

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
  'Medieval',
  'Early Modern',
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
  'Mesoamerica & Caribbean',
  'South America',
  'Oceania',
];

const MODEL_SOURCES = [
  { id: null, label: 'All LLMs (average)' },
  { id: 'claude-opus-4.5', label: 'Claude Opus 4.5' },
  { id: 'claude-sonnet-4.5', label: 'Claude Sonnet 4.5' },
  { id: 'gemini-flash-3-preview', label: 'Gemini Flash 3 Preview' },
  { id: 'gemini-pro-3', label: 'Gemini Pro 3' },
  { id: 'gpt-5.2-thinking', label: 'GPT 5.2 Thinking' },
  { id: 'grok-4', label: 'Grok 4' },
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
}: RankingsFiltersProps) {
  return (
    <div className="flex flex-wrap gap-4 items-center">
      {/* Search */}
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
        <Input
          placeholder="Search figures..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="pl-9 bg-white border-stone-200"
        />
        {search && (
          <button
            onClick={() => onSearchChange('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Domain filter */}
      <select
        value={domain || ''}
        onChange={(e) => onDomainChange(e.target.value || null)}
        className="px-3 py-2 text-sm border border-stone-200 rounded-md bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        <option value="">All Domains</option>
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
        className="px-3 py-2 text-sm border border-stone-200 rounded-md bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        <option value="">All Eras</option>
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
        className="px-3 py-2 text-sm border border-stone-200 rounded-md bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        <option value="">All Regions</option>
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
        className="px-3 py-2 text-sm border border-stone-200 rounded-md bg-white text-stone-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
      >
        {MODEL_SOURCES.map((m) => (
          <option key={m.label} value={m.id || ''}>
            {m.label}
          </option>
        ))}
      </select>

      {/* Clear filters */}
      {(domain || era || region || modelSource || search) && (
        <button
          onClick={() => {
            onSearchChange('');
            onDomainChange(null);
            onEraChange(null);
            onRegionChange(null);
            onModelSourceChange(null);
          }}
          className="text-sm text-stone-500 hover:text-stone-700 underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
