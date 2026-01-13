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

export function RankingsFilters({
  search,
  onSearchChange,
  domain,
  onDomainChange,
  era,
  onEraChange,
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

      {/* Clear filters */}
      {(domain || era || search) && (
        <button
          onClick={() => {
            onSearchChange('');
            onDomainChange(null);
            onEraChange(null);
          }}
          className="text-sm text-stone-500 hover:text-stone-700 underline"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
