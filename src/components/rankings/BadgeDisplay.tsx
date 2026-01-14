'use client';

import { cn } from '@/lib/utils';
import { BadgeType, BADGE_DEFINITIONS } from '@/types';
import { Tooltip } from '@/components/ui/tooltip';
import { Bot, BookOpen, Crown, Gem, Globe, Heart, Radar, TrendingUp } from 'lucide-react';

interface BadgeDisplayProps {
  badges: BadgeType[];
  compact?: boolean;
  maxVisible?: number;
}

const BADGE_STYLES: Record<BadgeType, string> = {
  'claude-favorite': 'bg-[#d97757]/10 text-[#d97757] border-[#d97757]/30',
  'gpt-favorite': 'bg-[#10A37F]/10 text-[#10A37F] border-[#10A37F]/30',
  'gemini-favorite': 'bg-[#4285F4]/10 text-[#4285F4] border-[#4285F4]/30',
  'deepseek-favorite': 'bg-[#4F6EF7]/10 text-[#4F6EF7] border-[#4F6EF7]/30',
  'qwen-favorite': 'bg-[#FF6A00]/10 text-[#FF6A00] border-[#FF6A00]/30',
  'legacy-leaning': 'bg-violet-50 text-violet-700 border-violet-200',
  'llm-favorite': 'bg-indigo-50 text-indigo-700 border-indigo-200',
  'popular': 'bg-rose-50 text-rose-700 border-rose-200',
  'hidden-gem': 'bg-cyan-50 text-cyan-700 border-cyan-200',
  'under-the-radar': 'bg-sky-50 text-sky-700 border-sky-200',
  'global-icon': 'bg-teal-50 text-teal-700 border-teal-200',
  'universal-recognition': 'bg-amber-50 text-amber-700 border-amber-200',
};

export function BadgeDisplay({ badges, compact = false, maxVisible = 3 }: BadgeDisplayProps) {
  if (!badges || badges.length === 0) return null;

  const visibleBadges = badges.slice(0, maxVisible);
  const hiddenCount = badges.length - maxVisible;

  const renderIcon = (badgeType: BadgeType) => {
    const baseClass = cn('h-3.5 w-3.5', compact && 'h-3 w-3');
    switch (badgeType) {
      case 'hidden-gem':
        return <Gem className={baseClass} />;
      case 'under-the-radar':
        return <Radar className={baseClass} />;
      case 'popular':
        return <TrendingUp className={baseClass} />;
      case 'global-icon':
        return <Globe className={baseClass} />;
      case 'universal-recognition':
        return <Crown className={baseClass} />;
      case 'legacy-leaning':
        return <BookOpen className={baseClass} />;
      case 'llm-favorite':
        return <Bot className={baseClass} />;
      case 'claude-favorite':
      case 'gpt-favorite':
      case 'gemini-favorite':
      case 'deepseek-favorite':
      case 'qwen-favorite':
        return <Heart className={baseClass} />;
      default:
        return null;
    }
  };

  return (
    <div className="inline-flex items-center gap-1 flex-wrap">
      {visibleBadges.map((badgeType) => {
        const badge = BADGE_DEFINITIONS[badgeType];
        if (!badge) return null;
        return (
          <Tooltip
            key={badgeType}
            content={
              <div>
                <p className="font-medium">{badge.label}</p>
                <p className="text-stone-500 dark:text-slate-400">{badge.description}</p>
              </div>
            }
            >
              <span
                className={cn(
                  'inline-flex items-center gap-0.5 border rounded cursor-help transition-colors',
                  BADGE_STYLES[badgeType],
                  compact
                    ? 'px-1 py-0.5 text-[10px]'
                    : 'px-1.5 py-0.5 text-xs'
                )}
              >
              {renderIcon(badgeType)}
              {!compact && <span className="font-medium">{badge.label}</span>}
            </span>
          </Tooltip>
        );
      })}
      {hiddenCount > 0 && (
        <Tooltip
          content={
            <div>
              <p className="font-medium">Additional badges</p>
              <div className="mt-1 space-y-1">
                {badges.slice(maxVisible).map((badgeType) => {
                  const badge = BADGE_DEFINITIONS[badgeType];
                  if (!badge) return null;
                  return (
                    <p key={badgeType}>
                      {renderIcon(badgeType)} {badge.label}: {badge.description}
                    </p>
                  );
                })}
              </div>
            </div>
          }
        >
          <span
            className={cn(
              'inline-flex items-center border rounded cursor-help bg-stone-50 text-stone-600 border-stone-200',
              compact ? 'px-1 py-0.5 text-[10px]' : 'px-1.5 py-0.5 text-xs'
            )}
          >
            +{hiddenCount}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
