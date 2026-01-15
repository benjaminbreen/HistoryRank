'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp, TrendingUp, TrendingDown } from 'lucide-react';
import { Tooltip } from '@/components/ui/tooltip';

interface FigureReference {
  id: string;
  name: string;
  rank: number;
}

interface OutlierReference {
  id: string;
  name: string;
  diff: number;
  modelRank: number;
  consensusRank: number;
  direction: 'higher' | 'lower';
}

interface ModelStats {
  source: string;
  label: string;
  figureCount: number;
  sampleCount: number;
  avgRank: number;
  topPicks: FigureReference[];
  outliers: OutlierReference[];
  domainBias: Array<{ domain: string; avgRank: number; diff: number; figureCount: number }>;
  eraBias: Array<{ era: string; avgRank: number; diff: number; figureCount: number }>;
  consistency: number;
  consistencyRank: number;
  avgCorrelation: number;
  correlationRank: number;
  distinctiveTraits: string[];
}

interface ModelProfileCardProps {
  model: ModelStats;
  totalModels: number;
  onFigureClick: (id: string) => void;
}

// Figure thumbnail component
function FigureThumbnail({ id, name, size = 'sm' }: { id: string; name: string; size?: 'sm' | 'md' }) {
  const [imgSrc, setImgSrc] = useState(`/thumbnails/${id}.jpg`);
  const [failed, setFailed] = useState(false);

  const sizeClasses = size === 'sm' ? 'w-8 h-8' : 'w-10 h-10';

  if (failed) {
    return (
      <div className={`${sizeClasses} rounded-full bg-stone-200 dark:bg-slate-600 flex items-center justify-center flex-shrink-0`}>
        <span className="text-xs font-serif text-stone-500 dark:text-slate-400">
          {name.charAt(0)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={imgSrc}
      alt={name}
      className={`${sizeClasses} rounded-full object-cover flex-shrink-0 ring-2 ring-white dark:ring-slate-700`}
      onError={() => {
        if (imgSrc.endsWith('.jpg')) {
          setImgSrc(`/thumbnails/${id}.png`);
        } else if (imgSrc.endsWith('.png')) {
          setImgSrc(`/thumbnails/${id}.webp`);
        } else {
          setFailed(true);
        }
      }}
    />
  );
}

// Official brand colors and typography
// Sources:
// - Anthropic/Claude: https://beginswithai.com/claude-ai-logo-color-codes-fonts-downloadable-assets/
// - OpenAI/ChatGPT: https://brandcolorcode.com/chatgpt, https://klim.co.nz/collections/soehne/
// - Google/Gemini: https://design.google/library/google-sans-flex-font

const MODEL_BRANDS: Record<string, {
  border: string;
  hoverBorder: string;
  text: string;
  bar: string;
  fontFamily: string;
  darkText: string;
}> = {
  // Anthropic Claude - Terra cotta #d97757, serif typography (Styrene/Tiempos)
  'claude-opus-4.5': {
    border: 'border-[#d97757]/30',
    hoverBorder: 'hover:border-[#d97757]',
    text: 'text-[#d97757]',
    bar: 'bg-[#d97757]',
    fontFamily: 'font-serif', // Matches Claude's serif brand identity
    darkText: 'dark:text-[#e89a7d]',
  },
  'claude-sonnet-4.5': {
    border: 'border-[#d97757]/30',
    hoverBorder: 'hover:border-[#d97757]',
    text: 'text-[#d97757]',
    bar: 'bg-[#d97757]',
    fontFamily: 'font-serif',
    darkText: 'dark:text-[#e89a7d]',
  },
  // Google Gemini - Blue #4285F4 (Flash uses lighter, Pro uses standard)
  // Font: Google Sans / Product Sans style (rounded geometric sans)
  'gemini-flash-3-preview': {
    border: 'border-[#4285F4]/30',
    hoverBorder: 'hover:border-[#4285F4]',
    text: 'text-[#4285F4]',
    bar: 'bg-[#4285F4]',
    fontFamily: 'font-sans', // Google Sans is a clean geometric sans
    darkText: 'dark:text-[#8ab4f8]',
  },
  'gemini-pro-3': {
    border: 'border-[#4285F4]/30',
    hoverBorder: 'hover:border-[#4285F4]',
    text: 'text-[#4285F4]',
    bar: 'bg-[#4285F4]',
    fontFamily: 'font-sans',
    darkText: 'dark:text-[#8ab4f8]',
  },
  // OpenAI GPT - Teal/Green #10A37F, Font: Söhne (clean grotesque sans)
  'gpt-5.2-thinking': {
    border: 'border-[#10A37F]/30',
    hoverBorder: 'hover:border-[#10A37F]',
    text: 'text-[#10A37F]',
    bar: 'bg-[#10A37F]',
    fontFamily: 'font-sans', // Söhne is a modern grotesque sans-serif
    darkText: 'dark:text-[#19c37d]',
  },
  // DeepSeek - Blue #4F6EF7 (deep blue)
  'deepseek-v3.2': {
    border: 'border-[#4F6EF7]/30',
    hoverBorder: 'hover:border-[#4F6EF7]',
    text: 'text-[#4F6EF7]',
    bar: 'bg-[#4F6EF7]',
    fontFamily: 'font-sans',
    darkText: 'dark:text-[#7b93fa]',
  },
  // Qwen (Alibaba) - Orange #FF6A00
  'qwen3': {
    border: 'border-[#FF6A00]/30',
    hoverBorder: 'hover:border-[#FF6A00]',
    text: 'text-[#FF6A00]',
    bar: 'bg-[#FF6A00]',
    fontFamily: 'font-sans',
    darkText: 'dark:text-[#ff8533]',
  },
  // xAI Grok - soft gold #f59e0b
  'grok-4': {
    border: 'border-[#f59e0b]/30',
    hoverBorder: 'hover:border-[#f59e0b]',
    text: 'text-[#f59e0b]',
    bar: 'bg-[#f59e0b]',
    fontFamily: 'font-sans',
    darkText: 'dark:text-[#fbbf24]',
  },
  'grok-4.1-fast': {
    border: 'border-[#f59e0b]/30',
    hoverBorder: 'hover:border-[#f59e0b]',
    text: 'text-[#f59e0b]',
    bar: 'bg-[#f59e0b]',
    fontFamily: 'font-sans',
    darkText: 'dark:text-[#fbbf24]',
  },
};

export function ModelProfileCard({ model, totalModels, onFigureClick }: ModelProfileCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const brand = MODEL_BRANDS[model.source] || {
    border: 'border-stone-300/30',
    hoverBorder: 'hover:border-stone-400',
    text: 'text-stone-600',
    bar: 'bg-stone-500',
    fontFamily: 'font-sans',
    darkText: 'dark:text-slate-400',
  };

  // Get top 4 favored domains
  const topDomains = model.domainBias.filter(d => d.diff > 0).slice(0, 4);
  const maxDiff = Math.max(...model.domainBias.map(d => Math.abs(d.diff)), 1);

  return (
    <div className={`rounded-xl border-2 ${brand.border} ${brand.hoverBorder} bg-white dark:bg-slate-800 overflow-hidden transition-all hover:shadow-lg`}>
      {/* Header */}
      <div className="p-5">
        <div className="mb-3">
          <h3 className={`font-semibold text-xl ${brand.text} ${brand.darkText} ${brand.fontFamily}`}>
            {model.label}
          </h3>
          <div className="flex items-center gap-3 mt-1 text-sm text-stone-500 dark:text-slate-400">
            <span>{model.figureCount.toLocaleString()} figures</span>
            <span className="text-stone-300 dark:text-slate-600">|</span>
            <span>{model.sampleCount} samples</span>
          </div>
        </div>

        {/* Stats row - consistency and agreement */}
        <div className="flex gap-4 mb-4">
          <div className="flex-1 text-center p-2 rounded-lg bg-stone-50 dark:bg-slate-700/50">
            <div className="text-lg font-semibold text-stone-700 dark:text-slate-200">
              {Math.round(model.consistency * 100)}%
            </div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-slate-500">
              Consistency
            </div>
          </div>
          <div className="flex-1 text-center p-2 rounded-lg bg-stone-50 dark:bg-slate-700/50">
            <div className="text-lg font-semibold text-stone-700 dark:text-slate-200">
              {Math.round(model.avgCorrelation * 100)}%
            </div>
            <div className="text-[10px] uppercase tracking-wide text-stone-400 dark:text-slate-500">
              Agreement
            </div>
          </div>
        </div>

        {/* Distinctive trait (first one) */}
        {model.distinctiveTraits.length > 0 && (
          <p className="text-sm text-stone-600 dark:text-slate-300 leading-relaxed italic border-l-2 border-stone-200 dark:border-slate-600 pl-3">
            {model.distinctiveTraits[0]}
          </p>
        )}
      </div>

      {/* Domain Bias Bars */}
      <div className="px-5 pb-4">
        <div className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-slate-500 mb-2 font-medium">
          Domain Preferences
        </div>
        <div className="space-y-2">
          {topDomains.length > 0 ? topDomains.map((d) => (
            <div key={d.domain} className="flex items-center gap-2">
              <span className="text-xs text-stone-600 dark:text-slate-400 w-20 truncate" title={d.domain}>
                {d.domain}
              </span>
              <div className="flex-1 h-2 bg-stone-100 dark:bg-slate-600 rounded-full overflow-hidden">
                <div
                  className={`h-full ${brand.bar} rounded-full transition-all`}
                  style={{ width: `${Math.max(5, (d.diff / maxDiff) * 100)}%` }}
                />
              </div>
              <span className={`text-xs font-medium ${brand.text} ${brand.darkText} w-8 text-right`}>
                +{d.diff}
              </span>
            </div>
          )) : (
            <p className="text-xs text-stone-400 dark:text-slate-500 italic">No strong domain preferences</p>
          )}
        </div>
      </div>

      {/* Top Picks - show all 3 in a row */}
      {model.topPicks.length > 0 && (
        <div className="px-5 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-slate-500 mb-2 font-medium">
            Top Picks
          </div>
          <div className="flex gap-3">
            {model.topPicks.slice(0, 3).map((pick, i) => (
              <Tooltip
                key={pick.id}
                content={
                  <div>
                    <strong>{pick.name}</strong>
                    <br />
                    Ranked #{pick.rank}
                  </div>
                }
                align="center"
              >
                <button
                  onClick={() => onFigureClick(pick.id)}
                  className="flex flex-col items-center gap-1 group"
                >
                  <div className="relative">
                    <FigureThumbnail id={pick.id} name={pick.name} size="md" />
                    <div className={`absolute -top-1 -left-1 w-5 h-5 rounded-full ${brand.bar} text-white text-[10px] font-bold flex items-center justify-center shadow`}>
                      {i + 1}
                    </div>
                  </div>
                  <span className="text-[10px] text-stone-500 dark:text-slate-400 truncate max-w-[60px] group-hover:text-stone-700 dark:group-hover:text-slate-200">
                    {pick.name.split(' ').pop()}
                  </span>
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Outliers row - show up to 8 */}
      {model.outliers.length > 0 && (
        <div className="px-5 pb-4">
          <div className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-slate-500 mb-2 font-medium">
            Biggest Outliers
          </div>
          <div className="flex flex-wrap gap-2">
            {model.outliers.map((outlier) => (
              <Tooltip
                key={outlier.id}
                content={
                  <div>
                    <strong>{outlier.name}</strong>
                    <br />
                    Model: #{outlier.modelRank} | Consensus: #{outlier.consensusRank}
                    <br />
                    <span className={outlier.direction === 'higher' ? 'text-emerald-400' : 'text-amber-400'}>
                      {outlier.direction === 'higher' ? 'Ranks higher than others' : 'Ranks lower than others'}
                    </span>
                  </div>
                }
                align="center"
              >
                <button
                  onClick={() => onFigureClick(outlier.id)}
                  className="relative group"
                >
                  <FigureThumbnail id={outlier.id} name={outlier.name} />
                  <div className={`absolute -bottom-1 -right-1 px-1 py-0.5 rounded text-[9px] font-bold text-white ${
                    outlier.direction === 'higher' ? 'bg-emerald-500' : 'bg-amber-500'
                  }`}>
                    {outlier.direction === 'higher' ? (
                      <TrendingUp className="w-2.5 h-2.5" />
                    ) : (
                      <TrendingDown className="w-2.5 h-2.5" />
                    )}
                  </div>
                </button>
              </Tooltip>
            ))}
          </div>
        </div>
      )}

      {/* Expandable section */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className={`w-full px-5 py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors ${brand.text} ${brand.darkText} bg-stone-50 dark:bg-slate-700/30 hover:bg-stone-100 dark:hover:bg-slate-700/50`}
      >
        {isExpanded ? (
          <>
            Show less <ChevronUp className="w-4 h-4" />
          </>
        ) : (
          <>
            More details <ChevronDown className="w-4 h-4" />
          </>
        )}
      </button>

      {/* Expanded content */}
      {isExpanded && (
        <div className="px-5 pb-5 pt-2 bg-stone-50 dark:bg-slate-700/30 space-y-4">
          {/* All traits */}
          {model.distinctiveTraits.length > 1 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-slate-500 mb-2 font-medium">
                Insights
              </div>
              <ul className="space-y-1.5">
                {model.distinctiveTraits.slice(1).map((trait, i) => (
                  <li key={i} className="text-xs text-stone-600 dark:text-slate-400 leading-relaxed flex gap-2">
                    <span className="text-stone-300 dark:text-slate-600">-</span>
                    {trait}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Era preferences */}
          {model.eraBias.filter(e => e.diff > 0).length > 0 && (
            <div>
              <div className="text-[11px] uppercase tracking-wide text-stone-400 dark:text-slate-500 mb-2 font-medium">
                Era Preferences
              </div>
              <div className="flex flex-wrap gap-1.5">
                {model.eraBias.filter(e => e.diff > 0).slice(0, 4).map((e) => (
                  <span
                    key={e.era}
                    className="px-2 py-0.5 rounded-full text-xs bg-stone-100 dark:bg-slate-600 text-stone-600 dark:text-slate-300 border border-stone-200 dark:border-slate-500"
                  >
                    {e.era} <span className="opacity-70">+{e.diff}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Ranking info */}
          <div className="text-xs text-stone-500 dark:text-slate-400 pt-2 border-t border-stone-200 dark:border-slate-600">
            <p>Consistency rank: #{model.consistencyRank} of {totalModels}</p>
            <p>Agreement rank: #{model.correlationRank} of {totalModels}</p>
          </div>
        </div>
      )}
    </div>
  );
}
