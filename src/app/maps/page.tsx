'use client';

import { useCallback, useEffect, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { GlobeView } from '@/components/maps/GlobeView';
import { MapView } from '@/components/maps/MapView';
import { TimelineView } from '@/components/maps/TimelineView';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/hooks/useSettings';
import type { Figure, Ranking, FigureDetailResponse, MapPoint, MapResponse } from '@/types';

const MODEL_LABELS: Record<string, string> = {
  'claude-opus-4.5': 'Claude Opus 4.5',
  'claude-sonnet-4.5': 'Claude Sonnet 4.5',
  'deepseek-v3.2': 'DeepSeek v3.2',
  'gemini-flash-3-preview': 'Gemini Flash 3 Preview',
  'gemini-pro-3': 'Gemini Pro 3',
  'gpt-5.2-thinking': 'GPT 5.2 Thinking',
  'grok-4': 'Grok 4',
  'grok-4.1-fast': 'Grok 4.1 Fast',
  'mistral-large-3': 'Mistral Large 3',
  'qwen3': 'Qwen 3',
};

function formatModelLabel(source: string) {
  return MODEL_LABELS[source] || source.replace(/[/-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

type MapViewMode = 'map' | 'globe' | 'timeline';

export default function MapsPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [viewMode, setViewMode] = useState<MapViewMode>('map');

  const [points, setPoints] = useState<MapPoint[]>([]);
  const [meta, setMeta] = useState<{ domains: string[]; eras: string[]; sources: string[] }>({
    domains: [],
    eras: [],
    sources: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [domain, setDomain] = useState<string>('all');
  const [era, setEra] = useState<string>('all');
  const [modelSource, setModelSource] = useState<string>('all');

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [selectedRankings, setSelectedRankings] = useState<Ranking[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();

    const fetchMapData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      const params = new URLSearchParams();
      params.set('limit', '1000');
      if (domain !== 'all') params.set('domain', domain);
      if (era !== 'all') params.set('era', era);
      if (modelSource !== 'all') params.set('modelSource', modelSource);

      try {
        const res = await fetch(`/api/map?${params.toString()}`, { signal: controller.signal });
        if (!res.ok) {
          setPoints([]);
          setErrorMessage(`Failed to fetch map data (${res.status}).`);
          return;
        }
        const data: MapResponse = await res.json();
        setPoints(Array.isArray(data?.points) ? data.points : []);
        setMeta(data?.meta ?? { domains: [], eras: [], sources: [] });
      } catch (error) {
        if ((error as Error).name === 'AbortError') return;
        console.error('Failed to fetch map data:', error);
        setPoints([]);
        setErrorMessage('Failed to fetch map data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchMapData();
    return () => controller.abort();
  }, [domain, era, modelSource]);

  useEffect(() => {
    if (!selectedId) {
      setSelectedFigure(null);
      setSelectedRankings([]);
      return;
    }

    const fetchDetail = async () => {
      setIsDetailLoading(true);
      try {
        const res = await fetch(`/api/figures/${selectedId}`);
        if (!res.ok) {
          setSelectedFigure(null);
          setSelectedRankings([]);
          return;
        }
        const data: FigureDetailResponse = await res.json();
        setSelectedFigure(data?.figure ?? null);
        setSelectedRankings(Array.isArray(data?.rankings) ? data.rankings : []);
      } catch (error) {
        console.error('Failed to fetch figure detail:', error);
        setSelectedFigure(null);
        setSelectedRankings([]);
      } finally {
        setIsDetailLoading(false);
      }
    };

    fetchDetail();
  }, [selectedId]);

  const handleSelect = useCallback((point: MapPoint) => {
    setSelectedId(point.id);
  }, []);

  return (
    <div className="min-h-screen bg-[#f8f5ef]">
      <AppHeader
        active="maps"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <main className="mx-auto max-w-7xl px-6 pb-16 pt-10">
        <div className="flex flex-col gap-8">
          <header className="flex flex-col gap-3">
            <p className="text-xs uppercase tracking-[0.3em] text-stone-400">Maps</p>
            <h2 className="text-3xl font-serif text-stone-900">
              A geographic view of historical influence
            </h2>
            <p className="max-w-3xl text-sm text-stone-600">
              Explore the birthplace geography of the top 1,000 figures. Toggle between a flat projection
              and a rotating globe, then filter by model, era, and domain to spot geographic clusters.
            </p>
          </header>

          <section className="rounded-3xl border border-stone-200/70 bg-white/80 p-4 shadow-sm backdrop-blur-sm">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap items-center gap-3">
                <div className="rounded-full border border-stone-200 bg-stone-50 p-1 shadow-inner">
                  <button
                    className={`px-4 py-1.5 text-sm transition-all ${
                      viewMode === 'map'
                        ? 'rounded-full bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                    onClick={() => setViewMode('map')}
                  >
                    Map
                  </button>
                  <button
                    className={`px-4 py-1.5 text-sm transition-all ${
                      viewMode === 'globe'
                        ? 'rounded-full bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                    onClick={() => setViewMode('globe')}
                  >
                    Globe
                  </button>
                  <button
                    className={`px-4 py-1.5 text-sm transition-all ${
                      viewMode === 'timeline'
                        ? 'rounded-full bg-white text-stone-900 shadow-sm'
                        : 'text-stone-500 hover:text-stone-700'
                    }`}
                    onClick={() => setViewMode('timeline')}
                  >
                    Timeline
                  </button>
                </div>

                <select
                  value={modelSource}
                  onChange={(event) => setModelSource(event.target.value)}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                >
                  <option value="all">All models (average)</option>
                  {meta.sources.map((source) => (
                    <option key={source} value={source}>
                      {formatModelLabel(source)}
                    </option>
                  ))}
                </select>

                <select
                  value={era}
                  onChange={(event) => setEra(event.target.value)}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                >
                  <option value="all">All eras</option>
                  {meta.eras.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>

                <select
                  value={domain}
                  onChange={(event) => setDomain(event.target.value)}
                  className="rounded-full border border-stone-200 bg-white px-4 py-2 text-sm text-stone-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-500/60"
                >
                  <option value="all">All domains</option>
                  {meta.domains.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-xs text-stone-500">
                {points.length.toLocaleString()} figures plotted
                {viewMode !== 'timeline' && <span className="ml-2">Scroll to zoom</span>}
              </div>
            </div>
          </section>

          <section
            className={`relative overflow-hidden rounded-[32px] border border-stone-200/70 bg-white shadow-md ${
              viewMode === 'timeline' ? 'h-auto min-h-[700px] max-h-[85vh]' : 'h-[60vh] min-h-[480px]'
            }`}
          >
            {isLoading ? (
              <div className="h-full w-full p-6">
                <Skeleton className="h-full w-full rounded-[28px]" />
              </div>
            ) : errorMessage ? (
              <div className="flex h-full items-center justify-center text-sm text-stone-500">
                {errorMessage}
              </div>
            ) : viewMode === 'map' ? (
              <MapView points={points} onSelect={handleSelect} />
            ) : viewMode === 'globe' ? (
              <GlobeView points={points} onSelect={handleSelect} />
            ) : (
              <TimelineView points={points} />
            )}
          </section>
        </div>
      </main>

      <FigureDetailPanel
        figure={selectedFigure}
        rankings={selectedRankings}
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        isLoading={isDetailLoading}
      />
    </div>
  );
}
