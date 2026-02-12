'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* ── random figure pulled client-side ── */
type RandomFigure = {
  id: string;
  name: string;
  rank: number;
  primary_era: string;
};

const ASCII_ART = [
  '                                                                     ',
  '                   .=================.                               ',
  '                .=\'                   \'=.                            ',
  '              .=\'                       \'=.                          ',
  '             =\'                           \'=                         ',
  '            =      ___             ___      =                        ',
  '            |     |   |           |   |     |                        ',
  '            |     |   |           |   |     |                        ',
  '            |     |   |           |   |     |                        ',
  '            |     |   |   4 0 4   |   |     |       ____             ',
  '            |     |   |           |   |     |      / .  |            ',
  '            |     |   |           |   |     |     |  :  |            ',
  '       _____|_____|   |___________|   |_____|_____|  :  |__          ',
  '      / , .  , . ,     , . , . , .     , . , ,  . | .:  | , \\       ',
  '     /  . , .  . , . , . , . , . , . , .  , . , . |_:___|, . \\      ',
  '    ;::::::::::::::::::::::::::::::::::::::::::::::::::::::::::;     ',
  '    \'::::::::::::::::::::::::::::::::::::::::::::::::::::::::::\'     ',
];

const HORACE_LINES = [
  '"Many brave men lived before Agamemnon;',
  'but all are overwhelmed in eternal night,',
  'unwept, unknown, because they lack',
  'a sacred poet."',
];

/* ── dust mote particles ── */
function DustMotes() {
  const [motes] = useState(() =>
    Array.from({ length: 18 }, (_, i) => ({
      id: i,
      left: 10 + Math.random() * 80,
      top: 10 + Math.random() * 60,
      delay: Math.random() * 8,
      duration: 6 + Math.random() * 6,
      size: 1 + Math.random() * 1.5,
      opacity: 0.1 + Math.random() * 0.2,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {motes.map((m) => (
        <div
          key={m.id}
          className="absolute rounded-full bg-amber-500/20 dark:bg-amber-400/15 animate-dust-float"
          style={{
            left: `${m.left}%`,
            top: `${m.top}%`,
            width: m.size,
            height: m.size,
            animationDelay: `${m.delay}s`,
            animationDuration: `${m.duration}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function NotFound404RomanRuins() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [randomFigure, setRandomFigure] = useState<RandomFigure | null>(null);

  /* stagger the Horace quote lines */
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    HORACE_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), 800 + i * 500));
    });
    return () => timers.forEach(clearTimeout);
  }, []);

  /* fetch a random figure */
  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      try {
        const randomOffset = Math.floor(Math.random() * 200);
        const res = await fetch(`/api/figures?limit=1&offset=${randomOffset}`, {
          signal: controller.signal,
        });
        if (!res.ok) return;
        const data = await res.json();
        const fig = data?.figures?.[0];
        if (fig) {
          setRandomFigure({
            id: fig.id,
            name: fig.name,
            rank: fig.rank ?? randomOffset + 1,
            primary_era: fig.primary_era ?? 'Unknown',
          });
        }
      } catch {
        /* ignore */
      }
    })();
    return () => controller.abort();
  }, []);

  return (
    <main className="relative flex flex-col items-center px-4 py-8 sm:py-12">
      <DustMotes />

      {/* warm stone gradient backdrop */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-stone-100/50 via-amber-50/20 to-transparent dark:from-stone-900/30 dark:via-slate-900/10 dark:to-transparent"
        aria-hidden
      />

      {/* ASCII ruins */}
      <div className="w-full max-w-2xl overflow-x-auto">
        <pre
          className="mx-auto font-mono text-[8px] leading-[1.3] sm:text-[10px] md:text-[11px] select-none whitespace-pre text-center"
          aria-hidden
        >
          {ASCII_ART.map((line, i) => {
            /* arch: rows 1–5, columns: 6–11, base/sand: 12+ */
            const isArch = i >= 1 && i <= 4;
            const isColumns = i >= 5 && i <= 11;
            const isBase = i === 12;
            const isSand = i >= 13;
            let color = 'text-stone-400 dark:text-slate-600';
            if (isArch) color = 'text-stone-500 dark:text-slate-500';
            if (isColumns) color = 'text-stone-450 dark:text-slate-550 text-stone-500/80 dark:text-slate-500/80';
            if (isBase) color = 'text-stone-500/70 dark:text-slate-500/60';
            if (isSand) color = 'text-amber-700/25 dark:text-amber-600/20';
            return (
              <span key={i} className={`block ${color}`}>
                {line}
              </span>
            );
          })}
        </pre>
      </div>

      {/* Horace quote — fades in line by line */}
      <div className="mt-6 sm:mt-8 text-center space-y-0.5 min-h-[110px]">
        {HORACE_LINES.map((line, i) => (
          <p
            key={i}
            className={`font-serif text-sm sm:text-base transition-all duration-700 ${
              i === 0 || i === 3
                ? 'text-amber-700 dark:text-amber-400 italic'
                : 'text-stone-500 dark:text-slate-400 italic'
            } ${
              i < visibleLines
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2'
            }`}
          >
            {line}
          </p>
        ))}
      </div>

      {/* 404 label */}
      <div className="mt-6 flex items-center gap-3">
        <div className="h-px w-8 bg-stone-300 dark:bg-slate-700" />
        <span className="font-mono text-xs tracking-[0.3em] text-stone-400 dark:text-slate-500 uppercase">
          page not found
        </span>
        <div className="h-px w-8 bg-stone-300 dark:bg-slate-700" />
      </div>

      {/* navigation */}
      <div className="mt-8 flex flex-col items-center gap-4">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-slate-200 shadow-sm hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-md transition-all"
        >
          Return to the Forum
        </Link>

        {/* random figure discovery */}
        {randomFigure && (
          <div className="text-center">
            <p className="text-xs text-stone-400 dark:text-slate-500 mb-2">
              Or rediscover a figure from the ruins:
            </p>
            <Link
              href={`/figure/${randomFigure.id}`}
              className="group inline-flex items-center gap-2.5 rounded-lg border border-stone-200/80 dark:border-slate-700/80 bg-stone-50/60 dark:bg-slate-800/40 px-4 py-2 transition-all hover:border-amber-300/60 dark:hover:border-amber-600/40 hover:bg-amber-50/40 dark:hover:bg-amber-900/10"
            >
              <span className="text-amber-500 dark:text-amber-400">&#9733;</span>
              <span className="text-sm font-medium text-stone-700 dark:text-slate-200 group-hover:text-amber-800 dark:group-hover:text-amber-300 transition-colors">
                {randomFigure.name}
              </span>
              <span className="text-xs font-mono text-stone-400 dark:text-slate-500">
                #{randomFigure.rank}
              </span>
              <span className="text-[10px] text-stone-400 dark:text-slate-500">
                {randomFigure.primary_era}
              </span>
            </Link>
          </div>
        )}
      </div>

      {/* attribution */}
      <p className="mt-10 text-[11px] text-stone-300 dark:text-slate-700 text-center">
        Horace, <span className="italic">Odes</span> IV.9 (c. 13 BC)
      </p>
    </main>
  );
}
