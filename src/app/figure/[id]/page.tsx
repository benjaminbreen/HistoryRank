'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { AppHeader } from '@/components/layout/AppHeader';
import { useSettings } from '@/hooks/useSettings';
import { useFigureData } from '@/hooks/useFigureData';
import { Skeleton } from '@/components/ui/skeleton';
import { FigureSidebar } from '@/components/detail/FigureSidebar';
import { FigureTabBar } from '@/components/detail/FigureTabBar';
import { FigureOverviewTab } from '@/components/detail/FigureOverviewTab';
import { FigureResearchTab } from '@/components/detail/FigureResearchTab';
import { FigureNarrativeTimeline } from '@/components/detail/FigureNarrativeTimeline';
import { REGION_COLORS } from '@/types';
import type { DetailTab } from '@/types';
import { groupRankingsBySource, getAttentionGap, formatYear } from '@/lib/utils/figureFormatters';

export default function FigurePage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === 'string' ? params.id : null;
  console.log('[FigurePage] MOUNTED', { paramsId: params.id, id });
  const { settings, updateSettings, resetSettings } = useSettings();
  const [activeTab, setActiveTab] = useState<DetailTab>('overview');

  const {
    figure,
    rankings,
    aliases,
    evidence,
    wiki,
    relatedMedia,
    loading,
    errors,
  } = useFigureData(id);

  const sourceRankings = groupRankingsBySource(rankings);
  const llmRank = figure?.llmConsensusRank ? Math.round(figure.llmConsensusRank) : null;
  const attentionGap = getAttentionGap(figure?.hpiRank, llmRank);

  const researchSources = evidence?.research.sources || [];
  const researchQuotes = evidence?.research.quotes || [];
  const historicalSnippets = evidence?.research.historicalSnippets || [];
  const timelineAssessment = evidence?.timeline.assessment || null;
  const timelineEvents = evidence?.timeline.events || [];

  return (
    <div className="min-h-screen bg-[#faf9f7] dark:bg-slate-900">
      <AppHeader
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />

      <div className="pt-2 pb-12">
        {/* Back button */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 mb-4">
          <button
            onClick={() => (window.history.length > 1 ? router.back() : router.push('/'))}
            className="inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400 hover:text-stone-700 dark:hover:text-slate-200 transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Rankings
          </button>
        </div>

        {/* Loading state */}
        {loading.figure && !figure && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="hidden md:flex gap-8">
              <div className="w-80 space-y-4">
                <Skeleton className="w-48 h-64 rounded-xl mx-auto" />
                <Skeleton className="h-8 w-48 mx-auto" />
                <Skeleton className="h-4 w-32 mx-auto" />
                <Skeleton className="h-24 w-full rounded-xl" />
              </div>
              <div className="flex-1 space-y-4">
                <Skeleton className="h-10 w-full rounded-xl" />
                <Skeleton className="h-32 w-full rounded-xl" />
                <Skeleton className="h-24 w-full rounded-xl" />
                <div className="grid grid-cols-3 gap-3">
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                  <Skeleton className="h-20 rounded-lg" />
                </div>
              </div>
            </div>
            <div className="md:hidden space-y-4">
              <Skeleton className="w-48 h-64 rounded-xl mx-auto" />
              <Skeleton className="h-8 w-48 mx-auto" />
              <Skeleton className="h-10 w-full rounded-xl" />
              <Skeleton className="h-32 w-full rounded-xl" />
            </div>
          </div>
        )}

        {/* Error state */}
        {errors.figure && !figure && (
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-900/40 dark:bg-amber-950/30">
              <h2 className="text-lg font-medium text-amber-900 dark:text-amber-300">
                Figure not found
              </h2>
              <p className="mt-2 text-sm text-amber-700 dark:text-amber-400">
                The figure &ldquo;{id}&rdquo; could not be found in our database.
              </p>
              <Link
                href="/"
                className="mt-4 inline-flex items-center gap-1 text-sm font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
              >
                <ChevronLeft className="w-4 h-4" />
                Return to Rankings
              </Link>
            </div>
          </div>
        )}

        {/* Main content */}
        {figure && (
          <>
            {/* Desktop layout */}
            <div className="hidden md:flex max-w-7xl mx-auto px-6 gap-8">
              <aside className="w-80 flex-shrink-0 sticky top-[60px] h-[calc(100vh-76px)] overflow-y-auto pb-8 pr-2 scrollbar-thin">
                <FigureSidebar
                  figure={figure}
                  aliases={aliases}
                  badges={[]}
                  wiki={wiki}
                  relatedMedia={relatedMedia}
                  mediaLoading={loading.media}
                />
              </aside>
              <div className="flex-1 min-w-0">
                <div className="mb-5">
                  <FigureTabBar activeTab={activeTab} onTabChange={setActiveTab} />
                </div>
                {activeTab === 'overview' && (
                  <FigureOverviewTab
                    figure={figure}
                    wiki={wiki}
                    wikiLoading={loading.wiki}
                    sourceRankings={sourceRankings}
                    attentionGap={attentionGap}
                    llmRank={llmRank}
                    relatedMedia={relatedMedia}
                    mediaLoading={loading.media}
                    aliases={aliases}
                  />
                )}
                {activeTab === 'research' && (
                  <FigureResearchTab
                    sources={researchSources}
                    quotes={researchQuotes}
                    snippets={historicalSnippets}
                    figureName={figure.canonicalName}
                    isLoading={loading.evidence}
                    error={errors.evidence?.message ?? null}
                  />
                )}
                {activeTab === 'timeline' && (
                  <FigureNarrativeTimeline
                    birthYear={figure.birthYear}
                    deathYear={figure.deathYear}
                    events={timelineEvents}
                    assessment={timelineAssessment}
                    sources={researchSources}
                    quotes={researchQuotes}
                    snippets={historicalSnippets}
                    isLoading={loading.evidence}
                    error={errors.evidence?.message ?? null}
                  />
                )}
              </div>
            </div>

            {/* Mobile layout */}
            <div className="md:hidden max-w-2xl mx-auto px-4">
              {/* Mobile header - centered portrait + name + metadata */}
              <div className="flex flex-col items-center text-center mb-5">
                <MobilePortrait figure={figure} wiki={wiki} />
                <h1 className="mt-3 font-serif text-2xl font-semibold text-stone-900 dark:text-amber-100 leading-tight">
                  {figure.canonicalName}
                </h1>
                {figure.occupation && (
                  <p className="mt-1 text-sm text-stone-600 dark:text-slate-400">{figure.occupation}</p>
                )}
                <div className="mt-1 flex items-center gap-2 text-sm text-stone-600 dark:text-slate-400">
                  {formatYear(figure.birthYear) && <span>{formatYear(figure.birthYear)}</span>}
                  {figure.deathYear && (
                    <>
                      <span className="text-stone-300 dark:text-slate-600">—</span>
                      <span>{formatYear(figure.deathYear)}</span>
                    </>
                  )}
                </div>
                {figure.regionSub && (
                  <span
                    className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium text-white"
                    style={{ backgroundColor: REGION_COLORS[figure.regionSub] || '#9ca3af' }}
                  >
                    {figure.regionSub}
                  </span>
                )}
              </div>

              <div className="mb-5">
                <FigureTabBar activeTab={activeTab} onTabChange={setActiveTab} />
              </div>

              {activeTab === 'overview' && (
                <FigureOverviewTab
                  figure={figure}
                  wiki={wiki}
                  wikiLoading={loading.wiki}
                  sourceRankings={sourceRankings}
                  attentionGap={attentionGap}
                  llmRank={llmRank}
                  relatedMedia={relatedMedia}
                  mediaLoading={loading.media}
                  aliases={aliases}
                  includeSidebarContent
                />
              )}
              {activeTab === 'research' && (
                <FigureResearchTab
                  sources={researchSources}
                  quotes={researchQuotes}
                  snippets={historicalSnippets}
                  figureName={figure.canonicalName}
                  isLoading={loading.evidence}
                  error={errors.evidence?.message ?? null}
                />
              )}
              {activeTab === 'timeline' && (
                <FigureNarrativeTimeline
                  birthYear={figure.birthYear}
                  deathYear={figure.deathYear}
                  events={timelineEvents}
                  assessment={timelineAssessment}
                  sources={researchSources}
                  quotes={researchQuotes}
                  snippets={historicalSnippets}
                  isLoading={loading.evidence}
                  error={errors.evidence?.message ?? null}
                />
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Mobile portrait component with thumbnail fallback
import type { Figure, WikipediaData } from '@/types';

function MobilePortrait({ figure, wiki }: { figure: Figure; wiki: WikipediaData | null }) {
  const [localThumbExt, setLocalThumbExt] = useState(0);
  const [localThumbFailed, setLocalThumbFailed] = useState(false);

  const exts = ['jpg', 'png', 'webp'];
  const localUrl = !localThumbFailed ? `/thumbnails/${figure.id}.${exts[localThumbExt]}` : null;

  if (localUrl && !localThumbFailed) {
    return (
      <img
        src={localUrl}
        alt={figure.canonicalName}
        loading="lazy"
        className="w-32 h-44 object-cover rounded-xl shadow-lg ring-1 ring-stone-200/50"
        onError={() => {
          if (localThumbExt < 2) {
            setLocalThumbExt(localThumbExt + 1);
          } else {
            setLocalThumbFailed(true);
          }
        }}
      />
    );
  }

  if (wiki?.thumbnail) {
    return (
      <img
        src={wiki.thumbnail.source}
        alt={figure.canonicalName}
        loading="lazy"
        className="w-32 h-44 object-cover rounded-xl shadow-lg ring-1 ring-stone-200/50"
      />
    );
  }

  return (
    <div className="w-32 h-44 rounded-xl bg-gradient-to-br from-stone-100 to-stone-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center shadow-inner">
      <span className="text-5xl font-serif text-stone-400 dark:text-slate-500">
        {figure.canonicalName.charAt(0)}
      </span>
    </div>
  );
}
