'use client';

import { useMemo, useState } from 'react';
import { Tooltip } from '@/components/ui/tooltip';
import { ChevronDown, ChevronUp, Globe2 } from 'lucide-react';
import { GeoBiasResidualMap } from '@/components/compare/GeoBiasResidualMap';

interface GeoRegionStat {
  region: string;
  modelCount: number;
  baselineCount: number;
  modelPct: number;
  baselinePct: number;
  diffPct: number;
  overIndex: number | null;
  zScore: number;
}

interface GeoBiasModel {
  source: string;
  label: string;
  sampleSize: number;
  listCount: number;
  jsDivergence: number;
  regions: GeoRegionStat[];
  topPositive: Array<{ region: string; diffPct: number; modelPct: number; baselinePct: number }>;
  topNegative: Array<{ region: string; diffPct: number; modelPct: number; baselinePct: number }>;
}

interface GeoBiasData {
  topN: number;
  totalModels: number;
  baselineSampleSize: number;
  regions: string[];
  baseline: Array<{ region: string; count: number; pct: number }>;
  regionCentroids: Array<{ region: string; lat: number; lon: number; sampleCount: number }>;
  models: GeoBiasModel[];
}

interface GeoBiasPanelProps {
  data: GeoBiasData;
}

function formatSigned(value: number): string {
  return `${value >= 0 ? '+' : ''}${value.toFixed(1)}`;
}

function formatPct(value: number): string {
  return `${value.toFixed(1)}%`;
}

function getHeatCellStyle(diffPct: number) {
  const maxDiff = 8;
  const intensity = Math.min(Math.abs(diffPct) / maxDiff, 1);

  if (diffPct > 0) {
    return {
      backgroundColor: `rgba(16, 185, 129, ${0.12 + intensity * 0.5})`,
      borderColor: 'rgba(16, 185, 129, 0.25)',
      color: intensity > 0.65 ? '#ffffff' : undefined,
    };
  }
  if (diffPct < 0) {
    return {
      backgroundColor: `rgba(244, 63, 94, ${0.12 + intensity * 0.5})`,
      borderColor: 'rgba(244, 63, 94, 0.25)',
      color: intensity > 0.65 ? '#ffffff' : undefined,
    };
  }
  return {
    backgroundColor: 'rgba(120, 113, 108, 0.08)',
    borderColor: 'rgba(120, 113, 108, 0.2)',
  };
}

export function GeoBiasPanel({ data }: GeoBiasPanelProps) {
  const [showAllRegions, setShowAllRegions] = useState(false);
  const [selectedSource, setSelectedSource] = useState(data.models[0]?.source ?? '');

  const displayedRegions = useMemo(
    () => (showAllRegions ? data.regions : data.regions.slice(0, 12)),
    [showAllRegions, data.regions]
  );

  const selectedModel = useMemo(
    () => data.models.find((model) => model.source === selectedSource) || data.models[0] || null,
    [data.models, selectedSource]
  );

  const baselineTop = useMemo(
    () => data.baseline.slice(0, 6),
    [data.baseline]
  );

  const mapPoints = useMemo(() => {
    if (!selectedModel) return [];
    const centroidByRegion = new Map(
      data.regionCentroids.map((entry) => [entry.region, entry])
    );

    return selectedModel.regions
      .map((entry) => {
        const centroid = centroidByRegion.get(entry.region);
        if (!centroid) return null;
        return {
          region: entry.region,
          lat: centroid.lat,
          lon: centroid.lon,
          diffPct: entry.diffPct,
          modelPct: entry.modelPct,
          baselinePct: entry.baselinePct,
          zScore: entry.zScore,
        };
      })
      .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
      .sort((a, b) => Math.abs(b.diffPct) - Math.abs(a.diffPct));
  }, [data.regionCentroids, selectedModel]);

  return (
    <div className="space-y-6">
      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-2">
          <Globe2 className="h-5 w-5 text-stone-500 dark:text-slate-400" />
          <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
            Geographic Bias Heatmap
          </h2>
        </div>
        <p className="text-sm text-stone-600 dark:text-slate-400">
          Birthplace-region mix in each model&apos;s top {data.topN} figures versus the unweighted consensus top {data.topN}.
          Cells show percentage-point delta (model minus baseline).
        </p>

        <div className="mt-4 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full border border-stone-200 dark:border-slate-700 px-2.5 py-1 text-stone-600 dark:text-slate-300">
            {data.totalModels} models
          </span>
          <span className="rounded-full border border-stone-200 dark:border-slate-700 px-2.5 py-1 text-stone-600 dark:text-slate-300">
            Baseline sample: {data.baselineSampleSize.toLocaleString()} figures
          </span>
          <span className="rounded-full border border-stone-200 dark:border-slate-700 px-2.5 py-1 text-stone-600 dark:text-slate-300">
            Sorted by JS divergence (higher = more geographically distinct)
          </span>
        </div>

        <div className="mt-4 flex items-center gap-4 text-xs text-stone-500 dark:text-slate-400">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-emerald-500/70" />
            Over-indexed vs baseline
          </div>
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-sm bg-rose-500/70" />
            Under-indexed vs baseline
          </div>
        </div>
      </section>

      <section className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200 dark:border-slate-700 p-4 sm:p-6">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <label className="text-xs font-medium text-stone-500 dark:text-slate-400">Selected model</label>
          <select
            value={selectedModel?.source ?? ''}
            onChange={(event) => setSelectedSource(event.target.value)}
            className="rounded-full border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs text-stone-700 dark:text-slate-200"
          >
            {data.models.map((model) => (
              <option key={model.source} value={model.source}>
                {model.label}
              </option>
            ))}
          </select>
        </div>

        <div className="h-[380px] sm:h-[420px] mb-5">
          {selectedModel && mapPoints.length > 0 ? (
            <GeoBiasResidualMap modelLabel={selectedModel.label} points={mapPoints} />
          ) : (
            <div className="h-full w-full rounded-xl border border-stone-200 dark:border-slate-700 bg-stone-50 dark:bg-slate-900/40 flex items-center justify-center text-sm text-stone-500 dark:text-slate-400">
              No regional centroid data available.
            </div>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-1">
            <thead>
              <tr>
                <th className="sticky left-0 z-20 bg-white dark:bg-slate-800 px-2 py-2 text-left text-xs font-semibold text-stone-500 dark:text-slate-400">
                  Model
                </th>
                <th className="sticky left-[190px] z-20 bg-white dark:bg-slate-800 px-2 py-2 text-right text-xs font-semibold text-stone-500 dark:text-slate-400">
                  JS div.
                </th>
                {displayedRegions.map((region) => (
                  <th key={region} className="px-2 py-2 text-center text-[11px] font-semibold text-stone-500 dark:text-slate-400 whitespace-nowrap">
                    {region}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.models.map((model) => (
                <tr key={model.source}>
                  <td className="sticky left-0 z-10 bg-white dark:bg-slate-800 px-2 py-1.5 min-w-[190px]">
                    <button
                      onClick={() => setSelectedSource(model.source)}
                      className={`w-full rounded-md border px-2 py-1 text-left transition-colors ${
                        selectedModel?.source === model.source
                          ? 'border-amber-300 bg-amber-50 text-stone-900 dark:border-amber-700 dark:bg-amber-900/20 dark:text-amber-100'
                          : 'border-transparent text-stone-700 dark:text-slate-300 hover:border-stone-200 hover:bg-stone-50 dark:hover:border-slate-700 dark:hover:bg-slate-900/40'
                      }`}
                    >
                      <div className="text-xs font-medium">{model.label}</div>
                      <div className="text-[10px] text-stone-500 dark:text-slate-500">
                        n={model.sampleSize} · {model.listCount} list{model.listCount !== 1 ? 's' : ''}
                      </div>
                    </button>
                  </td>
                  <td className="sticky left-[190px] z-10 bg-white dark:bg-slate-800 px-2 py-1.5 text-right text-xs font-mono text-stone-600 dark:text-slate-300">
                    {model.jsDivergence.toFixed(3)}
                  </td>
                  {displayedRegions.map((region) => {
                    const cell = model.regions.find((entry) => entry.region === region);
                    const diff = cell?.diffPct ?? 0;
                    const style = getHeatCellStyle(diff);

                    return (
                      <td key={`${model.source}:${region}`} className="px-0.5 py-1">
                        <Tooltip
                          align="center"
                          content={
                            <span>
                              <strong>{model.label}</strong> · <strong>{region}</strong>
                              <br />
                              Model: {formatPct(cell?.modelPct ?? 0)} ({cell?.modelCount ?? 0})
                              <br />
                              Baseline: {formatPct(cell?.baselinePct ?? 0)} ({cell?.baselineCount ?? 0})
                              <br />
                              Delta: {formatSigned(diff)} pp
                              <br />
                              z-score: {(cell?.zScore ?? 0).toFixed(2)}
                            </span>
                          }
                        >
                          <div
                            className="min-w-[64px] rounded-md border px-1.5 py-1 text-center text-[11px] font-mono"
                            style={style}
                          >
                            {formatSigned(diff)}
                          </div>
                        </Tooltip>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {data.regions.length > 12 && (
          <button
            onClick={() => setShowAllRegions((prev) => !prev)}
            className="mt-4 w-full py-2 text-sm text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 hover:bg-stone-50 dark:hover:bg-slate-700/40 rounded-lg border border-stone-200 dark:border-slate-700 transition-colors flex items-center justify-center gap-1"
          >
            {showAllRegions ? (
              <>
                Show fewer regions <ChevronUp className="h-4 w-4" />
              </>
            ) : (
              <>
                Show all {data.regions.length} regions <ChevronDown className="h-4 w-4" />
              </>
            )}
          </button>
        )}
      </section>

      {selectedModel && (
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-4">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-amber-100 mb-3">
              Baseline Top Regions
            </h3>
            <div className="space-y-2 text-xs">
              {baselineTop.map((region) => (
                <div key={region.region} className="flex items-center justify-between text-stone-600 dark:text-slate-300">
                  <span className="truncate pr-2">{region.region}</span>
                  <span className="font-mono">{formatPct(region.pct)}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-emerald-200/70 dark:border-emerald-900/40 p-4">
            <h3 className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mb-3">
              {selectedModel.label}: Over-indexed
            </h3>
            <div className="space-y-2 text-xs">
              {selectedModel.topPositive.length === 0 ? (
                <div className="text-stone-500 dark:text-slate-400">No positive deviations.</div>
              ) : (
                selectedModel.topPositive.map((entry) => (
                  <div key={entry.region} className="flex items-center justify-between gap-2">
                    <span className="truncate text-stone-700 dark:text-slate-200">{entry.region}</span>
                    <span className="font-mono text-emerald-700 dark:text-emerald-300">
                      {formatSigned(entry.diffPct)} pp
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-rose-200/70 dark:border-rose-900/40 p-4">
            <h3 className="text-sm font-semibold text-rose-700 dark:text-rose-300 mb-3">
              {selectedModel.label}: Under-indexed
            </h3>
            <div className="space-y-2 text-xs">
              {selectedModel.topNegative.length === 0 ? (
                <div className="text-stone-500 dark:text-slate-400">No negative deviations.</div>
              ) : (
                selectedModel.topNegative.map((entry) => (
                  <div key={entry.region} className="flex items-center justify-between gap-2">
                    <span className="truncate text-stone-700 dark:text-slate-200">{entry.region}</span>
                    <span className="font-mono text-rose-700 dark:text-rose-300">
                      {formatSigned(entry.diffPct)} pp
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
