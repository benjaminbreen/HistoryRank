'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { ScatterPlotChart } from '@/components/viz/ScatterPlotChart';
import { ScatterPlotControls } from '@/components/viz/ScatterPlotControls';
import { ScatterPlotLegend } from '@/components/viz/ScatterPlotLegend';
import { DownloadMenu } from '@/components/viz/DownloadMenu';
import { FigureDetailPanel } from '@/components/detail/FigureDetailPanel';
import { Skeleton } from '@/components/ui/skeleton';
import { AppHeader } from '@/components/layout/AppHeader';
import { Info } from 'lucide-react';
import { useSettings } from '@/hooks/useSettings';
import type {
  ScatterDataPoint,
  ScatterPlotConfig,
  ScatterPlotResponse,
  Figure,
  Ranking,
  FigureDetailResponse,
} from '@/types';

const DEFAULT_CONFIG: ScatterPlotConfig = {
  xAxis: 'hpiRank',
  yAxis: 'llmConsensusRank',
  colorMode: 'domain',
  sizeMode: 'fixed',
  showDiagonal: true,
  showTrendLine: false,
  showOutlierLabels: true,
  domains: [],
  eras: [],
  rankRange: [1, 1000],
  highlightSearch: '',
};

export default function ScatterPage() {
  const chartRef = useRef<HTMLDivElement>(null);
  const { settings, updateSettings, resetSettings } = useSettings();

  // Data
  const [data, setData] = useState<ScatterDataPoint[]>([]);
  const [availableSources, setAvailableSources] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Config
  const [config, setConfig] = useState<ScatterPlotConfig>(DEFAULT_CONFIG);

  // Detail panel
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedFigure, setSelectedFigure] = useState<Figure | null>(null);
  const [selectedRankings, setSelectedRankings] = useState<Ranking[]>([]);
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  // Hover state for info
  const [hoveredPoint, setHoveredPoint] = useState<ScatterDataPoint | null>(null);

  // Fetch scatter data
  useEffect(() => {
    const fetchData = async () => {
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch('/api/scatter');
        if (!res.ok) {
          setData([]);
          setAvailableSources([]);
          setErrorMessage(`Failed to fetch scatter data (${res.status}).`);
          return;
        }
        const result: ScatterPlotResponse = await res.json();
        setData(Array.isArray(result?.points) ? result.points : []);
        setAvailableSources(Array.isArray(result?.availableSources) ? result.availableSources : []);
      } catch (error) {
        console.error('Failed to fetch scatter data:', error);
        setData([]);
        setAvailableSources([]);
        setErrorMessage('Failed to fetch scatter data.');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, []);

  // Fetch figure details when selected
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

  // Handle point click
  const handlePointClick = useCallback((point: ScatterDataPoint) => {
    setSelectedId(point.id);
  }, []);

  // Handle point hover
  const handlePointHover = useCallback((point: ScatterDataPoint | null) => {
    setHoveredPoint(point);
  }, []);

  // Calculate filtered point count
  const filteredData = data.filter(point => {
    // Apply domain filter
    if (config.domains.length > 0 && !config.domains.includes(point.domain || '')) return false;
    // Apply era filter
    if (config.eras.length > 0 && !config.eras.includes(point.era || '')) return false;
    return true;
  });

  return (
    <main className="min-h-screen bg-transparent">
      <AppHeader
        active="scatter"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <div className="max-w-[1600px] mx-auto px-6 pt-3">
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-stone-600 dark:text-slate-400">
          <span className="inline-flex items-center gap-2">
            <Info className="h-4 w-4" />
            Scatter view compares LLM vs. HPI rankings.
          </span>
          <DownloadMenu chartRef={chartRef} data={filteredData} config={config} />
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {errorMessage && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            {errorMessage} Try refreshing or check the deployment logs.
          </div>
        )}
        <div className="flex gap-6">
          {/* Sidebar controls */}
          <div className="w-72 flex-shrink-0">
            <ScatterPlotControls
              config={config}
              onConfigChange={setConfig}
              availableSources={availableSources}
              pointCount={filteredData.length}
            />

            {/* Help panel */}
            <div className="mt-4 p-4 bg-white rounded-lg border border-stone-200">
              <div className="flex items-center gap-2 text-sm font-medium text-stone-700 mb-2">
                <Info className="h-4 w-4" />
                How to Read
              </div>
              <div className="text-xs text-stone-600 space-y-2">
                <p>
                  <strong>Diagonal line:</strong> Points on the line have equal ranks
                  across both axes (perfect agreement).
                </p>
                <p>
                  <strong>Above diagonal:</strong> Higher (worse) rank on Y-axis than X-axis.
                </p>
                <p>
                  <strong>Below diagonal:</strong> Lower (better) rank on Y-axis than X-axis.
                </p>
                <p>
                  <strong>Distance from line:</strong> Farther = more disagreement between sources.
                </p>
              </div>
            </div>
          </div>

          {/* Chart area */}
          <div className="flex-1 min-w-0">
            {/* Legend */}
            <div className="mb-4 p-3 bg-white rounded-lg border border-stone-200">
              <ScatterPlotLegend colorMode={config.colorMode} />
            </div>

            {/* Chart */}
            <div
              ref={chartRef}
              className="bg-white rounded-lg border border-stone-200 p-4 relative"
              style={{ height: 'calc(100vh - 280px)', minHeight: '500px' }}
            >
              {isLoading ? (
                <div className="w-full h-full flex items-center justify-center">
                  <div className="text-center">
                    <Skeleton className="h-8 w-48 mx-auto mb-4" />
                    <Skeleton className="h-4 w-32 mx-auto" />
                  </div>
                </div>
              ) : (
                <ScatterPlotChart
                  data={data}
                  config={config}
                  onPointClick={handlePointClick}
                  onPointHover={handlePointHover}
                />
              )}
            </div>

            {/* Stats footer */}
            <div className="mt-4 flex items-center justify-between text-sm text-stone-500">
              <div className="flex items-center gap-4">
                <span>
                  Showing <strong className="text-stone-700">{filteredData.length}</strong> of {data.length} figures
                </span>
                {config.domains.length > 0 && (
                  <span>
                    Filtered by {config.domains.length} domain{config.domains.length !== 1 ? 's' : ''}
                  </span>
                )}
                {config.eras.length > 0 && (
                  <span>
                    Filtered by {config.eras.length} era{config.eras.length !== 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {hoveredPoint && (
                <div className="text-stone-700">
                  Hovering: <strong>{hoveredPoint.name}</strong>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Detail Panel */}
      <FigureDetailPanel
        figure={selectedFigure}
        rankings={selectedRankings}
        isOpen={selectedId !== null}
        onClose={() => setSelectedId(null)}
        isLoading={isDetailLoading}
      />
    </main>
  );
}
