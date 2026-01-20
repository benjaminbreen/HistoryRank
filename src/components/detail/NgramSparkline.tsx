'use client';

import { useMemo, useState } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';

type NgramData = {
  years: number[];
  values: number[];
};

type NgramSparklineProps = {
  data: NgramData;
  percentile?: number | null;
};

export function NgramSparkline({ data, percentile }: NgramSparklineProps) {
  const [isHovered, setIsHovered] = useState(false);

  const chartData = useMemo(() => {
    if (!data?.years || !data?.values) return [];
    return data.years.map((year, i) => ({
      year,
      value: data.values[i],
      // Format for display (parts per million of all words)
      displayValue: data.values[i] * 1000000,
    }));
  }, [data]);

  const { maxValue, minValue, avgValue } = useMemo(() => {
    if (!chartData.length) return { maxValue: 0, minValue: 0, avgValue: 0 };
    const values = chartData.map(d => d.displayValue);
    return {
      maxValue: Math.max(...values),
      minValue: Math.min(...values),
      avgValue: values.reduce((a, b) => a + b, 0) / values.length,
    };
  }, [chartData]);

  // Find peak year
  const peakYear = useMemo(() => {
    if (!chartData.length) return null;
    const maxIdx = chartData.reduce((maxI, d, i, arr) =>
      d.displayValue > arr[maxI].displayValue ? i : maxI, 0);
    return chartData[maxIdx].year;
  }, [chartData]);

  if (!chartData.length) {
    return null;
  }

  // Calculate trend based on recent trajectory (last ~10 years)
  const trendInfo = useMemo(() => {
    if (chartData.length < 10) return { direction: 'stable' as const, score: 0 };

    // Find peak
    const peakIdx = chartData.reduce((maxI, d, i, arr) =>
      d.displayValue > arr[maxI].displayValue ? i : maxI, 0);
    const peakValue = chartData[peakIdx].displayValue;

    // Use small window: last 5 points (~2008-2018) vs previous 5 points (~1998-2008)
    const veryRecent = chartData.slice(-5);
    const justBefore = chartData.slice(-10, -5);
    const veryRecentAvg = veryRecent.reduce((s, d) => s + d.displayValue, 0) / veryRecent.length;
    const justBeforeAvg = justBefore.reduce((s, d) => s + d.displayValue, 0) / justBefore.length;

    // Calculate recent trajectory
    let trendScore = 0;
    if (justBeforeAvg > 0.001) {
      trendScore = ((veryRecentAvg - justBeforeAvg) / justBeforeAvg) * 100;
    }

    // Also compare current level to peak - if we're way below peak, that's significant
    const currentVsPeak = peakValue > 0.001 ? veryRecentAvg / peakValue : 1;

    // If current is less than 50% of peak, bias toward declining
    if (currentVsPeak < 0.5 && trendScore > -15) {
      // We're well below our peak - show declining even if recent trend is flat
      trendScore = Math.min(trendScore, -20);
    }

    // If current is less than 30% of peak, that's plummeting
    if (currentVsPeak < 0.3) {
      trendScore = Math.min(trendScore, -55);
    }

    // Classify into 5 categories
    let direction: 'skyrocketing' | 'rising' | 'stable' | 'declining' | 'plummeting';
    if (trendScore >= 50) direction = 'skyrocketing';
    else if (trendScore >= 15) direction = 'rising';
    else if (trendScore >= -15) direction = 'stable';
    else if (trendScore >= -50) direction = 'declining';
    else direction = 'plummeting';

    return { direction, score: trendScore };
  }, [chartData]);

  const trendDirection = trendInfo.direction;

  return (
    <div
      className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-stone-400 dark:text-slate-500 font-medium">
            Book Mentions (1920–2018)
          </span>
          <span className="text-[10px] text-stone-300 dark:text-slate-600">Google Ngrams</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {peakYear && (
            <span className="text-stone-400 dark:text-slate-500">
              Peak: <span className="font-medium text-stone-600 dark:text-slate-300">{peakYear}</span>
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded ${
            trendDirection === 'skyrocketing'
              ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 font-medium'
              : trendDirection === 'rising'
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
              : trendDirection === 'declining'
              ? 'bg-amber-50 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400'
              : trendDirection === 'plummeting'
              ? 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium'
              : 'bg-stone-50 dark:bg-slate-700 text-stone-500 dark:text-slate-400'
          }`}>
            {trendDirection === 'skyrocketing' ? '🚀 Surging'
              : trendDirection === 'rising' ? '↑ Rising'
              : trendDirection === 'declining' ? '↓ Declining'
              : trendDirection === 'plummeting' ? '📉 Fading'
              : '→ Stable'}
          </span>
        </div>
      </div>

      <div className="h-[120px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="ngramGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#d97706" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#d97706" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fill: '#a8a29e' }}
              tickLine={false}
              axisLine={{ stroke: '#e7e5e4' }}
              ticks={[1920, 1940, 1960, 1980, 2000, 2018]}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#a8a29e' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => value >= 1 ? value.toFixed(0) : value.toFixed(1)}
              width={35}
              domain={[0, 'auto']}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-stone-900 text-white px-3 py-2 rounded-lg shadow-lg text-xs">
                    <div className="font-medium">{d.year}</div>
                    <div className="text-stone-300 mt-0.5">
                      {d.displayValue.toFixed(2)} per million words
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={avgValue}
              stroke="#d4d4d4"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="displayValue"
              stroke="#d97706"
              strokeWidth={isHovered ? 2 : 1.5}
              fill="url(#ngramGradient)"
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 pt-2 border-t border-stone-100 dark:border-slate-700 flex items-center justify-between text-[10px] text-stone-400 dark:text-slate-500">
        <span>Frequency in English books (smoothed)</span>
        {percentile !== null && percentile !== undefined && (
          <span className="font-medium text-stone-500 dark:text-slate-400">
            Top {100 - percentile}% of figures
          </span>
        )}
      </div>
    </div>
  );
}
