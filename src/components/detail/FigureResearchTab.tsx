'use client';

import { useState } from 'react';
import { ExternalLink, AlertTriangle, HelpCircle } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import type {
  FigureEvidenceSource,
  FigureEvidenceQuote,
  FigureEvidenceSnippet,
  FigureEvidenceWikidataFact,
  FigureEvidenceWikipediaSection,
} from '@/types';
import { formatCorpusLabel, formatEvidenceYear } from '@/lib/utils/figureFormatters';

interface FigureResearchTabProps {
  sources: FigureEvidenceSource[];
  quotes: FigureEvidenceQuote[];
  snippets: FigureEvidenceSnippet[];
  wikidataFacts: FigureEvidenceWikidataFact[];
  wikipediaSections: FigureEvidenceWikipediaSection[];
  figureName: string;
  isLoading: boolean;
  error: string | null;
}

const ALLOWED_INLINE_TAGS = new Set(['i', 'em', 'b', 'strong', 'code', 'sub', 'sup', 'br', 'a']);

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function normalizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;
  if (/^(https?:|mailto:)/i.test(trimmed)) return trimmed;
  return null;
}

function applyInlineMarkdown(value: string): string {
  let html = value;
  html = html.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\)/gi, (_match, label: string, url: string) => {
    const safeUrl = normalizeUrl(url);
    if (!safeUrl) return label;
    return `<a href="${escapeAttribute(safeUrl)}">${escapeHtml(label)}</a>`;
  });
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__([^_]+)__/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*\n]+)\*/g, '<em>$1</em>');
  html = html.replace(/_([^_\n]+)_/g, '<em>$1</em>');
  html = html.replace(/\n/g, '<br />');
  return html;
}

function sanitizeInlineHtml(value: string): string {
  const withoutDangerousBlocks = value
    .replace(/<\s*script[\s\S]*?>[\s\S]*?<\s*\/\s*script\s*>/gi, '')
    .replace(/<\s*style[\s\S]*?>[\s\S]*?<\s*\/\s*style\s*>/gi, '');

  return withoutDangerousBlocks.replace(/<\s*(\/?)\s*([a-z0-9-]+)([^>]*)>/gi, (full, slash: string, rawTag: string, rawAttrs: string) => {
    const tag = rawTag.toLowerCase();
    if (!ALLOWED_INLINE_TAGS.has(tag)) return '';

    const isClosing = slash === '/';
    if (isClosing) return `</${tag}>`;
    if (tag === 'br') return '<br />';
    if (tag !== 'a') return `<${tag}>`;

    const hrefMatch = rawAttrs.match(/\bhref\s*=\s*(['"])(.*?)\1/i) || rawAttrs.match(/\bhref\s*=\s*([^\s>]+)/i);
    const href = hrefMatch ? (hrefMatch[2] || hrefMatch[1] || '').trim() : '';
    const safeHref = normalizeUrl(href);
    if (!safeHref) return '<a>';
    return `<a href="${escapeAttribute(safeHref)}" target="_blank" rel="noopener noreferrer">`;
  });
}

function renderRichInline(value: string): string {
  return sanitizeInlineHtml(applyInlineMarkdown(value));
}

function RichInlineText({ text, className }: { text: string; className?: string }) {
  return <span className={className} dangerouslySetInnerHTML={{ __html: renderRichInline(text) }} />;
}

function isSepSource(source: FigureEvidenceSource): boolean {
  if (source.sourceCorpus === 'sep' || source.sourceCorpus === 'stanford_encyclopedia_of_philosophy') return true;
  const provider = typeof source.metadata?.provider === 'string' ? source.metadata.provider.toLowerCase() : '';
  if (provider === 'sep' || provider === 'stanford_encyclopedia_of_philosophy') return true;
  return source.sourceUrl.includes('plato.stanford.edu/entries/');
}

function getSepParagraphs(source: FigureEvidenceSource): string[] {
  const fromMetadata = source.metadata?.sep_excerpt_paragraphs;
  if (Array.isArray(fromMetadata)) {
    const paragraphs = fromMetadata
      .filter((item): item is string => typeof item === 'string')
      .map((value) => value.trim())
      .filter(Boolean);
    if (paragraphs.length > 0) return paragraphs.slice(0, 2);
  }

  if (!source.snippet) return [];
  return source.snippet
    .split(/\n\s*\n/g)
    .map((value) => value.trim())
    .filter(Boolean)
    .slice(0, 2);
}

function isSepSnippet(snippet: FigureEvidenceSnippet): boolean {
  if (snippet.corpus === 'sep' || snippet.corpus === 'stanford_encyclopedia_of_philosophy') return true;
  const provider = typeof snippet.metadata?.provider === 'string' ? snippet.metadata.provider.toLowerCase() : '';
  if (provider === 'sep' || provider === 'stanford_encyclopedia_of_philosophy') return true;
  return (snippet.sourceUrl || '').includes('plato.stanford.edu/entries/');
}

function isWikidataSource(source: FigureEvidenceSource): boolean {
  const provider = metadataString(source.metadata, 'provider')?.toLowerCase();
  return provider === 'wikidata';
}

function isWikipediaSectionSource(source: FigureEvidenceSource): boolean {
  const provider = metadataString(source.metadata, 'provider')?.toLowerCase();
  return provider === 'wikipedia_sections';
}

function truncateText(value: string, maxLength: number): string {
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trimEnd()}...`;
}

function metadataString(metadata: Record<string, unknown>, key: string): string | null {
  const value = metadata[key];
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function SourceEntry({ source }: { source: FigureEvidenceSource }) {
  return (
    <a
      href={source.accessUrl || source.sourceUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="block group"
    >
      <div className="text-sm font-medium text-stone-800 dark:text-slate-100 group-hover:text-amber-700 dark:group-hover:text-amber-400 transition-colors">
        {source.title}
      </div>
      <div className="mt-0.5 text-xs text-stone-500 dark:text-slate-400">
        {[source.author, formatEvidenceYear(source.publicationYear), formatCorpusLabel(source.sourceCorpus, source.metadata)]
          .filter(Boolean)
          .join(' · ')}
      </div>
      {source.snippet && (
        <p className="mt-1.5 text-xs leading-relaxed text-stone-500 dark:text-slate-400">
          <RichInlineText
            text={source.snippet}
            className="[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-amber-700 dark:[&_a]:text-amber-500"
          />
        </p>
      )}
    </a>
  );
}

export function FigureResearchTab({
  sources,
  quotes,
  snippets,
  wikidataFacts,
  wikipediaSections,
  figureName,
  isLoading,
  error,
}: FigureResearchTabProps) {
  const [expandedSectionIds, setExpandedSectionIds] = useState<Record<number, boolean>>({});

  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700 space-y-3">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="h-4 w-2/3 mt-2" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    );
  }

  if (error) {
    return <p className="text-sm text-amber-700 dark:text-amber-400">{error}</p>;
  }

  if (
    sources.length === 0 &&
    quotes.length === 0 &&
    snippets.length === 0 &&
    wikidataFacts.length === 0 &&
    wikipediaSections.length === 0
  ) {
    return (
      <p className="text-sm text-stone-500 dark:text-slate-400">
        No research evidence has been ingested for this figure yet.
      </p>
    );
  }

  const nonSpecialSources = sources.filter((source) => !isWikidataSource(source) && !isWikipediaSectionSource(source));
  const secondary = nonSpecialSources.filter((s) => s.sourceRole === 'secondary');
  const primary = nonSpecialSources.filter((s) => s.sourceRole === 'primary');
  const reference = nonSpecialSources.filter((s) => s.sourceRole === 'reference');
  const sepReferences = reference.filter(isSepSource);
  const nonSepReferences = reference.filter((source) => !isSepSource(source));
  const nonSepSnippets = snippets.filter((snippet) => !isSepSnippet(snippet));
  const wikidataQid =
    wikidataFacts
      .map((fact) => metadataString(fact.metadata, 'qid'))
      .find((value): value is string => Boolean(value)) || null;
  const groupedWikidataFacts = Array.from(
    wikidataFacts
      .reduce((map, fact) => {
        const key = `${fact.propertyId}:${fact.propertyLabel}`;
        const existing = map.get(key);
        if (existing) {
          if (!existing.values.includes(fact.value)) {
            existing.values.push(fact.value);
          }
        } else {
          map.set(key, {
            id: fact.id,
            propertyLabel: fact.propertyLabel,
            values: [fact.value],
          });
        }
        return map;
      }, new Map<string, { id: number; propertyLabel: string; values: string[] }>())
      .values()
  );

  return (
    <div className="space-y-5">
      {secondary.length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500 mb-3">
            Scholarship
          </h3>
          <div className="space-y-4">
            {secondary.slice(0, 8).map((source) => (
              <SourceEntry key={source.id} source={source} />
            ))}
          </div>
        </div>
      )}

      {primary.length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500 mb-3">
            Primary works
          </h3>
          <div className="space-y-4">
            {primary.slice(0, 8).map((source) => (
              <SourceEntry key={source.id} source={source} />
            ))}
          </div>
        </div>
      )}

      {nonSepReferences.length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500 mb-3">
            References
          </h3>
          <div className="space-y-4">
            {nonSepReferences.slice(0, 8).map((source) => (
              <SourceEntry key={source.id} source={source} />
            ))}
          </div>
        </div>
      )}

      {wikipediaSections.length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500">
              Wikipedia sections
            </h3>
            <Tooltip
              content="Section-level encyclopedia excerpts. Each item starts condensed and can be expanded in place."
              align="left"
            >
              <HelpCircle className="h-3 w-3 cursor-help text-stone-300 transition-colors hover:text-stone-500 dark:text-slate-600 dark:hover:text-slate-400" />
            </Tooltip>
          </div>
          <div className="space-y-4">
            {wikipediaSections.slice(0, 6).map((section) => {
              const expanded = expandedSectionIds[section.id] === true;
              const text = expanded ? section.excerpt : truncateText(section.excerpt, 360);
              return (
                <div key={section.id} className="rounded-lg border border-stone-200/70 px-3 py-3 dark:border-slate-700">
                  <div className="text-xs font-medium uppercase tracking-[0.1em] text-stone-500 dark:text-slate-400">
                    {section.sectionTitle}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-stone-700 dark:text-slate-200">{text}</p>
                  <div className="mt-2 flex items-center gap-3 text-xs">
                    {section.excerpt.length > 360 && (
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSectionIds((prev) => ({
                            ...prev,
                            [section.id]: !expanded,
                          }))
                        }
                        className="text-stone-600 hover:text-stone-800 dark:text-slate-300 dark:hover:text-slate-100"
                      >
                        {expanded ? 'Show less' : 'Show full section'}
                      </button>
                    )}
                    <a
                      href={section.accessUrl || section.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400"
                    >
                      View source <ExternalLink className="h-3 w-3" />
                    </a>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {quotes.length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
          <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500 mb-3">
            Quotes
          </h3>
          <div className="space-y-4">
            {quotes.slice(0, 6).map((quote) => (
              <div key={quote.id}>
                <blockquote className="border-l-2 border-stone-200 dark:border-slate-600 pl-3">
                  <p className="text-sm leading-relaxed text-stone-700 dark:text-slate-200 italic">
                    &ldquo;{quote.quoteText}&rdquo;
                  </p>
                </blockquote>
                <div className="mt-1.5 pl-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-stone-500 dark:text-slate-400">
                  <span>{quote.attributedTo || figureName}</span>
                  {quote.quoteYear !== null && <span>· {formatEvidenceYear(quote.quoteYear)}</span>}
                  {(quote.verificationStatus !== 'verified' || quote.warningShort) && (
                    <span className="inline-flex items-center gap-1 text-amber-600 dark:text-amber-400">
                      <AlertTriangle className="h-3 w-3" />
                      {quote.warningShort || 'Unverified'}
                    </span>
                  )}
                  {quote.sourceUrl && (
                    <a
                      href={quote.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400"
                    >
                      Source <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {(sepReferences.length > 0 || nonSepSnippets.length > 0) && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
          <div className="flex items-center gap-2 mb-3">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500">
              Encyclopedias
            </h3>
            <Tooltip
              content="Short excerpts from reference encyclopedias, including SEP and 1911 Britannica, with links to full entries."
              align="left"
            >
              <HelpCircle className="h-3 w-3 cursor-help text-stone-300 transition-colors hover:text-stone-500 dark:text-slate-600 dark:hover:text-slate-400" />
            </Tooltip>
          </div>
          <div className="space-y-5">
            {sepReferences.slice(0, 3).map((source) => {
              const paragraphs = getSepParagraphs(source);
              return (
                <div key={source.id}>
                  <div className="text-[11px] font-medium text-stone-500 dark:text-slate-400 mb-1.5">
                    {formatCorpusLabel(source.sourceCorpus, source.metadata)}
                    {source.publicationYear !== null && ` · ${source.publicationYear}`}
                    {source.title ? ` · ${source.title}` : ''}
                  </div>
                  <blockquote className="border-l-2 border-amber-300 dark:border-amber-500/50 pl-4 space-y-2">
                    {(paragraphs.length > 0 ? paragraphs : source.snippet ? [source.snippet] : []).map((paragraph, index) => (
                      <p key={index} className="text-sm italic leading-relaxed text-stone-700 dark:text-slate-200">
                        &ldquo;
                        <RichInlineText
                          text={paragraph}
                          className="[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-amber-700 dark:[&_a]:text-amber-500"
                        />
                        &rdquo;
                      </p>
                    ))}
                  </blockquote>
                  <a
                    href={source.accessUrl || source.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400"
                  >
                    View source <ExternalLink className="h-3 w-3" />
                  </a>
                </div>
              );
            })}

            {nonSepSnippets.slice(0, 4).map((snippet) => (
              <div key={snippet.id}>
                <div className="text-[11px] font-medium text-stone-500 dark:text-slate-400 mb-1.5">
                  {formatCorpusLabel(snippet.corpus)}
                  {snippet.editionYear !== null && ` · ${snippet.editionYear}`}
                  {snippet.sourceTitle ? ` · ${snippet.sourceTitle}` : ''}
                </div>
                <blockquote className="border-l-2 border-amber-300 dark:border-amber-500/50 pl-4">
                  <p className="text-sm italic leading-relaxed text-stone-700 dark:text-slate-200">
                    &ldquo;
                    <RichInlineText
                      text={snippet.snippet}
                      className="[&_a]:underline [&_a]:underline-offset-2 [&_a]:text-amber-700 dark:[&_a]:text-amber-500"
                    />
                    &rdquo;
                  </p>
                </blockquote>
                {snippet.sourceUrl && (
                  <a
                    href={snippet.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1.5 inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400"
                  >
                    View source <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {groupedWikidataFacts.length > 0 && (
        <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-[11px] font-medium uppercase tracking-[0.14em] text-stone-400 dark:text-slate-500">
              Wikidata snapshot
            </h3>
            {wikidataQid && (
              <a
                href={`https://www.wikidata.org/wiki/${wikidataQid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 text-xs text-amber-700 hover:text-amber-800 dark:text-amber-500 dark:hover:text-amber-400"
              >
                View record <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
          <div className="space-y-2">
            {groupedWikidataFacts.slice(0, 12).map((fact) => (
              <div
                key={`${fact.propertyLabel}-${fact.id}`}
                className="flex flex-col gap-0.5 rounded-lg border border-stone-100 bg-stone-50/70 px-3 py-2 dark:border-slate-700 dark:bg-slate-900/40 sm:flex-row sm:items-start sm:justify-between sm:gap-3"
              >
                <div className="text-xs font-medium text-stone-600 dark:text-slate-300">{fact.propertyLabel}</div>
                <div className="text-sm text-stone-800 dark:text-slate-100 sm:text-right">
                  {fact.values.join(', ')}
                </div>
              </div>
            ))}
            {groupedWikidataFacts.length > 12 && (
              <p className="text-xs text-stone-500 dark:text-slate-400">
                Showing 12 of {groupedWikidataFacts.length} structured facts.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
