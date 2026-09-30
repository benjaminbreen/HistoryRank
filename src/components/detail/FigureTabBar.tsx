'use client';

import { useRef } from 'react';
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
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  // Arrow keys move between tabs (roving tabindex), as in the ARIA tabs pattern
  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    let next = index;
    if (event.key === 'ArrowRight') next = (index + 1) % TAB_LABELS.length;
    else if (event.key === 'ArrowLeft') next = (index - 1 + TAB_LABELS.length) % TAB_LABELS.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = TAB_LABELS.length - 1;
    else return;
    event.preventDefault();
    // Stop the page-level prev/next figure shortcut from also reacting
    event.stopPropagation();
    onTabChange(TAB_LABELS[next].id);
    tabRefs.current[next]?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label="Figure sections"
      className="grid grid-cols-3 gap-1 rounded-xl border border-stone-200/80 bg-white/90 p-1 shadow-sm dark:border-slate-700 dark:bg-slate-800/80"
    >
      {TAB_LABELS.map((tab, index) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        return (
          <button
            key={tab.id}
            ref={(el) => {
              tabRefs.current[index] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onTabChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`flex min-h-9 items-center justify-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 ${
              isActive
                ? 'bg-stone-900 text-white dark:bg-[#c9a55c] dark:text-stone-900'
                : 'text-stone-600 hover:bg-stone-100 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            <Icon className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );
}
