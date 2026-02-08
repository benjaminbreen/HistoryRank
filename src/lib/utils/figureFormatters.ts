import type { Ranking } from '@/types';

export function formatYear(year: number | null): string | null {
  if (year === null) return null;
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}

export function formatYearAlways(year: number | null): string {
  if (year === null) return 'Unknown';
  return year < 0 ? `${Math.abs(year)} BCE` : `${year} CE`;
}

export function formatViews(n: number | null): string {
  if (n === null) return '—';
  if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `${Math.round(n / 1000)}K`;
  return n.toLocaleString();
}

export function formatAlias(alias: string): string {
  const lowerWords = new Set(['of', 'the', 'and', 'al', 'ibn', 'von', 'de', 'da', 'di']);
  const roman = new Set(['i', 'ii', 'iii', 'iv', 'v', 'vi', 'vii', 'viii', 'ix', 'x']);
  return alias
    .split(' ')
    .map((word) => {
      if (roman.has(word)) return word.toUpperCase();
      if (word === 'st') return 'St.';
      if (lowerWords.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

export function formatCorpusLabel(corpus: string, metadata?: Record<string, unknown>): string {
  const providerRaw = metadata?.provider;
  const provider = typeof providerRaw === 'string' ? providerRaw.toLowerCase() : null;
  if (corpus === 'other' && provider) {
    if (provider === 'openalex') return 'OpenAlex';
    if (provider === 'crossref') return 'Crossref';
    if (provider === 'openlibrary') return 'Open Library';
    if (provider === 'loc' || provider === 'library_of_congress') return 'Library of Congress';
  }
  if (corpus === 'project_gutenberg') return 'Project Gutenberg';
  if (corpus === 'internet_archive') return 'Internet Archive';
  if (corpus === 'wikisource') return 'Wikisource';
  if (corpus === 'openalex') return 'OpenAlex';
  if (corpus === 'crossref') return 'Crossref';
  if (corpus === 'openlibrary') return 'Open Library';
  if (corpus === 'loc') return 'Library of Congress';
  return corpus.replace(/_/g, ' ');
}

export function formatEvidenceYear(year: number | null): string | null {
  if (year === null) return null;
  return year < 0 ? `${Math.abs(year)} BCE` : `${year}`;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'] as const;

export function formatEventYears(
  startYear: number | null,
  endYear: number | null,
  metadata?: Record<string, unknown>,
): string {
  const precision = typeof metadata?.date_precision === 'string' ? metadata.date_precision : null;
  const isEstimated = metadata?.date_is_estimated === true;
  const yearRaw = metadata?.event_year;
  const monthRaw = metadata?.event_month;
  const dayRaw = metadata?.event_day;
  const year =
    typeof yearRaw === 'number' && Number.isFinite(yearRaw) ? yearRaw : startYear ?? endYear ?? null;
  const month = typeof monthRaw === 'number' && Number.isFinite(monthRaw) ? monthRaw : null;
  const day = typeof dayRaw === 'number' && Number.isFinite(dayRaw) ? dayRaw : null;

  if (year !== null) {
    let label: string;
    if (precision === 'day' && month !== null && day !== null && month >= 1 && month <= 12) {
      label = `${day} ${MONTH_NAMES[month - 1]} ${formatEvidenceYear(year)}`;
    } else if (precision === 'month' && month !== null && month >= 1 && month <= 12) {
      label = `${MONTH_NAMES[month - 1]} ${formatEvidenceYear(year)}`;
    } else {
      label = formatEvidenceYear(year) || 'Date unknown';
    }
    return isEstimated ? `c. ${label}` : label;
  }

  if (startYear === null && endYear === null) return 'Date unknown';
  if (startYear !== null && endYear !== null && startYear !== endYear) {
    return `${formatEvidenceYear(startYear)} - ${formatEvidenceYear(endYear)}`;
  }
  return formatEvidenceYear(startYear ?? endYear) || 'Date unknown';
}

export function getExtractParagraphs(text: string | null, maxLength: number = 700): string[] | null {
  if (!text) return null;
  const sentences = text.match(/[^.!?]+[.!?]+/g);
  if (!sentences) return [text.slice(0, maxLength) + '...'];

  let para = '';
  const result: string[] = [];
  let total = 0;
  for (const sentence of sentences) {
    if (total + sentence.length > maxLength) break;
    if (result.length === 0 && para.length + sentence.length > maxLength / 2) {
      result.push(para.trim());
      para = '';
    }
    para += sentence;
    total += sentence.length;
  }
  if (para.trim()) result.push(para.trim());
  return result.slice(0, 2);
}

export interface GroupedSourceRanking {
  source: string;
  avgRank: number;
  sampleCount: number;
  contributions: string[];
  ranks: number[];
}

export function groupRankingsBySource(rankings: Ranking[]): GroupedSourceRanking[] {
  const bySource = rankings.reduce(
    (acc, r) => {
      if (!acc[r.source]) {
        acc[r.source] = { ranks: [], contributions: [] };
      }
      acc[r.source].ranks.push(r.rank);
      if (r.contribution) {
        acc[r.source].contributions.push(r.contribution);
      }
      return acc;
    },
    {} as Record<string, { ranks: number[]; contributions: string[] }>,
  );

  return Object.entries(bySource)
    .map(([source, data]) => ({
      source,
      avgRank: Math.round(data.ranks.reduce((a, b) => a + b, 0) / data.ranks.length),
      sampleCount: data.ranks.length,
      contributions: data.contributions,
      ranks: data.ranks,
    }))
    .sort((a, b) => a.avgRank - b.avgRank);
}

export interface AttentionGap {
  ratio: number;
  direction: 'up' | 'down' | 'neutral';
  label: string;
}

export function getAttentionGap(hpiRank: number | null | undefined, llmRank: number | null | undefined): AttentionGap | null {
  if (!hpiRank || !llmRank) return null;
  const ratio = hpiRank / llmRank;
  return {
    ratio,
    direction: ratio > 1.15 ? 'up' : ratio < 0.85 ? 'down' : 'neutral',
    label:
      ratio > 1.15
        ? 'AI ranks higher than academics'
        : ratio < 0.85
          ? 'Academics rank higher than AI'
          : 'Similar rankings across sources',
  };
}
