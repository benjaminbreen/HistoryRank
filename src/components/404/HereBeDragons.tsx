'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

/* ── SVG Sea Monster ── */
function SeaMonster({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 200"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      {/* body coils rising from water */}
      <g className="animate-monster-bob" style={{ transformOrigin: '180px 120px' }}>
        {/* tail coil (far left, behind waves) */}
        <path
          d="M 45,145 C 55,115 75,110 85,130 C 95,150 80,155 70,148"
          fill="none"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          opacity="0.4"
        />
        {/* mid coil */}
        <path
          d="M 120,148 C 115,105 140,90 155,110 C 170,130 155,150 140,145"
          fill="none"
          stroke="currentColor"
          strokeWidth="6"
          strokeLinecap="round"
          opacity="0.55"
        />
        {/* main body coil */}
        <path
          d="M 200,145 C 195,85 225,65 245,95 C 260,115 245,145 230,140"
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          opacity="0.7"
        />
        {/* neck rising */}
        <path
          d="M 270,140 C 275,100 285,70 295,45 C 300,35 310,30 315,35"
          fill="none"
          stroke="currentColor"
          strokeWidth="6.5"
          strokeLinecap="round"
        />
        {/* head */}
        <g>
          {/* skull shape */}
          <ellipse cx="318" cy="30" rx="18" ry="13" fill="currentColor" opacity="0.15" />
          <path
            d="M 300,30 C 300,18 312,12 325,15 C 338,18 342,28 338,35 C 335,40 325,42 318,40 L 310,45 L 312,38 C 305,37 300,34 300,30 Z"
            fill="none"
            stroke="currentColor"
            strokeWidth="3"
            strokeLinejoin="round"
          />
          {/* eye */}
          <circle cx="320" cy="25" r="3" fill="currentColor" />
          <circle cx="321" cy="24" r="1" fill="var(--bg, #faf9f7)" />
          {/* nostril */}
          <circle cx="333" cy="27" r="1.2" fill="currentColor" opacity="0.5" />
          {/* horn/crest */}
          <path
            d="M 315,17 L 310,5 L 318,14"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <path
            d="M 322,15 L 320,3 L 326,13"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          {/* jaw/teeth suggestion */}
          <path
            d="M 330,34 L 333,36 L 336,33"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            opacity="0.6"
          />
          {/* water drip from jaw */}
          <path
            d="M 312,42 C 313,48 311,52 312,56"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            opacity="0.3"
            strokeDasharray="2 3"
          />
        </g>
        {/* spine ridges along body */}
        <g opacity="0.35" stroke="currentColor" strokeWidth="1.5" fill="none">
          <path d="M 240,72 L 242,62 L 244,72" />
          <path d="M 235,78 L 237,69 L 239,78" />
          <path d="M 250,70 L 252,60 L 254,70" />
          <path d="M 290,55 L 292,46 L 294,55" />
          <path d="M 285,62 L 287,53 L 289,62" />
          <path d="M 155,96 L 157,88 L 159,96" />
          <path d="M 148,100 L 150,93 L 152,100" />
        </g>
      </g>

      {/* wave lines */}
      <g className="animate-waves-drift">
        <path
          d="M 0,150 Q 20,140 40,150 Q 60,160 80,150 Q 100,140 120,150 Q 140,160 160,150 Q 180,140 200,150 Q 220,160 240,150 Q 260,140 280,150 Q 300,160 320,150 Q 340,140 360,150"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          opacity="0.4"
        />
        <path
          d="M -10,158 Q 10,148 30,158 Q 50,168 70,158 Q 90,148 110,158 Q 130,168 150,158 Q 170,148 190,158 Q 210,168 230,158 Q 250,148 270,158 Q 290,168 310,158 Q 330,148 350,158 Q 370,168 390,158"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          opacity="0.25"
        />
        <path
          d="M -20,166 Q 5,157 25,166 Q 45,175 65,166 Q 85,157 105,166 Q 125,175 145,166 Q 165,157 185,166 Q 205,175 225,166 Q 245,157 265,166 Q 285,175 305,166 Q 325,157 345,166 Q 365,175 385,166"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          opacity="0.15"
        />
      </g>

      {/* water fill below wave line */}
      <rect x="0" y="165" width="360" height="35" fill="currentColor" opacity="0.04" />
    </svg>
  );
}

/* ── compass rose ── */
function CompassRose({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 60 60" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <g transform="translate(30,30)" stroke="currentColor" fill="none" strokeWidth="1" opacity="0.35">
        {/* outer circle */}
        <circle r="26" strokeDasharray="2 2" />
        <circle r="22" />
        {/* cardinal points */}
        <polygon points="0,-22 3,-8 -3,-8" fill="currentColor" opacity="0.6" />
        <polygon points="0,22 3,8 -3,8" fill="currentColor" opacity="0.25" />
        <polygon points="-22,0 -8,3 -8,-3" fill="currentColor" opacity="0.25" />
        <polygon points="22,0 8,3 8,-3" fill="currentColor" opacity="0.25" />
        {/* intercardinal lines */}
        <line x1="-15" y1="-15" x2="15" y2="15" opacity="0.2" />
        <line x1="15" y1="-15" x2="-15" y2="15" opacity="0.2" />
        {/* labels */}
        <text y="-24" textAnchor="middle" fill="currentColor" fontSize="5" fontFamily="serif" opacity="0.5">N</text>
        <text y="29" textAnchor="middle" fill="currentColor" fontSize="5" fontFamily="serif" opacity="0.5">S</text>
        <text x="-27" y="2" textAnchor="middle" fill="currentColor" fontSize="5" fontFamily="serif" opacity="0.5">W</text>
        <text x="27" y="2" textAnchor="middle" fill="currentColor" fontSize="5" fontFamily="serif" opacity="0.5">E</text>
      </g>
    </svg>
  );
}

/* ── map grid ── */
const NAV_LINKS = [
  { href: '/', label: 'Rankings' },
  { href: '/media', label: 'Media Atlas' },
  { href: '/maps', label: 'Maps' },
  { href: '/compare', label: 'Compare' },
  { href: '/about', label: 'About' },
];

export function NotFound404HereBeDragons() {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  return (
    <main className="relative flex flex-col items-center px-4 py-8 sm:py-12 overflow-hidden">
      {/* parchment background */}
      <div
        className="absolute inset-0 -z-10 bg-gradient-to-b from-amber-50/60 via-amber-100/30 to-orange-50/20 dark:from-stone-900/40 dark:via-slate-900/20 dark:to-slate-950/10"
        aria-hidden
      />

      {/* title cartouche */}
      <div className="text-center mb-6 sm:mb-8">
        <p className="font-mono text-[10px] tracking-[0.4em] text-stone-400 dark:text-slate-500 uppercase mb-2">
          Anno Domini MMXXVI
        </p>
        <h1 className="font-serif text-2xl sm:text-3xl text-stone-700 dark:text-amber-200/80 tracking-wide">
          Here Be Dragons
        </h1>
        <p className="mt-1 font-serif text-xs sm:text-sm italic text-stone-400 dark:text-slate-500">
          You have sailed beyond the edge of the known world
        </p>
      </div>

      {/* the map */}
      <div className="relative w-full max-w-2xl">
        {/* torn parchment border */}
        <div className="relative rounded-sm border-2 border-amber-800/20 dark:border-amber-600/15 bg-amber-50/50 dark:bg-stone-900/40 overflow-hidden">
          {/* decorative corner marks */}
          <div className="absolute top-1.5 left-1.5 w-3 h-3 border-t border-l border-amber-700/25 dark:border-amber-500/15" />
          <div className="absolute top-1.5 right-1.5 w-3 h-3 border-t border-r border-amber-700/25 dark:border-amber-500/15" />
          <div className="absolute bottom-1.5 left-1.5 w-3 h-3 border-b border-l border-amber-700/25 dark:border-amber-500/15" />
          <div className="absolute bottom-1.5 right-1.5 w-3 h-3 border-b border-r border-amber-700/25 dark:border-amber-500/15" />

          <div className="flex flex-col sm:flex-row">
            {/* left panel: known pages (the land) */}
            <div className="sm:w-2/5 p-5 sm:p-6 border-b sm:border-b-0 sm:border-r border-amber-800/10 dark:border-amber-600/10 bg-gradient-to-br from-amber-100/40 via-green-50/10 to-amber-50/30 dark:from-stone-800/30 dark:via-stone-800/20 dark:to-stone-900/30">
              <p className="font-mono text-[9px] tracking-[0.3em] text-amber-800/50 dark:text-amber-400/40 uppercase mb-3">
                Known Lands
              </p>

              {/* land features - nav links styled as map locations */}
              <div className="space-y-2">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="group flex items-center gap-2 py-1 transition-colors"
                  >
                    <span className="flex-shrink-0 w-1.5 h-1.5 rounded-full bg-amber-700/40 dark:bg-amber-500/30 group-hover:bg-amber-600 dark:group-hover:bg-amber-400 transition-colors" />
                    <span className="font-serif text-sm text-stone-600 dark:text-slate-300 group-hover:text-amber-800 dark:group-hover:text-amber-300 transition-colors">
                      {link.label}
                    </span>
                  </Link>
                ))}
              </div>

              {/* compass rose */}
              <CompassRose className="w-16 h-16 mt-4 mx-auto text-amber-800 dark:text-amber-500" />
            </div>

            {/* right panel: the sea (unknown) */}
            <div className="sm:w-3/5 relative min-h-[280px] sm:min-h-[320px] bg-gradient-to-br from-sky-50/40 via-blue-50/20 to-cyan-50/30 dark:from-slate-800/40 dark:via-slate-900/30 dark:to-slate-800/20 overflow-hidden">
              {/* lat/long grid lines */}
              <div className="absolute inset-0 pointer-events-none" aria-hidden>
                {[25, 50, 75].map((pct) => (
                  <div key={`h${pct}`}>
                    <div
                      className="absolute left-0 right-0 border-t border-amber-700/[0.07] dark:border-amber-500/[0.05]"
                      style={{ top: `${pct}%` }}
                    />
                    <div
                      className="absolute top-0 bottom-0 border-l border-amber-700/[0.07] dark:border-amber-500/[0.05]"
                      style={{ left: `${pct}%` }}
                    />
                  </div>
                ))}
              </div>

              {/* TERRA INCOGNITA label */}
              <div
                className={`absolute top-4 right-4 text-right transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}
              >
                <p className="font-serif text-xs tracking-[0.2em] text-sky-800/30 dark:text-sky-300/20 uppercase">
                  Terra
                </p>
                <p className="font-serif text-xs tracking-[0.2em] text-sky-800/30 dark:text-sky-300/20 uppercase">
                  Incognita
                </p>
              </div>

              {/* wave pattern text (tildes) */}
              <div className="absolute inset-0 flex flex-col justify-end pointer-events-none overflow-hidden opacity-[0.12] dark:opacity-[0.08]" aria-hidden>
                {Array.from({ length: 4 }, (_, i) => (
                  <p
                    key={i}
                    className="font-mono text-[10px] text-sky-600 dark:text-sky-400 whitespace-nowrap animate-waves-text"
                    style={{
                      animationDelay: `${i * -3}s`,
                      animationDuration: `${12 + i * 2}s`,
                    }}
                  >
                    {'~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ '}
                  </p>
                ))}
              </div>

              {/* HERE BE DRAGONS text on the sea */}
              <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <p className="font-serif text-xl sm:text-2xl tracking-[0.15em] text-sky-900/15 dark:text-sky-300/10 uppercase whitespace-nowrap rotate-[-8deg]">
                  Here Be Dragons
                </p>
              </div>

              {/* the sea monster */}
              <SeaMonster className="absolute bottom-0 left-0 right-0 w-full text-amber-900/60 dark:text-amber-300/40" />

              {/* 404 marker */}
              <div className="absolute top-3 left-3">
                <div className="flex items-center gap-1.5">
                  <span className="inline-block w-2 h-2 rounded-full border border-red-500/40 bg-red-400/20" />
                  <span className="font-mono text-[10px] text-red-600/50 dark:text-red-400/40 font-medium">
                    404
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* map legend */}
        <div className="mt-3 flex items-center justify-center gap-4 text-[10px] text-stone-400 dark:text-slate-500">
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-700/40 dark:bg-amber-500/30" />
            <span>Known page</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full border border-red-500/40 bg-red-400/20" />
            <span>You are here</span>
          </div>
        </div>
      </div>

      {/* bottom message */}
      <div className="mt-8 text-center">
        <p className="text-sm text-stone-500 dark:text-slate-400">
          The page you seek lies in uncharted waters.
        </p>
        <Link
          href="/"
          className="mt-4 inline-flex items-center gap-2 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-5 py-2.5 text-sm font-medium text-stone-700 dark:text-slate-200 shadow-sm hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-md transition-all"
        >
          Navigate Home
        </Link>
      </div>
    </main>
  );
}
