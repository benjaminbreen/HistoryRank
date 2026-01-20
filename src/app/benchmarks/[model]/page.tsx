'use client';

import { Suspense, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppHeader } from '@/components/layout/AppHeader';
import { Skeleton } from '@/components/ui/skeleton';
import { useSettings } from '@/hooks/useSettings';
import { fetcher } from '@/lib/swr';
import {
  ChevronLeft,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  BarChart3,
  Globe,
  Clock,
  BookOpen,
  Users,
  Zap,
  Target,
  ArrowRight,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import type { ModelBenchmarkResponse } from '@/app/api/benchmarks/[model]/route';
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
const GRADE_COLORS: Record<string, { text: string; bg: string }> = {
  'A+': { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
  'A': { text: 'text-emerald-600 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
  'A-': { text: 'text-emerald-500 dark:text-emerald-400', bg: 'bg-emerald-50 dark:bg-emerald-950/50' },
  'B+': { text: 'text-lime-600 dark:text-lime-400', bg: 'bg-lime-50 dark:bg-lime-950/50' },
  'B': { text: 'text-lime-600 dark:text-lime-400', bg: 'bg-lime-50 dark:bg-lime-950/50' },
  'B-': { text: 'text-lime-500 dark:text-lime-400', bg: 'bg-lime-50 dark:bg-lime-950/50' },
  'C+': { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50' },
  'C': { text: 'text-amber-600 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50' },
  'C-': { text: 'text-amber-500 dark:text-amber-400', bg: 'bg-amber-50 dark:bg-amber-950/50' },
  'D': { text: 'text-orange-600 dark:text-orange-400', bg: 'bg-orange-50 dark:bg-orange-950/50' },
  'F': { text: 'text-red-600 dark:text-red-400', bg: 'bg-red-50 dark:bg-red-950/50' },
};

function ModelLoading() {
  return (
    <main className="min-h-screen bg-transparent">
      <div className="max-w-[1400px] mx-auto px-6 py-8">
        <Skeleton className="h-8 w-32 mb-6" />
        <div className="space-y-8">
          <Skeleton className="h-48 w-full rounded-xl" />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
          </div>
          <Skeleton className="h-96 w-full rounded-xl" />
        </div>
      </div>
    </main>
  );
}

function GradeCard({ label, grade, score, icon: Icon }: {
  label: string;
  grade: string;
  score: number;
  icon: React.ElementType;
}) {
  const colors = GRADE_COLORS[grade] || { text: 'text-stone-600', bg: 'bg-stone-50' };

  return (
    <div className={`rounded-xl p-4 ${colors.bg} border border-stone-200/50 dark:border-slate-700/50`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`w-4 h-4 ${colors.text}`} />
        <span className="text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-2">
        <span className={`text-3xl font-bold ${colors.text}`}>{grade}</span>
        <span className="text-sm text-stone-500 dark:text-slate-400">({score}%)</span>
      </div>
    </div>
  );
}

function BiasIndicatorCard({ bias }: { bias: ModelBenchmarkResponse['biases'][0] }) {
  const statusColors = {
    low: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400',
    medium: 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400',
    high: 'bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-400',
  };

  const statusIcons = {
    low: <CheckCircle className="w-4 h-4" />,
    medium: <AlertTriangle className="w-4 h-4" />,
    high: <AlertTriangle className="w-4 h-4" />,
  };

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 p-4">
      <div className="flex items-start justify-between mb-2">
        <h4 className="font-medium text-stone-900 dark:text-slate-100">{bias.label}</h4>
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[bias.status]}`}>
          {statusIcons[bias.status]}
          {bias.status}
        </span>
      </div>
      <p className="text-sm text-stone-600 dark:text-slate-400">{bias.description}</p>
      {/* Score bar */}
      <div className="mt-3 h-2 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${
            bias.status === 'low' ? 'bg-emerald-500' :
            bias.status === 'medium' ? 'bg-amber-500' : 'bg-red-500'
          }`}
          style={{ width: `${bias.score * 100}%` }}
        />
      </div>
    </div>
  );
}

interface BreakdownItem {
  count: number;
  percent: number;
  consensusPercent: number;
  diff: number;
  region?: string;
  era?: string;
  domain?: string;
}

function CoverageBreakdown({ data, title, icon: Icon, labelKey }: {
  data: BreakdownItem[];
  title: string;
  icon: React.ElementType;
  labelKey: 'region' | 'era' | 'domain';
}) {
  const [showAll, setShowAll] = useState(false);
  const displayData = showAll ? data : data.slice(0, 6);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Icon className="w-5 h-5 text-stone-600 dark:text-slate-400" />
        <h3 className="font-semibold text-stone-900 dark:text-slate-100">{title}</h3>
      </div>

      <div className="space-y-3">
        {displayData.map((item, idx) => {
          const label = String(item[labelKey] || 'Unknown');
          const diffColor = item.diff > 0 ? 'text-emerald-600 dark:text-emerald-400' :
                           item.diff < 0 ? 'text-amber-600 dark:text-amber-400' : 'text-stone-500';

          return (
            <div key={idx}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="text-stone-700 dark:text-slate-300">{label}</span>
                <div className="flex items-center gap-2">
                  <span className="text-stone-500 dark:text-slate-400">{item.percent}%</span>
                  {item.diff !== 0 && (
                    <span className={`text-xs ${diffColor}`}>
                      ({item.diff > 0 ? '+' : ''}{item.diff}%)
                    </span>
                  )}
                </div>
              </div>
              <div className="h-2 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden relative">
                {/* Consensus reference line */}
                <div
                  className="absolute top-0 h-full w-0.5 bg-stone-400 dark:bg-slate-500 z-10"
                  style={{ left: `${item.consensusPercent}%` }}
                />
                {/* Model bar */}
                <div
                  className={`h-full rounded-full transition-all ${
                    item.diff > 0 ? 'bg-emerald-500' :
                    item.diff < 0 ? 'bg-amber-500' : 'bg-blue-500'
                  }`}
                  style={{ width: `${item.percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {data.length > 6 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-4 w-full py-2 text-sm text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 flex items-center justify-center gap-1"
        >
          {showAll ? (
            <>Show less <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>Show {data.length - 6} more <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      )}

      {/* Legend */}
      <div className="mt-4 pt-3 border-t border-stone-100 dark:border-slate-700 flex items-center gap-4 text-xs text-stone-500 dark:text-slate-400">
        <div className="flex items-center gap-1">
          <div className="w-4 h-0.5 bg-stone-400 dark:bg-slate-500" />
          <span>Consensus</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2 bg-emerald-500 rounded" />
          <span>Above avg</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-4 h-2 bg-amber-500 rounded" />
          <span>Below avg</span>
        </div>
      </div>
    </div>
  );
}

function PeerComparisonTable({ peers, modelLabel }: {
  peers: ModelBenchmarkResponse['comparison']['peerModels'];
  modelLabel: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 overflow-hidden">
      <div className="p-4 border-b border-stone-100 dark:border-slate-700">
        <h3 className="font-semibold text-stone-900 dark:text-slate-100 flex items-center gap-2">
          <Users className="w-5 h-5 text-stone-600 dark:text-slate-400" />
          Peer Comparison
        </h3>
        <p className="text-xs text-stone-500 dark:text-slate-400 mt-1">
          Correlation with {modelLabel}&apos;s rankings
        </p>
      </div>
      <div className="divide-y divide-stone-100 dark:divide-slate-700">
        {peers.slice(0, 8).map((peer, idx) => {
          const color = MODEL_COLORS[peer.model] || '#6b7280';
          const correlationPct = Math.round(peer.correlation * 100);

          return (
            <div key={peer.model} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-sm text-stone-400 dark:text-slate-500 w-4">
                  {idx + 1}
                </span>
                <div
                  className="w-6 h-6 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${color}15` }}
                >
                  {MODEL_ICONS[peer.model] ? (
                    <img src={MODEL_ICONS[peer.model]} alt="" className="w-3 h-3" />
                  ) : (
                    <span className="text-xs font-bold" style={{ color }}>
                      {peer.label.charAt(0)}
                    </span>
                  )}
                </div>
                <span className="text-sm text-stone-700 dark:text-slate-300">
                  {peer.label}
                </span>
              </div>
              <div className="flex items-center gap-3">
                <div className="w-24 h-1.5 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      correlationPct >= 70 ? 'bg-emerald-500' :
                      correlationPct >= 50 ? 'bg-lime-500' :
                      correlationPct >= 30 ? 'bg-amber-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${correlationPct}%` }}
                  />
                </div>
                <span className="text-sm font-medium text-stone-600 dark:text-slate-400 w-12 text-right">
                  {correlationPct}%
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StabilitySection({ stability }: { stability: ModelBenchmarkResponse['stability'] }) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 p-5">
      <div className="flex items-center gap-2 mb-4">
        <Zap className="w-5 h-5 text-stone-600 dark:text-slate-400" />
        <h3 className="font-semibold text-stone-900 dark:text-slate-100">Stability Analysis</h3>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="text-center">
          <div className="text-2xl font-bold text-stone-900 dark:text-slate-100">
            {stability.consistencyScore}%
          </div>
          <div className="text-xs text-stone-500 dark:text-slate-400">Consistency</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-stone-900 dark:text-slate-100">
            #{stability.consistencyRank}
          </div>
          <div className="text-xs text-stone-500 dark:text-slate-400">of {stability.totalModels}</div>
        </div>
        <div className="text-center">
          <div className="text-2xl font-bold text-stone-900 dark:text-slate-100">
            {stability.byTier.length}
          </div>
          <div className="text-xs text-stone-500 dark:text-slate-400">Tiers analyzed</div>
        </div>
      </div>

      {/* Stability by tier */}
      <h4 className="text-sm font-medium text-stone-700 dark:text-slate-300 mb-3">By Rank Tier</h4>
      <div className="space-y-2">
        {stability.byTier.map(tier => (
          <div key={tier.tier} className="flex items-center justify-between text-sm">
            <span className="text-stone-600 dark:text-slate-400">{tier.tier}</span>
            <div className="flex items-center gap-4">
              <span className="text-stone-500 dark:text-slate-500">
                {tier.figureCount} figures
              </span>
              <span className="font-medium text-stone-700 dark:text-slate-300">
                avg. {tier.avgStdDev}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Most volatile */}
      {stability.mostVolatile.length > 0 && (
        <div className="mt-6 pt-4 border-t border-stone-100 dark:border-slate-700">
          <h4 className="text-sm font-medium text-stone-700 dark:text-slate-300 mb-3">
            Most Volatile Rankings
          </h4>
          <div className="space-y-2">
            {stability.mostVolatile.slice(0, 5).map(fig => (
              <div key={fig.id} className="flex items-center justify-between text-sm">
                <span className="text-stone-600 dark:text-slate-400 truncate max-w-[60%]">
                  {fig.name}
                </span>
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  #{fig.min} - #{fig.max}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function ModelBenchmarkContent() {
  const params = useParams();
  const modelSlug = params.model as string;
  const { settings, updateSettings, resetSettings } = useSettings();

  const { data, error, isLoading } = useSWR<ModelBenchmarkResponse>(
    `/api/benchmarks/${modelSlug}`,
    fetcher,
    { revalidateOnFocus: false, dedupingInterval: 60000 }
  );

  const color = MODEL_COLORS[modelSlug] || '#6b7280';
  const icon = MODEL_ICONS[modelSlug];

  return (
    <main className="min-h-screen bg-transparent">
      <AppHeader
        active="benchmarks"
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />

      <div className="max-w-[1400px] mx-auto px-6 py-8">
        {/* Back link */}
        <Link
          href="/benchmarks"
          className="inline-flex items-center gap-1 text-sm text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 mb-6"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Benchmarks
        </Link>

        {error && (
          <div className="mb-6 rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Failed to load benchmark data for this model.
          </div>
        )}

        {isLoading ? (
          <ModelLoading />
        ) : data ? (
          <div className="space-y-8">
            {/* Header */}
            <div className="bg-white dark:bg-slate-800 rounded-2xl border border-stone-200/70 dark:border-slate-700 p-6">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex items-center gap-4">
                  <div
                    className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-lg"
                    style={{ backgroundColor: `${color}15` }}
                  >
                    {icon ? (
                      <img src={icon} alt="" className="w-8 h-8" />
                    ) : (
                      <span className="text-2xl font-bold" style={{ color }}>
                        {data.model.label.charAt(0)}
                      </span>
                    )}
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-serif font-bold" style={{ color }}>
                      {data.model.label}
                    </h1>
                    <p className="text-stone-500 dark:text-slate-400 text-sm mt-1">
                      {data.model.listCount} lists analyzed / {data.model.uniqueFigures.toLocaleString()} unique figures
                    </p>
                  </div>
                </div>

                {/* Overall grade */}
                <div className={`px-6 py-4 rounded-xl ${GRADE_COLORS[data.grades.overall].bg}`}>
                  <div className="text-xs text-stone-500 dark:text-slate-400 mb-1">Overall Grade</div>
                  <div className={`text-5xl font-bold ${GRADE_COLORS[data.grades.overall].text}`}>
                    {data.grades.overall}
                  </div>
                </div>
              </div>

              {/* Strengths & Weaknesses */}
              <div className="mt-6 pt-6 border-t border-stone-100 dark:border-slate-700 grid sm:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-emerald-700 dark:text-emerald-400 flex items-center gap-2 mb-3">
                    <TrendingUp className="w-4 h-4" /> Strengths
                  </h3>
                  <ul className="space-y-2">
                    {data.summary.strengths.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-stone-600 dark:text-slate-400">
                        <CheckCircle className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                        {s}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-amber-700 dark:text-amber-400 flex items-center gap-2 mb-3">
                    <TrendingDown className="w-4 h-4" /> Weaknesses
                  </h3>
                  <ul className="space-y-2">
                    {data.summary.weaknesses.map((w, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-stone-600 dark:text-slate-400">
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                        {w}
                      </li>
                    ))}
                    {data.summary.weaknesses.length === 0 && (
                      <li className="text-sm text-stone-500 dark:text-slate-400">
                        No significant weaknesses identified
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            </div>

            {/* Grade cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <GradeCard label="Coverage" grade={data.grades.coverage} score={data.scores.coverage} icon={BarChart3} />
              <GradeCard label="Agreement" grade={data.grades.agreement} score={data.scores.agreement} icon={Target} />
              <GradeCard label="Stability" grade={data.grades.stability} score={data.scores.stability} icon={Zap} />
              <GradeCard label="Diversity" grade={data.grades.diversity} score={data.scores.diversity} icon={Globe} />
            </div>

            {/* Bias indicators */}
            <section>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100 mb-4 flex items-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Bias Indicators
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {data.biases.map(bias => (
                  <BiasIndicatorCard key={bias.type} bias={bias} />
                ))}
              </div>
            </section>

            {/* Coverage breakdown */}
            <section>
              <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100 mb-4">
                Coverage Analysis
              </h2>
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <CoverageBreakdown
                  data={data.coverage.byRegion}
                  title="By Region"
                  icon={Globe}
                  labelKey="region"
                />
                <CoverageBreakdown
                  data={data.coverage.byEra}
                  title="By Era"
                  icon={Clock}
                  labelKey="era"
                />
                <CoverageBreakdown
                  data={data.coverage.byDomain}
                  title="By Domain"
                  icon={BookOpen}
                  labelKey="domain"
                />
              </div>
            </section>

            {/* Stability & Peer Comparison */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <StabilitySection stability={data.stability} />
              <PeerComparisonTable peers={data.comparison.peerModels} modelLabel={data.model.label} />
            </div>

            {/* Unique characteristics */}
            {data.comparison.uniqueCharacteristics.length > 0 && (
              <section className="bg-stone-50 dark:bg-slate-900/50 rounded-2xl border border-stone-200/70 dark:border-slate-700 p-6">
                <h3 className="text-sm font-semibold text-stone-700 dark:text-slate-300 mb-3">
                  Unique Characteristics
                </h3>
                <ul className="space-y-2">
                  {data.comparison.uniqueCharacteristics.map((char, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-stone-600 dark:text-slate-400">
                      <ArrowRight className="w-4 h-4 text-stone-400 flex-shrink-0 mt-0.5" />
                      {char}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {/* Exclusive figures */}
            {data.coverage.topExclusiveFigures.length > 0 && (
              <section className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200/70 dark:border-slate-700 p-5">
                <h3 className="font-semibold text-stone-900 dark:text-slate-100 mb-4">
                  Exclusive Discoveries
                </h3>
                <p className="text-sm text-stone-500 dark:text-slate-400 mb-4">
                  Figures only ranked by {data.model.label} (not found in other models&apos; top 500)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {data.coverage.topExclusiveFigures.slice(0, 12).map(fig => (
                    <Link
                      key={fig.id}
                      href={`/?figure=${fig.id}`}
                      className="px-3 py-2 bg-stone-50 dark:bg-slate-700/50 rounded-lg text-sm hover:bg-stone-100 dark:hover:bg-slate-700 transition-colors"
                    >
                      <div className="font-medium text-stone-800 dark:text-slate-200 truncate">
                        {fig.name}
                      </div>
                      <div className="text-xs text-stone-500 dark:text-slate-400">
                        Ranked #{fig.rank}
                      </div>
                    </Link>
                  ))}
                </div>
              </section>
            )}

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

export default function ModelBenchmarkPage() {
  return (
    <Suspense fallback={<ModelLoading />}>
      <ModelBenchmarkContent />
    </Suspense>
  );
}
