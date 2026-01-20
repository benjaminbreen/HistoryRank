'use client';

import { Suspense } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { AppHeader } from '@/components/layout/AppHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/hooks/useSettings';
import { fetcher } from '@/lib/swr';
import { Award, TrendingUp, TrendingDown, ChevronRight, AlertTriangle, CheckCircle, Users, Target } from 'lucide-react';
import type { BenchmarksOverviewResponse } from '@/app/api/benchmarks/route';
import { MODEL_ICONS } from '@/types';

// Model brand colors
const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4.5': '#da7756',
  'claude-sonnet-4.5': '#da7756',
  'gemini-flash-3-preview': '#078EFA',
  'gemini-pro-3': '#4285F4',
  'gpt-5.2-thinking': '#10A37F',
  'deepseek-v3.2': '#4D6BFE',
  'qwen3-235b-a22b': '#615EFF',
  'glm-4.7': '#2563eb',
  'grok-4': '#1a1a1a',
  'grok-4.1-fast': '#1a1a1a',
  'mistral-large-3': '#FF8205',
};

// Grade colors
const GRADE_COLORS: Record<string, string> = {
  'A+': 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
  'A': 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
  'A-': 'text-emerald-500 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50',
  'B+': 'text-lime-600 dark:text-lime-400 bg-lime-50 dark:bg-lime-950/50',
  'B': 'text-lime-600 dark:text-lime-400 bg-lime-50 dark:bg-lime-950/50',
  'B-': 'text-lime-500 dark:text-lime-400 bg-lime-50 dark:bg-lime-950/50',
  'C+': 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
  'C': 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
  'C-': 'text-amber-500 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/50',
  'D': 'text-orange-600 dark:text-orange-400 bg-orange-50 dark:bg-orange-950/50',
  'F': 'text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-950/50',
};

function BenchmarksLoading() {
  return (
    <main className="min-h-screen bg-transparent">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <div className="space-y-8">
          <Skeleton className="h-32 w-full rounded-xl" />
          <Skeleton className="h-64 w-full rounded-xl" />
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[...Array(6)].map((_, i) => (
              <Skeleton key={i} className="h-64 rounded-xl" />
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}

interface ModelCardProps {
  model: BenchmarksOverviewResponse['models'][0];
  rank: number;
}

function ModelCard({ model, rank }: ModelCardProps) {
  const color = MODEL_COLORS[model.source] || '#6b7280';
  const icon = MODEL_ICONS[model.source];

  return (
    <Link
      href={`/benchmarks/${model.source}`}
      className="group relative bg-white dark:bg-slate-800 rounded-2xl border border-stone-200/70 dark:border-slate-700 p-5 transition-all hover:border-stone-300 dark:hover:border-slate-600 hover:shadow-lg hover:-translate-y-0.5"
    >
      {/* Rank badge */}
      <div className="absolute -top-3 -left-2 w-8 h-8 rounded-full bg-stone-900 dark:bg-amber-900 text-white dark:text-amber-100 text-sm font-bold flex items-center justify-center shadow-md">
        {rank}
      </div>

      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ backgroundColor: `${color}15` }}
          >
            {icon ? (
              <img src={icon} alt="" className="w-5 h-5" />
            ) : (
              <span className="text-lg font-bold" style={{ color }}>
                {model.label.charAt(0)}
              </span>
            )}
          </div>
          <div>
            <h3 className="font-semibold text-stone-900 dark:text-slate-100" style={{ color }}>
              {model.label}
            </h3>
            <div className="text-xs text-stone-500 dark:text-slate-400">
              {model.listCount} {model.listCount === 1 ? 'list' : 'lists'} / {model.uniqueFigures.toLocaleString()} figures
            </div>
          </div>
        </div>

        {/* Overall grade */}
        <div className={`px-3 py-1.5 rounded-lg text-lg font-bold ${GRADE_COLORS[model.grades.overall]}`}>
          {model.grades.overall}
        </div>
      </div>

      {/* Metric grades */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {[
          { label: 'Coverage', grade: model.grades.coverage, score: model.metrics.coverageScore },
          { label: 'Agreement', grade: model.grades.agreement, score: model.metrics.agreementScore },
          { label: 'Stability', grade: model.grades.stability, score: model.metrics.stabilityScore },
          { label: 'Diversity', grade: model.grades.diversity, score: model.metrics.diversityScore },
        ].map(({ label, grade, score }) => (
          <div key={label} className="text-center">
            <div className={`text-sm font-semibold ${GRADE_COLORS[grade]?.split(' ')[0]}`}>
              {grade}
            </div>
            <div className="text-[10px] text-stone-400 dark:text-slate-500 mt-0.5">{label}</div>
          </div>
        ))}
      </div>

      {/* Strengths/Weaknesses */}
      <div className="space-y-2 pt-3 border-t border-stone-100 dark:border-slate-700">
        <div className="flex items-start gap-2">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-stone-600 dark:text-slate-400 line-clamp-1">
            {model.topStrength}
          </span>
        </div>
        <div className="flex items-start gap-2">
          <TrendingDown className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <span className="text-xs text-stone-600 dark:text-slate-400 line-clamp-1">
            {model.topWeakness}
          </span>
        </div>
      </div>

      {/* Bias flags */}
      {model.biasFlags > 0 && (
        <div className="absolute top-3 right-16 flex items-center gap-1">
          <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />
          <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
            {model.biasFlags} bias{model.biasFlags > 1 ? 'es' : ''}
          </span>
        </div>
      )}

      {/* View details arrow */}
      <div className="absolute bottom-4 right-4 opacity-0 group-hover:opacity-100 transition-opacity">
        <ChevronRight className="w-5 h-5 text-stone-400 dark:text-slate-500" />
      </div>
    </Link>
  );
}

function LeaderboardTable({ models }: { models: BenchmarksOverviewResponse['models'] }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200/70 dark:border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-stone-50 dark:bg-slate-900/50 border-b border-stone-200 dark:border-slate-700">
              <th className="text-left text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">
                Rank
              </th>
              <th className="text-left text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">
                Model
              </th>
              <th className="text-center text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3">
                Overall
              </th>
              <th className="text-center text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                Coverage
              </th>
              <th className="text-center text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 hidden sm:table-cell">
                Agreement
              </th>
              <th className="text-center text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                Stability
              </th>
              <th className="text-center text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 hidden md:table-cell">
                Diversity
              </th>
              <th className="text-right text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider px-4 py-3 hidden lg:table-cell">
                Figures
              </th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100 dark:divide-slate-700">
            {models.map((model, index) => {
              const color = MODEL_COLORS[model.source] || '#6b7280';
              const icon = MODEL_ICONS[model.source];

              return (
                <tr
                  key={model.source}
                  className="hover:bg-stone-50 dark:hover:bg-slate-700/50 transition-colors"
                >
                  <td className="px-4 py-3">
                    <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-stone-100 dark:bg-slate-700 text-sm font-semibold text-stone-700 dark:text-slate-300">
                      {index + 1}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}15` }}
                      >
                        {icon ? (
                          <img src={icon} alt="" className="w-4 h-4" />
                        ) : (
                          <span className="text-sm font-bold" style={{ color }}>
                            {model.label.charAt(0)}
                          </span>
                        )}
                      </div>
                      <span className="font-medium text-stone-900 dark:text-slate-100">
                        {model.label}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2.5 py-1 rounded-md text-sm font-bold ${GRADE_COLORS[model.grades.overall]}`}>
                      {model.grades.overall}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className={`text-sm font-semibold ${GRADE_COLORS[model.grades.coverage]?.split(' ')[0]}`}>
                      {model.grades.coverage}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden sm:table-cell">
                    <span className={`text-sm font-semibold ${GRADE_COLORS[model.grades.agreement]?.split(' ')[0]}`}>
                      {model.grades.agreement}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    <span className={`text-sm font-semibold ${GRADE_COLORS[model.grades.stability]?.split(' ')[0]}`}>
                      {model.grades.stability}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center hidden md:table-cell">
                    <span className={`text-sm font-semibold ${GRADE_COLORS[model.grades.diversity]?.split(' ')[0]}`}>
                      {model.grades.diversity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right hidden lg:table-cell">
                    <span className="text-sm text-stone-600 dark:text-slate-400">
                      {model.uniqueFigures.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/benchmarks/${model.source}`}
                      className="inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 transition-colors"
                    >
                      Details <ChevronRight className="w-4 h-4" />
                    </Link>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function BenchmarksContent() {
  const { settings, updateSettings, resetSettings } = useSettings();

  const { data, error, isLoading } = useSWR<BenchmarksOverviewResponse>(
    '/api/benchmarks',
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  return (
    <main className="min-h-screen bg-transparent">
      <AppHeader
        active="benchmarks"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-500 to-orange-600 flex items-center justify-center shadow-lg">
              <Award className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl sm:text-3xl font-serif font-bold text-stone-900 dark:text-amber-100">
                LLM Historical Knowledge Benchmarks
              </h1>
              <p className="text-stone-500 dark:text-slate-400 text-sm mt-1">
                Evaluating AI models on historical knowledge, reasoning, and biases
              </p>
            </div>
          </div>
        </div>

        {error && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Failed to load benchmark data.
          </div>
        )}

        {isLoading ? (
          <BenchmarksLoading />
        ) : data ? (
          <div className="space-y-8">
            {/* Summary stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center">
                    <Target className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-stone-900 dark:text-slate-100">
                      {data.models.length}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-slate-400">Models Evaluated</div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/50 flex items-center justify-center">
                    <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-stone-900 dark:text-slate-100">
                      {data.totalLists}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-slate-400">Lists Analyzed</div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-950/50 flex items-center justify-center">
                    <Users className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-stone-900 dark:text-slate-100">
                      {data.totalFigures.toLocaleString()}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-slate-400">Unique Figures</div>
                  </div>
                </div>
              </div>
              <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/50 flex items-center justify-center">
                    <Award className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-stone-900 dark:text-slate-100">
                      {data.totalRankings.toLocaleString()}
                    </div>
                    <div className="text-xs text-stone-500 dark:text-slate-400">Total Rankings</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Leaderboard */}
            <section>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100 mb-4">
                Leaderboard
              </h2>
              <LeaderboardTable models={data.models} />
            </section>

            {/* Model cards grid */}
            <section>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100 mb-4">
                Model Report Cards
              </h2>
              <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
                Click any card to view the detailed benchmark report for that model
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {data.models.map((model, index) => (
                  <ModelCard key={model.source} model={model} rank={index + 1} />
                ))}
              </div>
            </section>

            {/* Methodology note */}
            <section className="bg-stone-50 dark:bg-slate-900/50 rounded-2xl border border-stone-200/70 dark:border-slate-700 p-6">
              <h3 className="text-sm font-semibold text-stone-700 dark:text-slate-300 mb-3">
                About These Benchmarks
              </h3>
              <div className="text-sm text-stone-600 dark:text-slate-400 space-y-2">
                <p>
                  Each model is evaluated on four dimensions: <strong>Coverage</strong> (breadth of historical knowledge),{' '}
                  <strong>Agreement</strong> (correlation with cross-model consensus), <strong>Stability</strong> (consistency across multiple runs),
                  and <strong>Diversity</strong> (geographic and temporal representation).
                </p>
                <p>
                  Bias indicators flag potential issues like Western-centricity, recency bias, or domain imbalances.
                  These metrics help identify where models may need additional training or fine-tuning.
                </p>
              </div>
            </section>

            {/* Footer timestamp */}
            <div className="text-xs text-stone-400 dark:text-slate-500 text-center">
              Generated {new Date(data.generatedAt).toLocaleString()}
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

export default function BenchmarksPage() {
  return (
    <Suspense fallback={<BenchmarksLoading />}>
      <BenchmarksContent />
    </Suspense>
  );
}
