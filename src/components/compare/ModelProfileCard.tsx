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
      loading="lazy"
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
//   Primary: #da7756 (terra cotta), Font: Copernicus/Tiempos (serif) → Source Serif 4
// - OpenAI/ChatGPT: https://brandcolorcode.com/chatgpt
//   Primary: #10A37F (teal green), Font: Söhne (grotesque sans) → Inter
// - Google/Gemini: https://brandarchive.xyz/identity/gemini-google-2025
//   Primary: #4285F4 (Google Blue), #078EFA (Gemini Blue), Font: Google Sans → Poppins
// - DeepSeek: https://1000logos.net/deepseek-logo/
//   Primary: #4D6BFE (bright blue), Font: geometric sans → Inter
// - Qwen/Alibaba: Purple-violet branding
//   Primary: #615EFF (indigo/violet), Font: sans-serif → Inter
// - xAI/Grok: https://x.ai/legal/brand-guidelines
//   Primary: Black/white, Font: bold contemporary sans → Inter 600
// - Mistral AI: https://mistral.ai/brand
//   Rainbow gradient from #E10500 to #FFD800, primary #FF8205, Font: Arial

const MODEL_BRANDS: Record<string, {
  border: string;
  hoverBorder: string;
  text: string;
  bar: string;
  fontClass: string;
  darkText: string;
  icon: string;
  iconColor?: string; // Optional color version
}> = {
  // Anthropic Claude - Terra cotta #da7756, serif typography (Copernicus/Tiempos)
  'claude-opus-4.5': {
    border: 'border-[#da7756]/30',
    hoverBorder: 'hover:border-[#da7756]',
    text: 'text-[#da7756]',
    bar: 'bg-[#da7756]',
    fontClass: 'font-claude', // Source Serif 4 (similar to Copernicus)
    darkText: 'dark:text-[#e89a7d]',
    icon: '/icons/models/claude.svg',
    iconColor: '/icons/models/claude-color.svg',
  },
  'claude-sonnet-4.5': {
    border: 'border-[#da7756]/30',
    hoverBorder: 'hover:border-[#da7756]',
    text: 'text-[#da7756]',
    bar: 'bg-[#da7756]',
    fontClass: 'font-claude',
    darkText: 'dark:text-[#e89a7d]',
    icon: '/icons/models/claude.svg',
    iconColor: '/icons/models/claude-color.svg',
  },
  // Google Gemini - Blue #4285F4 (Google Blue) / #078EFA (Gemini specific)
  // Font: Google Sans (rounded geometric sans) → Poppins
  'gemini-flash-3-preview': {
    border: 'border-[#078EFA]/30',
    hoverBorder: 'hover:border-[#078EFA]',
    text: 'text-[#078EFA]',
    bar: 'bg-[#078EFA]',
    fontClass: 'font-gemini', // Poppins (similar to Google Sans)
    darkText: 'dark:text-[#8ab4f8]',
    icon: '/icons/models/gemini.svg',
  },
  'gemini-pro-3': {
    border: 'border-[#4285F4]/30',
    hoverBorder: 'hover:border-[#4285F4]',
    text: 'text-[#4285F4]',
    bar: 'bg-[#4285F4]',
    fontClass: 'font-gemini',
    darkText: 'dark:text-[#8ab4f8]',
    icon: '/icons/models/gemini.svg',
  },
  // OpenAI GPT - Teal/Green #10A37F, Font: Söhne (clean grotesque sans) → Inter
  'gpt-5.2-thinking': {
    border: 'border-[#10A37F]/30',
    hoverBorder: 'hover:border-[#10A37F]',
    text: 'text-[#10A37F]',
    bar: 'bg-[#10A37F]',
    fontClass: 'font-openai', // Inter (similar to Söhne)
    darkText: 'dark:text-[#19c37d]',
    icon: '/icons/models/openai.svg',
  },
  // DeepSeek - Blue #4D6BFE (official bright blue whale logo)
  'deepseek-v3.2': {
    border: 'border-[#4D6BFE]/30',
    hoverBorder: 'hover:border-[#4D6BFE]',
    text: 'text-[#4D6BFE]',
    bar: 'bg-[#4D6BFE]',
    fontClass: 'font-deepseek', // Inter (rounded geometric)
    darkText: 'dark:text-[#7b93fa]',
    icon: '/icons/models/deepseek.svg',
    iconColor: '/icons/models/deepseek-color.svg',
  },
  // Qwen (Alibaba) - Purple/Violet #615EFF (based on logo)
  'qwen3-235b-a22b': {
    border: 'border-[#615EFF]/30',
    hoverBorder: 'hover:border-[#615EFF]',
    text: 'text-[#615EFF]',
    bar: 'bg-[#615EFF]',
    fontClass: 'font-qwen',
    darkText: 'dark:text-[#8b88ff]',
    icon: '/icons/models/qwen.svg',
    iconColor: '/icons/models/qwen-color.svg',
  },
  // GLM (Zhipu AI) - Blue brand color
  'glm-4.7': {
    border: 'border-[#2563eb]/30',
    hoverBorder: 'hover:border-[#2563eb]',
    text: 'text-[#2563eb]',
    bar: 'bg-[#2563eb]',
    fontClass: 'font-sans',
    darkText: 'dark:text-[#60a5fa]',
    icon: '/icons/models/glm.svg',
  },
  // xAI Grok - Official is black/white, using dark slate for visibility
  // 2025 logo features black hole imagery, bold contemporary typography
  'grok-4': {
    border: 'border-[#1a1a1a]/40',
    hoverBorder: 'hover:border-[#1a1a1a]',
    text: 'text-[#1a1a1a]',
    bar: 'bg-[#1a1a1a]',
    fontClass: 'font-grok', // Inter 600 weight (bold contemporary)
    darkText: 'dark:text-[#e5e5e5]',
    icon: '/icons/models/grok.svg',
  },
  'grok-4.1-fast': {
    border: 'border-[#1a1a1a]/40',
    hoverBorder: 'hover:border-[#1a1a1a]',
    text: 'text-[#1a1a1a]',
    bar: 'bg-[#1a1a1a]',
    fontClass: 'font-grok',
    darkText: 'dark:text-[#e5e5e5]',
    icon: '/icons/models/grok.svg',
  },
  // Mistral AI - Official orange #FF8205 from brand page rainbow gradient
  // Font: Arial ("universal appeal and captivating simplicity")
  'mistral-large-3': {
    border: 'border-[#FF8205]/30',
    hoverBorder: 'hover:border-[#FF8205]',
    text: 'text-[#FF8205]',
    bar: 'bg-[#FF8205]',
    fontClass: 'font-mistral', // Arial
    darkText: 'dark:text-[#ffab4d]',
    icon: '/icons/models/mistral.svg',
    iconColor: '/icons/models/mistral-color.svg',
  },
};

export function ModelProfileCard({ model, totalModels, onFigureClick }: ModelProfileCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const brand = MODEL_BRANDS[model.source] || {
    border: 'border-stone-300/30',
    hoverBorder: 'hover:border-stone-400',
    text: 'text-stone-600',
    bar: 'bg-stone-500',
    fontClass: 'font-sans',
    darkText: 'dark:text-slate-400',
    icon: '',
  };

  // Get top 4 favored domains
  const topDomains = model.domainBias.filter(d => d.diff > 0).slice(0, 4);
  const maxDiff = Math.max(...model.domainBias.map(d => Math.abs(d.diff)), 1);

  return (
    <div className={`rounded-xl border-2 ${brand.border} ${brand.hoverBorder} bg-white dark:bg-slate-800 overflow-hidden transition-all hover:shadow-lg`}>
      {/* Header */}
      <div className="p-5">
        <div className="mb-3">
          <div className="flex items-center gap-3">
            {brand.icon && (
              <div className="flex-shrink-0 w-10 h-10 rounded-xl bg-stone-50 dark:bg-slate-700/50 flex items-center justify-center p-2 ring-1 ring-stone-200/50 dark:ring-slate-600/50">
                <img
                  src={brand.iconColor || brand.icon}
                  alt={model.label}
                  className="w-full h-full object-contain"
                />
              </div>
            )}
            <div>
              <h3 className={`font-semibold text-xl ${brand.text} ${brand.darkText} ${brand.fontClass}`}>
                {model.label}
              </h3>
              <div className="flex items-center gap-3 mt-0.5 text-sm text-stone-500 dark:text-slate-400">
                <span>{model.figureCount.toLocaleString()} figures</span>
                <span className="text-stone-300 dark:text-slate-600">|</span>
                <span>{model.sampleCount} samples</span>
              </div>
            </div>
          </div>
        </div>

        {/* Stats row - consistency and agreement */}
        <div className="flex gap-4 mb-4">
          <Tooltip
            content={
              <div className="max-w-[200px]">
                <strong>Internal Consistency</strong>
                <p className="mt-1">
                  How similarly this model ranks figures across its different samples. Higher = more stable rankings between runs.
                </p>
              </div>
            }
            align="center"
          >
            <div className="flex-1 text-center p-2 rounded-lg bg-stone-50 dark:bg-slate-700/50 cursor-help">
              <div className="text-lg font-semibold text-stone-700 dark:text-slate-200">
                {Math.round(model.consistency * 100)}%
              </div>
              <div className="text-[11px] sm:text-[10px] uppercase tracking-wide text-stone-400 dark:text-slate-500">
                Consistency
              </div>
            </div>
          </Tooltip>
          <Tooltip
            content={
              <div className="max-w-[200px]">
                <strong>Cross-Model Agreement</strong>
                <p className="mt-1">
                  Average correlation with all other models. Higher = this model's rankings align more closely with the consensus.
                </p>
              </div>
            }
            align="center"
          >
            <div className="flex-1 text-center p-2 rounded-lg bg-stone-50 dark:bg-slate-700/50 cursor-help">
              <div className="text-lg font-semibold text-stone-700 dark:text-slate-200">
                {Math.round(model.avgCorrelation * 100)}%
              </div>
              <div className="text-[11px] sm:text-[10px] uppercase tracking-wide text-stone-400 dark:text-slate-500">
                Agreement
              </div>
            </div>
          </Tooltip>
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
                    <div className={`absolute -top-1 -left-1 w-5 h-5 rounded-full ${brand.bar} text-white text-[11px] sm:text-[10px] font-bold flex items-center justify-center shadow`}>
                      {i + 1}
                    </div>
                  </div>
                  <span className="text-[11px] sm:text-[10px] text-stone-500 dark:text-slate-400 truncate max-w-[60px] group-hover:text-stone-700 dark:group-hover:text-slate-200">
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
        className={`w-full px-5 py-4 sm:py-3 flex items-center justify-center gap-2 text-sm font-medium transition-colors active:bg-stone-100 dark:active:bg-slate-700/50 ${brand.text} ${brand.darkText} bg-stone-50 dark:bg-slate-700/30 hover:bg-stone-100 dark:hover:bg-slate-700/50`}
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
