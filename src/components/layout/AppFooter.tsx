'use client';

import Link from 'next/link';

export function AppFooter() {
  return (
    <footer className="mt-16 border-t border-stone-200/70 bg-[#f4efe6] text-stone-600 dark:border-amber-900/30 dark:bg-slate-950/80 dark:text-slate-400">
      <div className="mx-auto max-w-7xl px-6 py-12">
        <div className="grid gap-10 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <div className="flex items-center gap-3">
              <div className="h-9 w-9 rounded-full border border-stone-300 bg-white text-stone-800 dark:border-amber-800/50 dark:bg-slate-900 dark:text-amber-200 flex items-center justify-center font-serif text-xs tracking-wide">
                HR
              </div>
              <div>
                <div className="text-lg font-serif font-semibold text-stone-900 dark:text-amber-100">
                  HistoryRank
                </div>
                <div className="text-xs text-stone-500 dark:text-slate-500">
                  A historiometry and model-behavior project
                </div>
              </div>
            </div>
            <p className="mt-4 text-sm text-stone-600 dark:text-slate-400">
              Comparing academic rankings, public attention, and AI assessments to surface how historical
              importance is judged across sources and models.
            </p>
            <p className="mt-4 text-xs text-stone-500 dark:text-slate-500">
              Created by Benjamin Breen (UC Santa Cruz).
            </p>
          </div>

          <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">
                Explore
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {[
                  ['/', 'Rankings'],
                  ['/scatter', 'Scatter'],
                  ['/maps', 'Maps'],
                  ['/compare', 'Compare'],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link className="footer-link" href={href}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">
                Project
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                {[
                  ['/about', 'About'],
                  ['/methodology', 'Methodology'],
                  ['/caveats', 'Caveats'],
                ].map(([href, label]) => (
                  <li key={href}>
                    <Link className="footer-link" href={href}>
                      {label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <div className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-400 dark:text-slate-500">
                Contact
              </div>
              <ul className="mt-3 space-y-2 text-sm">
                <li>
                  <a className="footer-link" href="mailto:bebreen@ucsc.edu">
                    bebreen@ucsc.edu
                  </a>
                </li>
                <li className="text-xs text-stone-500 dark:text-slate-500">
                  Open to collaborations in history, data science, and AI.
                </li>
              </ul>
            </div>
          </div>
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t border-stone-200/60 pt-6 text-xs text-stone-500 dark:border-slate-800 dark:text-slate-500">
          <span>Data: MIT Pantheon, Wikipedia, and frontier LLMs.</span>
          <span>© {new Date().getFullYear()} HistoryRank.</span>
        </div>
      </div>
    </footer>
  );
}
