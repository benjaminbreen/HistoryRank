'use client';

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { AlertTriangle, CheckCircle, Info, TrendingUp, Users, Layers, Target } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';

interface CoverageDistribution {
  modelCount: number;
  figureCount: number;
  percentage: number;
}

interface ModelReach {
  source: string;
  label: string;
  uniqueFigures: number;
  uniqueOnlyFigures: number;
  totalRankings: number;
  listCount: number;
}

interface ConsensusByTier {
  tier: string;
  rankRange: string;
  figureCount: number;
  avgModelCoverage: number;
  avgVariance: number;
  highCoveragePercent: number;
}

interface VarianceDistribution {
  bucket: string;
  count: number;
  percentage: number;
}

interface KeyFinding {
  type: 'warning' | 'success' | 'info';
  title: string;
  description: string;
  metric?: string;
}

interface InsightsData {
  totalFigures: number;
  totalRankings: number;
  totalModels: number;
  totalLists: number;
  fullCoverageFigures: number;
  avgModelCoverage: number;
  coverageDistribution: CoverageDistribution[];
  modelReach: ModelReach[];
  consensusByTier: ConsensusByTier[];
  varianceDistribution: VarianceDistribution[];
  keyFindings: KeyFinding[];
}

interface InsightsPanelProps {
  data: InsightsData;
}

// Color palette for coverage distribution
const COVERAGE_COLORS = [
  '#059669', // 11 - emerald
  '#10b981', // 10
  '#34d399', // 9
  '#6ee7b7', // 8
  '#a7f3d0', // 7
  '#fcd34d', // 6 - amber
  '#fbbf24', // 5
  '#f59e0b', // 4
  '#f97316', // 3 - orange
  '#ef4444', // 2 - red
  '#dc2626', // 1
];

// Model brand colors
const MODEL_COLORS: Record<string, string> = {
  'claude-opus-4.5': '#da7756',
  'claude-sonnet-4.5': '#da7756',
  'gemini-flash-3-preview': '#078EFA',
  'gemini-pro-3': '#4285F4',
  'gpt-5.2-thinking': '#10A37F',
  'deepseek-v3.2': '#4D6BFE',
  'qwen3-235b-a22b': '#615EFF',
  'grok-4': '#1a1a1a',
  'grok-4.1-fast': '#374151',
  'mistral-large-3': '#FF8205',
  'glm-4.7': '#2563eb',
};

function StatCard({
  icon: Icon,
  label,
  value,
  subtext,
  color = 'stone',
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  subtext?: string;
  color?: string;
}) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-4">
      <div className="flex items-center gap-3">
        <div className={`p-2 rounded-lg bg-${color}-100 dark:bg-${color}-900/30`}>
          <Icon className={`w-5 h-5 text-${color}-600 dark:text-${color}-400`} />
        </div>
        <div>
          <div className="text-2xl font-bold text-stone-900 dark:text-amber-100">
            {typeof value === 'number' ? value.toLocaleString() : value}
          </div>
          <div className="text-xs text-stone-500 dark:text-slate-400">{label}</div>
          {subtext && (
            <div className="text-[10px] text-stone-400 dark:text-slate-500 mt-0.5">{subtext}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function FindingCard({ finding }: { finding: KeyFinding }) {
  const icons = {
    warning: AlertTriangle,
    success: CheckCircle,
    info: Info,
  };
  const colors = {
    warning: 'amber',
    success: 'emerald',
    info: 'blue',
  };

  const Icon = icons[finding.type];
  const color = colors[finding.type];

  return (
    <div
      className={`rounded-xl border p-4 bg-${color}-50/50 border-${color}-200 dark:bg-${color}-900/20 dark:border-${color}-800/50`}
    >
      <div className="flex gap-3">
        <Icon className={`w-5 h-5 flex-shrink-0 mt-0.5 text-${color}-600 dark:text-${color}-400`} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className={`font-medium text-${color}-900 dark:text-${color}-100`}>
              {finding.title}
            </h4>
            {finding.metric && (
              <span className={`text-xs font-mono px-2 py-0.5 rounded-full bg-${color}-100 dark:bg-${color}-900/50 text-${color}-700 dark:text-${color}-300`}>
                {finding.metric}
              </span>
            )}
          </div>
          <p className={`text-sm mt-1 text-${color}-700 dark:text-${color}-300`}>
            {finding.description}
          </p>
        </div>
      </div>
    </div>
  );
}

export function InsightsPanel({ data }: InsightsPanelProps) {
  // Prepare coverage data for pie chart
  const coveragePieData = useMemo(() => {
    // Group into meaningful buckets
    const fullCoverage = data.coverageDistribution.find(d => d.modelCount === data.totalModels)?.figureCount || 0;
    const highCoverage = data.coverageDistribution
      .filter(d => d.modelCount >= 8 && d.modelCount < data.totalModels)
      .reduce((sum, d) => sum + d.figureCount, 0);
    const mediumCoverage = data.coverageDistribution
      .filter(d => d.modelCount >= 4 && d.modelCount < 8)
      .reduce((sum, d) => sum + d.figureCount, 0);
    const lowCoverage = data.coverageDistribution
      .filter(d => d.modelCount < 4)
      .reduce((sum, d) => sum + d.figureCount, 0);

    return [
      { name: `Full (${data.totalModels})`, value: fullCoverage, color: '#059669' },
      { name: 'High (8-10)', value: highCoverage, color: '#34d399' },
      { name: 'Medium (4-7)', value: mediumCoverage, color: '#fbbf24' },
      { name: 'Low (1-3)', value: lowCoverage, color: '#ef4444' },
    ].filter(d => d.value > 0);
  }, [data]);

  // Prepare model reach data for bar chart
  const modelReachData = useMemo(() => {
    return data.modelReach.map(m => ({
      name: m.label.replace(' 4.5', '').replace(' 3', '').replace(' v3.2', '').replace(' 235B', ''),
      uniqueFigures: m.uniqueFigures,
      uniqueOnly: m.uniqueOnlyFigures,
      color: MODEL_COLORS[m.source] || '#6b7280',
    }));
  }, [data.modelReach]);

  // Prepare consensus tier data
  const tierData = useMemo(() => {
    return data.consensusByTier.map(t => ({
      tier: t.tier,
      coverage: t.avgModelCoverage,
      reliability: Math.round((1 - t.avgVariance) * 100),
      highCoverage: t.highCoveragePercent,
    }));
  }, [data.consensusByTier]);

  return (
    <div className="space-y-8">
      {/* Hero Stats */}
      <section>
        <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100 mb-4">
          System Overview
        </h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Users}
            label="Historical Figures"
            value={data.totalFigures}
            color="stone"
          />
          <StatCard
            icon={Layers}
            label="AI Models"
            value={data.totalModels}
            subtext={`${data.totalLists} total lists`}
            color="stone"
          />
          <StatCard
            icon={Target}
            label="Full Consensus"
            value={data.fullCoverageFigures}
            subtext={`${Math.round((data.fullCoverageFigures / data.totalFigures) * 100)}% of figures`}
            color="emerald"
          />
          <StatCard
            icon={TrendingUp}
            label="Avg Coverage"
            value={`${data.avgModelCoverage} models`}
            subtext="per figure"
            color="blue"
          />
        </div>
      </section>

      {/* Key Findings */}
      {data.keyFindings.length > 0 && (
        <section>
          <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100 mb-4">
            Key Findings
          </h2>
          <div className="grid gap-3 md:grid-cols-2">
            {data.keyFindings.map((finding, i) => (
              <FindingCard key={i} finding={finding} />
            ))}
          </div>
        </section>
      )}

      {/* Coverage Distribution */}
      <section className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
            Model Coverage Distribution
          </h2>
          <Tooltip
            content="How many AI models rank each figure. Higher coverage = more reliable consensus."
            align="left"
          >
            <Info className="w-4 h-4 text-stone-400 cursor-help" />
          </Tooltip>
        </div>
        <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
          Figures ranked by more models have more reliable consensus rankings
        </p>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Pie Chart */}
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={coveragePieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={2}
                  dataKey="value"
                  label={({ name, percent }) => `${name}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {coveragePieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <RechartsTooltip
                  content={({ payload }) => {
                    if (!payload?.[0]) return null;
                    const d = payload[0].payload;
                    return (
                      <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-lg">
                        <div className="font-medium">{d.name} models</div>
                        <div className="text-sm text-stone-500">{d.value.toLocaleString()} figures</div>
                      </div>
                    );
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Detailed breakdown */}
          <div className="space-y-2">
            {data.coverageDistribution.slice(0, 8).map((d, i) => (
              <div key={d.modelCount} className="flex items-center gap-3">
                <span className="w-20 text-sm text-stone-600 dark:text-slate-400 text-right">
                  {d.modelCount} model{d.modelCount !== 1 ? 's' : ''}
                </span>
                <div className="flex-1 h-5 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${d.percentage}%`,
                      backgroundColor: COVERAGE_COLORS[data.totalModels - d.modelCount] || '#6b7280',
                    }}
                  />
                </div>
                <span className="w-16 text-sm font-mono text-stone-500 dark:text-slate-400">
                  {d.figureCount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Model Reach Comparison */}
      <section className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
            Model Reach Comparison
          </h2>
          <Tooltip
            content="Unique figures ranked by each model. Highlighted portion shows figures only that model ranks."
            align="left"
          >
            <Info className="w-4 h-4 text-stone-400 cursor-help" />
          </Tooltip>
        </div>
        <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
          Some models discover figures others miss entirely
        </p>

        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={modelReachData}
              layout="vertical"
              margin={{ top: 5, right: 30, left: 100, bottom: 5 }}
            >
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis dataKey="name" type="category" tick={{ fontSize: 11 }} width={95} />
              <RechartsTooltip
                content={({ payload }) => {
                  if (!payload?.[0]) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white dark:bg-slate-800 border border-stone-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-lg">
                      <div className="font-medium">{d.name}</div>
                      <div className="text-sm text-stone-600 dark:text-slate-300">
                        {d.uniqueFigures.toLocaleString()} unique figures
                      </div>
                      <div className="text-xs text-stone-500 dark:text-slate-400">
                        {d.uniqueOnly.toLocaleString()} exclusive (no other model)
                      </div>
                    </div>
                  );
                }}
              />
              <Bar dataKey="uniqueFigures" radius={[0, 4, 4, 0]}>
                {modelReachData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Legend for unique-only */}
        <div className="mt-4 pt-4 border-t border-stone-200 dark:border-slate-700">
          <div className="flex flex-wrap gap-4 text-xs text-stone-500 dark:text-slate-400">
            {data.modelReach.slice(0, 5).map(m => (
              <span key={m.source}>
                <span className="font-medium text-stone-700 dark:text-slate-300">
                  {m.label.split(' ')[0]}
                </span>
                : {m.uniqueOnlyFigures} exclusive
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* Consensus by Rank Tier */}
      <section className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
            Consensus Strength by Rank Tier
          </h2>
          <Tooltip
            content="Shows how reliable consensus is at different ranking levels. Top figures have better agreement."
            align="left"
          >
            <Info className="w-4 h-4 text-stone-400 cursor-help" />
          </Tooltip>
        </div>
        <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
          Rankings are most reliable at the top and become less certain further down
        </p>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-200 dark:border-slate-700">
                <th className="text-left py-3 px-4 font-medium text-stone-600 dark:text-slate-400">Tier</th>
                <th className="text-right py-3 px-4 font-medium text-stone-600 dark:text-slate-400">Figures</th>
                <th className="text-right py-3 px-4 font-medium text-stone-600 dark:text-slate-400">Avg Models</th>
                <th className="text-right py-3 px-4 font-medium text-stone-600 dark:text-slate-400">High Coverage</th>
                <th className="text-left py-3 px-4 font-medium text-stone-600 dark:text-slate-400">Reliability</th>
              </tr>
            </thead>
            <tbody>
              {data.consensusByTier.map((tier, i) => {
                const reliabilityColor =
                  tier.highCoveragePercent >= 80 ? 'emerald' :
                  tier.highCoveragePercent >= 50 ? 'amber' : 'red';
                return (
                  <tr key={tier.tier} className="border-b border-stone-100 dark:border-slate-700/50">
                    <td className="py-3 px-4 font-medium text-stone-900 dark:text-slate-100">
                      {tier.tier}
                      <span className="ml-2 text-xs text-stone-400 dark:text-slate-500">
                        {tier.rankRange}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right text-stone-600 dark:text-slate-300">
                      {tier.figureCount.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-stone-600 dark:text-slate-300">
                      {tier.avgModelCoverage}
                    </td>
                    <td className="py-3 px-4 text-right font-mono text-stone-600 dark:text-slate-300">
                      {tier.highCoveragePercent}%
                    </td>
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full bg-${reliabilityColor}-500`}
                            style={{ width: `${tier.highCoveragePercent}%` }}
                          />
                        </div>
                        <span className={`text-xs text-${reliabilityColor}-600 dark:text-${reliabilityColor}-400`}>
                          {tier.highCoveragePercent >= 80 ? 'Strong' :
                           tier.highCoveragePercent >= 50 ? 'Moderate' : 'Weak'}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Variance Distribution */}
      <section className="bg-white dark:bg-slate-800 rounded-xl border border-stone-200 dark:border-slate-700 p-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold text-stone-900 dark:text-amber-100">
            Model Agreement Distribution
          </h2>
          <Tooltip
            content="Variance score measures how much models disagree. Lower variance = stronger consensus."
            align="left"
          >
            <Info className="w-4 h-4 text-stone-400 cursor-help" />
          </Tooltip>
        </div>
        <p className="text-sm text-stone-500 dark:text-slate-400 mb-6">
          How consistently do models agree on figure rankings?
        </p>

        <div className="space-y-3">
          {data.varianceDistribution.map((v, i) => {
            const colors = ['#059669', '#10b981', '#fbbf24', '#f97316', '#ef4444'];
            return (
              <div key={v.bucket} className="flex items-center gap-3">
                <span className="w-32 text-sm text-stone-600 dark:text-slate-400">
                  {v.bucket.split(' ')[0]}
                </span>
                <span className="w-20 text-xs text-stone-400 dark:text-slate-500">
                  {v.bucket.match(/\(([^)]+)\)/)?.[1]}
                </span>
                <div className="flex-1 h-6 bg-stone-100 dark:bg-slate-700 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all flex items-center justify-end pr-2"
                    style={{
                      width: `${Math.max(v.percentage, 5)}%`,
                      backgroundColor: colors[i],
                    }}
                  >
                    {v.percentage >= 10 && (
                      <span className="text-xs font-medium text-white">{v.percentage}%</span>
                    )}
                  </div>
                </div>
                <span className="w-16 text-sm font-mono text-stone-500 dark:text-slate-400 text-right">
                  {v.count.toLocaleString()}
                </span>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
