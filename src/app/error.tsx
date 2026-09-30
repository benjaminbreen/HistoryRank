'use client';

import { useEffect, useRef } from 'react';
import Link from 'next/link';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  // Move focus to the message so keyboard and screen reader users land on it
  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6 dark:bg-slate-950">
      <div className="max-w-md text-center" role="alert">
        <div className="mb-4 text-5xl text-stone-300 dark:text-slate-600" aria-hidden="true">!</div>
        <h1 ref={headingRef} tabIndex={-1} className="mb-2 text-lg outline-none font-semibold text-stone-800 dark:text-slate-200">
          Something went wrong
        </h1>
        <p className="mb-6 text-sm text-stone-500 dark:text-slate-400">
          An unexpected error occurred. This has been logged.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 text-sm font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/70 focus-visible:ring-offset-2"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
