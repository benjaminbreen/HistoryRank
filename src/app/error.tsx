'use client';

import { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[error-boundary]', error);
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-50 px-6 dark:bg-slate-950">
      <div className="max-w-md text-center">
        <div className="mb-4 text-5xl text-stone-300 dark:text-slate-600">!</div>
        <h1 className="mb-2 text-lg font-semibold text-stone-800 dark:text-slate-200">
          Something went wrong
        </h1>
        <p className="mb-6 text-sm text-stone-500 dark:text-slate-400">
          An unexpected error occurred. This has been logged.
        </p>
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-lg border border-stone-300 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition-colors hover:bg-stone-50 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-amber-700"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}
