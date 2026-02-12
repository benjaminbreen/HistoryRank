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
  '                                                                  ',
  '                   .----.                                         ',
  '                  / o    \\                                        ',
  '                 |    __  |                                       ',
  '                 |   /  \\ |              .-----------.            ',
  '                  \\  `--\'/               |           |            ',
  '                   `----\'                |  4  0  4  |            ',
  '                  _/ || \\_               |           |            ',
  '                ,\'   ||   `.        _____|___________|_____       ',
  '           _.-\'\'  ,  ||  ,  ``-._.-\'  ,  .  ,  .  ,  .  , `-._  ',
  '        ,-\' .,:. ,  ,||,  , ,:. . ,:. .,:  . :,. .,: . :,. .,`-.',
  '       ;:::::::::::,,,,,,,,:::::::::::::::::::::::::::::::::::::::;',
  '       `:::::::::::::::::::::::::::::::::::::::::::::::::::::::::\' ',
];

const SHELLEY_LINES = [
  '"Look on my works, ye mighty, and despair!"',
  '',
  'Nothing beside remains. Round the decay',
  'of that colossal wreck, boundless and bare,',
  'the lone and level sands stretch far away.',
];

/* ── sand particle component ── */
function SandParticles() {
  const [particles] = useState(() =>
    Array.from({ length: 24 }, (_, i) => ({
      id: i,
      left: Math.random() * 100,
      delay: Math.random() * 6,
      duration: 4 + Math.random() * 4,
      size: 1 + Math.random() * 2,
      opacity: 0.15 + Math.random() * 0.25,
    }))
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden>
      {particles.map((p) => (
        <div
          key={p.id}
          className="absolute rounded-full bg-amber-600/30 dark:bg-amber-400/20 animate-sand-drift"
          style={{
            left: `${p.left}%`,
            bottom: '8%',
            width: p.size,
            height: p.size,
            '--sand-opacity': p.opacity,
            '--sand-delay': `${p.delay}s`,
            '--sand-duration': `${p.duration}s`,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

export function NotFound404Ozymandias() {
  const [visibleLines, setVisibleLines] = useState(0);
  const [randomFigure, setRandomFigure] = useState<RandomFigure | null>(null);

  /* stagger the Shelley quote lines */
  useEffect(() => {
    const timers: ReturnType<typeof setTimeout>[] = [];
    SHELLEY_LINES.forEach((_, i) => {
      timers.push(setTimeout(() => setVisibleLines(i + 1), 800 + i * 600));
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
      <SandParticles />

      {/* desert gradient backdrop */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-amber-50/40 via-orange-50/20 to-transparent dark:from-amber-950/20 dark:via-stone-900/10 dark:to-transparent"
        aria-hidden
      />

      {/* ASCII monument */}
      <div className="w-full max-w-2xl overflow-x-auto">
        <pre
          className="mx-auto font-mono text-[9px] leading-[1.3] sm:text-[11px] md:text-xs select-none whitespace-pre text-center"
          aria-hidden
        >
          {ASCII_ART.map((line, i) => {
            /* head: rows 1–3, pedestal: 4–8, sand: 9+ */
            const isHead = i >= 1 && i <= 3;
            const isPedestal = i >= 4 && i <= 8;
            const isSand = i >= 9;
            let color = 'text-stone-400 dark:text-slate-600';
            if (isHead) color = 'text-stone-500 dark:text-slate-500';
            if (isPedestal) color = 'text-amber-700/70 dark:text-amber-500/50';
            if (isSand) color = 'text-amber-600/30 dark:text-amber-700/25';
            return (
              <span key={i} className={`block ${color}`}>
                {line}
              </span>
            );
          })}
        </pre>
      </div>

      {/* Shelley quote — fades in line by line */}
      <div className="mt-6 sm:mt-8 text-center space-y-1 min-h-[120px]">
        {SHELLEY_LINES.map((line, i) => (
          <p
            key={i}
            className={`font-serif text-sm sm:text-base transition-all duration-700 ${
              i === 0
                ? 'text-amber-700 dark:text-amber-400 italic'
                : 'text-stone-500 dark:text-slate-400'
            } ${
              i < visibleLines
                ? 'opacity-100 translate-y-0'
                : 'opacity-0 translate-y-2'
            }`}
          >
            {line || '\u00A0'}
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
          Return to Civilization
        </Link>

        {/* random figure discovery */}
        {randomFigure && (
          <div className="text-center">
            <p className="text-xs text-stone-400 dark:text-slate-500 mb-2">
              Or discover a figure lost in the sands:
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

      {/* Shelley attribution */}
      <p className="mt-10 text-[11px] text-stone-300 dark:text-slate-700 text-center">
        Percy Bysshe Shelley, &ldquo;Ozymandias&rdquo; (1818)
      </p>
    </main>
  );
}
