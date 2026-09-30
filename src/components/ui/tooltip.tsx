'use client';

import { ReactNode, useId, useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';

interface TooltipProps {
  content: ReactNode;
  children: ReactNode;
  className?: string;
  align?: 'left' | 'center' | 'right';
}

export function Tooltip({ content, children, className, align = 'left' }: TooltipProps) {
  const id = useId();
  const triggerRef = useRef<HTMLSpanElement>(null);
  const tooltipRef = useRef<HTMLSpanElement>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current || !tooltipRef.current) return;

    const triggerRect = triggerRef.current.getBoundingClientRect();
    const tooltipRect = tooltipRef.current.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    let top = triggerRect.bottom + 8; // 8px gap
    let left: number;

    // Calculate horizontal position based on align prop
    if (align === 'right') {
      left = triggerRect.right - tooltipRect.width;
    } else if (align === 'center') {
      left = triggerRect.left + (triggerRect.width / 2) - (tooltipRect.width / 2);
    } else {
      left = triggerRect.left;
    }

    // Clamp to viewport bounds with padding
    const padding = 8;
    left = Math.max(padding, Math.min(left, viewportWidth - tooltipRect.width - padding));

    // If tooltip would go below viewport, show above trigger instead
    if (top + tooltipRect.height > viewportHeight - padding) {
      top = triggerRect.top - tooltipRect.height - 8;
    }

    setPosition({ top, left });
  }, [align]);

  // Measure before paint so the tooltip never flashes at a stale position
  useLayoutEffect(() => {
    if (isVisible) updatePosition();
  }, [isVisible, updatePosition]);

  // Update position on scroll/resize while visible
  useEffect(() => {
    if (!isVisible) return;

    const handleUpdate = () => requestAnimationFrame(updatePosition);
    window.addEventListener('scroll', handleUpdate, true);
    window.addEventListener('resize', handleUpdate);

    return () => {
      window.removeEventListener('scroll', handleUpdate, true);
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isVisible, updatePosition]);

  const showTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
  }, []);

  // Hover waits briefly so tooltips don't flash while moving across the table;
  // keyboard focus shows immediately.
  const showTooltip = (immediate = false) => {
    clearTimeout(hideTimer.current);
    clearTimeout(showTimer.current);
    if (immediate) setIsVisible(true);
    else showTimer.current = setTimeout(() => setIsVisible(true), 250);
  };
  // A short grace period lets the pointer travel onto the tooltip (WCAG 1.4.13: hoverable)
  const hideTooltip = () => {
    clearTimeout(showTimer.current);
    clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setIsVisible(false), 120);
  };

  // Escape dismisses without moving focus (WCAG 1.4.13: dismissible)
  useEffect(() => {
    if (!isVisible) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsVisible(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isVisible]);

  return (
    <>
      <span
        ref={triggerRef}
        className={`inline-flex items-center ${className ?? ''}`}
        onMouseEnter={() => showTooltip()}
        onMouseLeave={hideTooltip}
        onFocus={() => showTooltip(true)}
        onBlur={hideTooltip}
        aria-describedby={isVisible ? id : undefined}
      >
        {children}
      </span>
      {mounted && createPortal(
        <span
          ref={tooltipRef}
          id={id}
          role="tooltip"
          onMouseEnter={() => showTooltip(true)}
          onMouseLeave={hideTooltip}
          className={`fixed z-[9999] w-72 max-w-[calc(100vw-16px)] rounded-md border border-stone-200/80 bg-white/95 px-3 py-2 text-xs leading-relaxed text-stone-700 shadow-lg transition-opacity duration-150 whitespace-normal break-words dark:border-amber-900/40 dark:bg-slate-900/95 dark:text-slate-200 ${
            isVisible ? 'opacity-100' : 'hidden'
          }`}
          style={{
            top: position.top,
            left: position.left,
          }}
        >
          {content}
        </span>,
        document.body
      )}
    </>
  );
}
