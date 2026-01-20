'use client';

import { useMemo, useState, useEffect } from 'react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Skeleton } from '@/components/ui/skeleton';

type PageviewsSparklineProps = {
  wikipediaSlug: string | null;
  figureName: string;
};

type YearlyPageviews = {
  [year: string]: number;
};

type PageviewsResponse = {
  yearlyViews: YearlyPageviews | null;
  trend: string;
  peakYear: number | null;
  error?: string;
};

function formatViews(views: number): string {
  if (views >= 1000000) return `${(views / 1000000).toFixed(1)}M`;
  if (views >= 1000) return `${(views / 1000).toFixed(0)}K`;
  return views.toString();
}

export function PageviewsSparkline({ wikipediaSlug, figureName }: PageviewsSparklineProps) {
  const [data, setData] = useState<PageviewsResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);

  useEffect(() => {
    if (!wikipediaSlug) return;

    const fetchData = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/wikipedia/pageviews-history/${encodeURIComponent(wikipediaSlug)}`);
        if (!res.ok) {
          setData(null);
          return;
        }
        const result = await res.json();
        setData(result);
      } catch (error) {
        console.error('Failed to fetch pageview history:', error);
        setData(null);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [wikipediaSlug]);

  const chartData = useMemo(() => {
    if (!data?.yearlyViews) return [];
    return Object.entries(data.yearlyViews)
      .map(([year, views]) => ({
        year: parseInt(year),
        views,
      }))
      .filter(d => d.year >= 2016 && d.year <= new Date().getFullYear())
      .sort((a, b) => a.year - b.year);
  }, [data]);

  const { maxViews, avgViews } = useMemo(() => {
    if (!chartData.length) return { maxViews: 0, avgViews: 0 };
    const views = chartData.map(d => d.views);
    return {
      maxViews: Math.max(...views),
      avgViews: views.reduce((a, b) => a + b, 0) / views.length,
    };
  }, [chartData]);

  if (!wikipediaSlug) return null;

  if (loading) {
    return (
      <div className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700">
        <Skeleton className="h-4 w-48 mb-3" />
        <Skeleton className="h-[100px] w-full" />
      </div>
    );
  }

  if (!data?.yearlyViews || chartData.length < 3) {
    return null;
  }

  const trendDirection = data.trend;

  return (
    <div
      className="p-4 rounded-xl bg-white dark:bg-slate-800 shadow-sm ring-1 ring-stone-900/5 dark:ring-slate-700"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-wide text-stone-400 dark:text-slate-500 font-medium">
            Wikipedia Traffic (2016–{new Date().getFullYear()})
          </span>
          <span className="text-[10px] text-stone-300 dark:text-slate-600">English</span>
        </div>
        <div className="flex items-center gap-2 text-[10px]">
          {data.peakYear && (
            <span className="text-stone-400 dark:text-slate-500">
              Peak: <span className="font-medium text-stone-600 dark:text-slate-300">{data.peakYear}</span>
            </span>
          )}
          <span className={`px-1.5 py-0.5 rounded ${
            trendDirection === 'rising'
              ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
              : trendDirection === 'declining'
              ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
              : 'bg-stone-50 dark:bg-slate-700 text-stone-500 dark:text-slate-400'
          }`}>
            {trendDirection === 'rising' ? '↑ Rising' : trendDirection === 'declining' ? '↓ Declining' : '→ Stable'}
          </span>
        </div>
      </div>

      <div className="h-[100px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={chartData}
            margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
          >
            <defs>
              <linearGradient id="pageviewsGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="year"
              tick={{ fontSize: 10, fill: '#a8a29e' }}
              tickLine={false}
              axisLine={{ stroke: '#e7e5e4' }}
              tickFormatter={(year) => `'${String(year).slice(2)}`}
            />
            <YAxis
              tick={{ fontSize: 9, fill: '#a8a29e' }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => formatViews(value)}
              width={40}
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
                      {formatViews(d.views)} pageviews
                    </div>
                  </div>
                );
              }}
            />
            <ReferenceLine
              y={avgViews}
              stroke="#d4d4d4"
              strokeDasharray="3 3"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="views"
              stroke="#3b82f6"
              strokeWidth={isHovered ? 2 : 1.5}
              fill="url(#pageviewsGradient)"
              animationDuration={300}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 pt-2 border-t border-stone-100 dark:border-slate-700 flex items-center justify-between text-[10px] text-stone-400 dark:text-slate-500">
        <span>Annual English Wikipedia pageviews</span>
        <span className="text-stone-300 dark:text-slate-600">— avg</span>
      </div>
    </div>
  );
}
