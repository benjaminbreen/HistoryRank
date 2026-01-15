'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, ChevronUp, Search, Star } from 'lucide-react';
import type { MediaItem } from '@/lib/media';
import { REGION_COLORS } from '@/types';
import { MediaThumbnail } from '@/components/media/MediaThumbnail';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip } from '@/components/ui/tooltip';

type MediaExplorerProps = {
  items: MediaItem[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
};

type SortKey =
  | 'accuracy'
  | 'quality'
  | 'era_rank'
  | 'title'
  | 'type'
  | 'era'
  | 'depicted'
  | 'region'
  | 'release'
  | 'rating';

function normalize(value: string) {
  return value.toLowerCase().trim();
}

function formatYear(value?: number | null) {
  if (value === null || value === undefined) return '—';
  if (value < 0) return `${Math.abs(value)} BCE`;
  return `${value}`;
}

function formatSpan(start?: number | null, end?: number | null) {
  if (start === null && end === null) return '—';
  if (start === null && end !== null) return formatYear(end);
  if (start !== null && end === null) return formatYear(start);
  if (start === end) return formatYear(start);
  return `${formatYear(start)}–${formatYear(end)}`;
}

function formatYearParts(value?: number | null) {
  if (value === null || value === undefined) return null;
  if (value < 0) {
    return { value: `${Math.abs(value)}`, era: 'BCE' };
  }
  return { value: `${value}`, era: null };
}

const ERA_ORDER = [
  'Ancient',
  'Classical',
  'Late Antiquity',
  'Medieval',
  'Early Modern',
  'Industrial',
  'Modern',
  'Contemporary',
];

function interpolateHsl(a: [number, number, number], b: [number, number, number], t: number) {
  const hue = a[0] + (b[0] - a[0]) * t;
  const sat = a[1] + (b[1] - a[1]) * t;
  const light = a[2] + (b[2] - a[2]) * t;
  return `hsl(${hue} ${sat}% ${light}%)`;
}

function ratingColor(score: number) {
  const clamped = Math.max(5, Math.min(9, score));
  const stops: Array<[number, [number, number, number]]> = [
    [5, [18, 78, 48]],
    [5.5, [26, 82, 52]],
    [6, [38, 86, 54]],
    [6.5, [58, 78, 52]],
    [7, [78, 70, 50]],
    [7.5, [98, 64, 48]],
    [8, [118, 60, 46]],
    [8.5, [132, 56, 44]],
    [9, [142, 52, 42]],
  ];

  for (let index = 0; index < stops.length - 1; index += 1) {
    const [startScore, startColor] = stops[index];
    const [endScore, endColor] = stops[index + 1];
    if (clamped >= startScore && clamped <= endScore) {
      const t = (clamped - startScore) / (endScore - startScore);
      return interpolateHsl(startColor, endColor, t);
    }
  }

  return 'hsl(120 50% 42%)';
}

function ratingLabel(source?: string | null) {
  if (source === 'tmdb') {
    return 'TMDB user rating (The Movie Database).';
  }
  if (source === 'googlebooks') {
    return 'Google Books user rating.';
  }
  return 'User rating.';
}

function ratingSourceName(source?: string | null) {
  if (source === 'tmdb') return 'TMDB';
  if (source === 'googlebooks') return 'Google Books';
  return 'Rating';
}

const CATEGORY_LABELS = [
  { id: 'film', label: 'Films' },
  { id: 'tv', label: 'TV' },
  { id: 'podcast', label: 'Podcasts' },
  { id: 'documentary', label: 'Documentaries' },
  { id: 'game', label: 'Games' },
  { id: 'fiction', label: 'Historical fiction' },
  { id: 'book', label: 'Books' },
  { id: 'other', label: 'Other' },
];

function getCategory(type: string) {
  const value = normalize(type);
  if (value === 'film') return 'film';
  if (value === 'series' || value === 'miniseries' || value === 'tv') return 'tv';
  if (value === 'podcast') return 'podcast';
  if (value === 'documentary') return 'documentary';
  if (value === 'game') return 'game';
  if (value === 'fiction') return 'fiction';
  if (value === 'book' || value === 'novel') return 'book';
  return 'other';
}

export function MediaExplorer({ items, selectedId, onSelect }: MediaExplorerProps) {
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('film');
  const [eraFilter, setEraFilter] = useState('all');
  const [regionFilter, setRegionFilter] = useState('all');
  const [recommendedOnly, setRecommendedOnly] = useState(false);
  const [rankedByEra, setRankedByEra] = useState(true);
  const [sortBy, setSortBy] = useState<SortKey>('era_rank');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const options = useMemo(() => {
    const eras = new Set<string>();
    const regions = new Set<string>();
    items.forEach((item) => {
      item.eras_depicted?.forEach((era) => eras.add(era));
      item.regions_depicted?.forEach((region) => regions.add(region));
    });
    return {
      eras: Array.from(eras).sort(),
      regions: Array.from(regions).sort(),
    };
  }, [items]);

  const filteredData = useMemo(() => {
    const search = normalize(query);
    const filteredItems = items
      .filter((item) => {
        if (recommendedOnly && !item.recommended) return false;
        if (categoryFilter !== 'all' && getCategory(item.type) !== categoryFilter) return false;
        if (eraFilter !== 'all' && item.eras_depicted?.every((era) => era !== eraFilter)) return false;
        if (regionFilter !== 'all' && item.regions_depicted?.every((region) => region !== regionFilter)) return false;
        if (!search) return true;
        const haystack = `${item.title} ${item.summary ?? ''}`.toLowerCase();
        return haystack.includes(search);
      });

    const compareNumber = (a?: number | null, b?: number | null) => {
      const aValue = typeof a === 'number' ? a : null;
      const bValue = typeof b === 'number' ? b : null;
      if (aValue === null && bValue === null) return 0;
      if (aValue === null) return 1;
      if (bValue === null) return -1;
      return aValue - bValue;
    };

    const compareText = (a?: string | null, b?: string | null) => {
      const aValue = (a ?? '').toLowerCase();
      const bValue = (b ?? '').toLowerCase();
      return aValue.localeCompare(bValue);
    };

    const getAccuracy = (item: MediaItem) =>
      typeof item.llm_accuracy_score === 'number'
        ? item.llm_accuracy_score
        : (typeof item.llm_accuracy_rank === 'number' ? item.llm_accuracy_rank : null);
    const getQuality = (item: MediaItem) =>
      typeof item.llm_quality_score === 'number'
        ? item.llm_quality_score
        : (typeof item.llm_quality_rank === 'number' ? item.llm_quality_rank : null);
    const getComposite = (item: MediaItem) => {
      const values = [getAccuracy(item), getQuality(item), item.rating_normalized ?? null]
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value));
      if (values.length === 0) return null;
      return values.reduce((sum, value) => sum + value, 0) / values.length;
    };

    const eraOrder = new Map(ERA_ORDER.map((era, index) => [era, index]));
    const rankById = new Map<string, number>();
    const compareItems = (a: MediaItem, b: MediaItem) => {
      let result = 0;
      switch (sortBy) {
        case 'accuracy':
          result = compareNumber(getAccuracy(a), getAccuracy(b));
          break;
        case 'quality':
          result = compareNumber(getQuality(a), getQuality(b));
          break;
        case 'era_rank': {
          result = compareNumber(getComposite(b), getComposite(a));
          break;
        }
        case 'title':
          result = compareText(a.title, b.title);
          break;
        case 'type':
          result = compareText(a.type, b.type);
          break;
        case 'era':
          result = compareText(a.primary_era, b.primary_era);
          break;
        case 'depicted': {
          const aValue = typeof a.depicted_start_year === 'number'
            ? a.depicted_start_year
            : (typeof a.release_year === 'number' ? a.release_year : null);
          const bValue = typeof b.depicted_start_year === 'number'
            ? b.depicted_start_year
            : (typeof b.release_year === 'number' ? b.release_year : null);
          result = compareNumber(aValue, bValue);
          break;
        }
        case 'region':
          result = compareText(a.primary_region, b.primary_region);
          break;
        case 'release':
          result = compareNumber(a.release_year ?? null, b.release_year ?? null);
          break;
        case 'rating':
          result = compareNumber(a.rating_normalized ?? null, b.rating_normalized ?? null);
          break;
        default:
          result = 0;
      }

      if (result === 0) {
        result = compareText(a.title, b.title);
      }
      return sortOrder === 'asc' ? result : -result;
    };

    const scoreSort = (a: MediaItem, b: MediaItem) => {
      const scoreResult = compareNumber(getComposite(b), getComposite(a));
      if (scoreResult !== 0) return scoreResult;
      return compareText(a.title, b.title);
    };

    let groups: Array<{ era: string; items: MediaItem[] }> = [];
    if (rankedByEra) {
      const grouped = new Map<string, MediaItem[]>();
      for (const item of filteredItems) {
        const era = item.primary_era ?? 'Unknown';
        const bucket = grouped.get(era) ?? [];
        bucket.push(item);
        grouped.set(era, bucket);
      }

      const orderedEras = Array.from(grouped.keys()).sort((a, b) => {
        const orderA = eraOrder.get(a) ?? ERA_ORDER.length;
        const orderB = eraOrder.get(b) ?? ERA_ORDER.length;
        if (orderA !== orderB) return orderA - orderB;
        return compareText(a, b);
      });

      groups = orderedEras.map((era) => {
        const group = grouped.get(era) ?? [];
        const ranked = [...group].sort(scoreSort);
        ranked.forEach((item, index) => {
          rankById.set(item.id, index + 1);
        });
        const displayItems = sortBy === 'era_rank' ? ranked : [...group].sort(compareItems);
        return { era, items: displayItems };
      });
    } else {
      const ranked = [...filteredItems].sort(scoreSort);
      ranked.forEach((item, index) => {
        rankById.set(item.id, index + 1);
      });
    }

    const withSort = rankedByEra ? [] : [...filteredItems].sort(compareItems);

    return { items: withSort, rankById, groups };
  }, [items, query, categoryFilter, eraFilter, regionFilter, recommendedOnly, sortBy, sortOrder, rankedByEra]);

  const formatScore = (value?: number | null) => {
    if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
    return value % 1 === 0 ? value.toFixed(0) : value.toFixed(1);
  };

  const filtered = filteredData.items;
  const groupedByEra = filteredData.groups;
  const rankById = filteredData.rankById;

  const showTypeColumn = categoryFilter === 'all';

  const handleSort = (column: SortKey) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(column);
      setSortOrder('asc');
    }
  };

  const SortHeader = ({ column, children, align }: { column: SortKey; children: React.ReactNode; align?: 'left' | 'center' | 'right' }) => (
    <button
      onClick={() => handleSort(column)}
      className={`flex items-center gap-1 transition-colors hover:text-stone-900 ${
        align === 'right' ? 'ml-auto justify-end' : align === 'center' ? 'mx-auto justify-center' : ''
      }`}
      type="button"
    >
      {children}
      {sortBy === column ? (
        sortOrder === 'asc' ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />
      ) : (
        <span className="flex flex-col leading-none text-stone-300">
          <ChevronUp className="h-2.5 w-2.5 -mb-1" />
          <ChevronDown className="h-2.5 w-2.5" />
        </span>
      )}
    </button>
  );

  const renderTable = (rows: MediaItem[]) => (
    <Table className="[&_[data-slot=table-cell]]:px-3 [&_[data-slot=table-head]]:px-1">
      <TableHeader>
        <TableRow className="bg-stone-50/60">
          <TableHead className="w-[42px] text-center bg-stone-100/70">
            <SortHeader column="era_rank" align="center">
              <Tooltip
                content={
                  rankedByEra
                    ? 'Rank within each era based on average of LLM accuracy, LLM quality, and public ratings.'
                    : 'Overall rank based on average of LLM accuracy, LLM quality, and public ratings.'
                }
              >
                <span className="text-xs uppercase tracking-[0.12em]">Rank</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
          <TableHead className="w-[10px]">
            <SortHeader column="accuracy">
              <Tooltip content="Composite average of LLM-generated accuracy scores (1–10).">
                <span className="text-xs uppercase px-1 tracking-[0.12em]">Acc.</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
          <TableHead className="w-[10px]">
            <SortHeader column="quality">
              <Tooltip content="Composite average of LLM-generated quality scores (1–10).">
                <span className="text-xs uppercase px-0 tracking-[0.12em]">Qual.</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
          <TableHead>
            <SortHeader column="title">
              <Tooltip content="Title of the work.">
                <span className="text-md pl-13 ">Title</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
          {showTypeColumn && (
            <TableHead>
              <SortHeader column="type">
                <Tooltip content="Media format (film, series, documentary, podcast, fiction, game).">
                  <span>Type</span>
                </Tooltip>
              </SortHeader>
            </TableHead>
          )}
          <TableHead>
            <SortHeader column="era">
              <Tooltip content="Primary historical era (with sub-era below).">
                <span className=" pl-1 ">Era</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
          <TableHead>
            <SortHeader column="depicted">
              <Tooltip content="Time period depicted (start–end).">
                <span>Span</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
          <TableHead>
            <SortHeader column="region">
              <Tooltip content="Primary geographic region depicted.">
                <span>Region</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
          <TableHead className="text-right">
            <SortHeader column="release" align="right">
              <Tooltip content="Release or publication year.">
                <span>Release</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
          <TableHead className="text-right">
            <SortHeader column="rating" align="right">
              <Tooltip content="External rating (TMDB/Google Books).">
                <span>Rating</span>
              </Tooltip>
            </SortHeader>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((item) => (
          <TableRow
            key={item.id}
            className={`hover:bg-stone-50/70 transition-colors ${item.id === selectedId ? 'bg-stone-50/80' : ''}`}
            onClick={() => onSelect?.(item.id)}
            role={onSelect ? 'button' : undefined}
            tabIndex={onSelect ? 0 : undefined}
            onKeyDown={(event) => {
              if (!onSelect) return;
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                onSelect(item.id);
              }
            }}
          >
            <TableCell className="text-[11px] font-mono text-stone-700 text-center bg-stone-100/60">
              {rankById.get(item.id) ? `#${rankById.get(item.id)}` : '—'}
            </TableCell>
            <TableCell className="text-sm text-stone-500">
              {formatScore(item.llm_accuracy_score ?? item.llm_accuracy_rank)}
            </TableCell>
            <TableCell className="text-sm text-stone-500">
              {formatScore(item.llm_quality_score ?? item.llm_quality_rank)}
            </TableCell>
            <TableCell>
              <div className="flex items-start gap-3">
                <MediaThumbnail
                  mediaId={item.id}
                  wikipediaSlug={item.wikipedia_slug}
                  title={item.title}
                  size={40}
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    {item.recommended ? (
                      <Star className="h-4 w-4 text-amber-500 fill-amber-400" />
                    ) : (
                      <Star className="h-4 w-4 text-stone-300" />
                    )}
                    <div className="text-sm font-medium text-stone-900 max-w-[250px] truncate" title={item.title}>
                      {item.title}
                    </div>
                  </div>
                  {item.summary && (
                    <div className="hr-media-notes mt-1 max-w-[32rem] text-xs text-stone-500">
                      {item.summary}
                    </div>
                  )}
                </div>
              </div>
            </TableCell>
            {showTypeColumn && (
              <TableCell className="text-sm text-stone-600 capitalize">{item.type}</TableCell>
            )}
            <TableCell className="text-sm text-stone-600">
              <div className="font-semibold text-stone-800">{item.primary_era}</div>
              {item.sub_era && (
                <div className="text-xs text-stone-500 leading-snug">
                  {item.sub_era.includes('(') ? (
                    <>
                      <span>{item.sub_era.split('(')[0].trim()}</span>
                      <span className="block text-[11px] text-stone-400">
                        ({item.sub_era.split('(')[1]}
                      </span>
                    </>
                  ) : (
                    <span className="block max-w-[140px] whitespace-normal">{item.sub_era}</span>
                  )}
                </div>
              )}
            </TableCell>
            <TableCell className="text-sm text-stone-600">
              {(() => {
                const start = formatYearParts(item.depicted_start_year ?? null);
                const end = formatYearParts(item.depicted_end_year ?? null);
                if (!start && !end) return '—';
                if (start && end) {
                  return (
                    <div className="inline-grid grid-cols-[auto_auto_auto] items-start text-sm text-stone-700">
                      <span>{start.value}</span>
                      <span className="px-1">–</span>
                      <span>{end.value}</span>
                      <span className="text-[10px] text-stone-400 leading-none">
                        {start.era ?? ''}
                      </span>
                      <span />
                      <span className="text-[10px] text-stone-400 leading-none">
                        {end.era ?? ''}
                      </span>
                    </div>
                  );
                }
                const single = start || end;
                return (
                  <div className="flex flex-col">
                    <span className="text-sm text-stone-700">{single?.value}</span>
                    {single?.era && <span className="text-[10px] text-stone-400">{single.era}</span>}
                  </div>
                );
              })()}
            </TableCell>
            <TableCell className="text-sm text-stone-600">
              {item.primary_region ? (
                <span
                  className="inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium text-white"
                  style={{ backgroundColor: REGION_COLORS[item.primary_region] || '#9ca3af' }}
                >
                  {item.primary_region}
                </span>
              ) : (
                '—'
              )}
            </TableCell>
            <TableCell className="text-sm text-stone-600 text-right">
              {item.release_year ?? '—'}
            </TableCell>
            <TableCell className="text-sm text-stone-600 text-right">
              {typeof item.rating_normalized === 'number' ? (
                <Tooltip
                  content={
                    <div className="max-w-xs">
                      <p className="font-medium">{ratingSourceName(item.rating_source)}</p>
                      <p className="text-stone-500 dark:text-slate-400 text-xs mt-0.5">
                        {ratingLabel(item.rating_source)}
                      </p>
                      {typeof item.rating_count === 'number' && (
                        <p className="text-stone-500 dark:text-slate-400 text-xs mt-1">
                          {item.rating_count.toLocaleString()} votes
                        </p>
                      )}
                    </div>
                  }
                >
                  <span
                    className="hr-rating-number font-mono text-base font-semibold"
                    style={{ color: ratingColor(item.rating_normalized) }}
                  >
                    {item.rating_normalized.toFixed(1)}
                  </span>
                </Tooltip>
              ) : (
                '—'
              )}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-stone-200/70 bg-white/80 p-2 shadow-sm">
        {CATEGORY_LABELS.map((category) => (
          <button
            key={category.id}
            type="button"
            onClick={() => setCategoryFilter(category.id)}
            className={`rounded-full px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] transition-all ${
              categoryFilter === category.id
                ? 'bg-stone-900 text-white shadow-sm'
                : 'text-stone-500 hover:bg-stone-100'
            }`}
          >
            {category.label}
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr_1fr_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search titles or summaries"
            className="pl-9"
          />
        </div>
        <Select value={eraFilter} onValueChange={setEraFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Era" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All eras</SelectItem>
            {options.eras.map((era) => (
              <SelectItem key={era} value={era}>
                {era}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={regionFilter} onValueChange={setRegionFilter}>
          <SelectTrigger>
            <SelectValue placeholder="Region" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All regions</SelectItem>
            {options.regions.map((region) => (
              <SelectItem key={region} value={region}>
                {region}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <button
          type="button"
          onClick={() => setRecommendedOnly((prev) => !prev)}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 text-sm transition-all ${
            recommendedOnly
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50'
          }`}
        >
          <Star className={`h-4 w-4 ${recommendedOnly ? 'fill-amber-400 text-amber-500' : ''}`} />
          Recommended
        </button>
        <button
          type="button"
          onClick={() => {
            setRankedByEra((prev) => !prev);
            setSortBy('era_rank');
            setSortOrder('asc');
          }}
          className={`flex items-center justify-center gap-2 rounded-md border px-3 text-sm transition-all ${
            rankedByEra
              ? 'border-stone-900 bg-stone-900 text-white'
              : 'border-stone-200 text-stone-600 hover:border-stone-300 hover:bg-stone-50'
          }`}
        >
          {rankedByEra ? 'Ranked by era' : 'Combined rankings'}
        </button>
      </div>

      <div className="relative left-1/2 w-screen max-w-[92rem] -translate-x-1/2 px-2 sm:px-2">
        {rankedByEra ? (
          <div className="space-y-6">
            {groupedByEra.map((group) => (
              <div key={`era-${group.era}`} className="space-y-2">
                <div className="px-2 text-xs uppercase tracking-[0.25em] text-stone-400">
                  {group.era} · {group.items.length}
                </div>
                <div className="rounded-2xl border border-stone-200/70 bg-white/90 shadow-sm overflow-x-auto">
                  {renderTable(group.items)}
                </div>
              </div>
            ))}
            {groupedByEra.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-stone-500">
                No results yet. Try clearing filters.
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-stone-200/70 bg-white/90 shadow-sm overflow-x-auto">
            {renderTable(filtered)}
            {filtered.length === 0 && (
              <div className="px-6 py-8 text-center text-sm text-stone-500">
                No results yet. Try clearing filters.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
