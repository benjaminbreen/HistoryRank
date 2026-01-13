'use client';

import { ReactNode, useId } from 'react';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export function Tooltip({ content, children, className, align = 'left' }: TooltipProps) {
  const id = useId();
  const alignClass =
    align === 'right'
      ? 'right-0'
      : align === 'center'
      ? 'left-1/2 -translate-x-1/2'
      : 'left-0';

  return (
    <span className={`relative inline-flex items-center group ${className ?? ''}`}>
      <span aria-describedby={id}>{children}</span>
      <span
        id={id}
        role="tooltip"
        className={`pointer-events-none absolute top-full z-50 mt-2 w-72 max-w-[80vw] rounded-md border border-stone-200/80 bg-white/95 px-3 py-2 text-xs leading-relaxed text-stone-700 shadow-lg opacity-0 transition-all duration-150 group-hover:opacity-100 group-focus-within:opacity-100 whitespace-normal break-words dark:border-amber-900/40 dark:bg-slate-900/95 dark:text-slate-200 ${alignClass}`}
      >
        {content}
      </span>
    </span>
  );
}
