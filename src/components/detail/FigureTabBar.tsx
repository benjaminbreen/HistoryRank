'use client';

import { LayoutGrid, BookOpen, Clock3 } from 'lucide-react';
import type { DetailTab } from '@/types';

const TAB_LABELS: Array<{ id: DetailTab; label: string; icon: typeof LayoutGrid }> = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'research', label: 'Research', icon: BookOpen },
  { id: 'timeline', label: 'Timeline', icon: Clock3 },
];

interface FigureTabBarProps {
  activeTab: DetailTab;
  onTabChange: (tab: DetailTab) => void;
}

export function FigureTabBar({ activeTab, onTabChange }: FigureTabBarProps) {
  return (
    <div className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200/80 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800/80">
      {TAB_LABELS.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onTabChange(tab.id)}
            className={`flex items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
              isActive
                ? 'bg-stone-900 text-white dark:bg-amber-500 dark:text-stone-900'
                : 'text-stone-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
            aria-pressed={isActive}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
