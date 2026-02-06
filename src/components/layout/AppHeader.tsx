'use client';

import { useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { ScatterChart, GitCompareArrows, Map, Menu, Clapperboard, Award, ChevronDown } from 'lucide-react';
import { SettingsSheet } from '@/components/settings/SettingsSheet';
import { AboutDialog } from '@/components/about/AboutDialog';
import { useDarkMode } from '@/hooks/useDarkMode';
import type { Settings } from '@/hooks/useSettings';

type AppHeaderProps = {
  active?: 'about' | 'methodology' | 'caveats' | 'maps' | 'scatter' | 'compare' | 'media' | 'table' | 'benchmarks';
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onSettingsReset: () => void;
};

const navLinkClass = (isActive: boolean) =>
  `text-sm px-2 py-1 transition-colors ${
    isActive
      ? 'text-stone-900 dark:text-amber-100 font-medium'
      : 'text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200'
  }`;

export function AppHeader({
  active,
  settings,
  onSettingsChange,
  onSettingsReset,
}: AppHeaderProps) {
  const { isDarkMode, mounted } = useDarkMode();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isCompactHeader, setIsCompactHeader] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isExploreOpen, setIsExploreOpen] = useState(false);
  const exploreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setIsCompactHeader(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Close explore dropdown when clicking outside
  useEffect(() => {
    if (!isExploreOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (exploreRef.current && !exploreRef.current.contains(e.target as Node)) {
        setIsExploreOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isExploreOpen]);

  const isExploreActive = active === 'maps' || active === 'scatter' || active === 'media';

  return (
    <>
      <header
        className="sticky top-0 z-50 border-b border-stone-200/60 dark:border-amber-900/30 shadow-sm transition-all duration-300 ease-out"
        style={{
          padding: isCompactHeader ? '10px 0' : '16px 0',
          backgroundColor: mounted && isDarkMode ? 'rgba(15, 23, 42, 0.9)' : 'rgba(250, 250, 247, 0.7)',
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          <div className="flex items-center justify-between gap-2 sm:gap-4">
            {/* Logo */}
            <div className="hr-logo group flex items-center gap-2 sm:gap-3 min-w-0">
              <button
                onClick={() => setIsAboutOpen(true)}
                className="hr-logo-icon flex-shrink-0 rounded-full border border-stone-300 dark:border-amber-800/50 bg-stone-50 dark:bg-slate-800 text-stone-800 dark:text-amber-200 flex items-center justify-center font-serif text-xs tracking-wide transition-all duration-300 hover:scale-[1.03] hover:shadow-md hover:border-stone-400/70 dark:hover:border-amber-600/60"
                style={{
                  width: isCompactHeader ? '32px' : '36px',
                  height: isCompactHeader ? '32px' : '36px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                aria-label="Open About"
              >
                HR
              </button>
              <Link href="/" className="block text-left min-w-0">
                <div className="overflow-hidden">
                  <h1
                    className={`hr-logo-text font-serif font-semibold text-stone-900 dark:text-amber-100 transition-all duration-300 group-hover:text-stone-700 dark:group-hover:text-amber-200 truncate leading-tight ${
                      isCompactHeader ? 'text-lg' : 'text-xl'
                    }`}
                  >
                    HistoryRank
                  </h1>
                  <p
                    className="hr-logo-tagline hidden sm:block text-stone-500/80 dark:text-slate-400/80 text-xs overflow-hidden transition-opacity duration-300 group-hover:text-stone-600 dark:group-hover:text-slate-300 truncate"
                    style={{
                      maxHeight: isCompactHeader ? '0px' : '24px',
                      opacity: isCompactHeader ? 0 : 1,
                      marginTop: isCompactHeader ? '0px' : '2px',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    Comparing historical importance
                  </p>
                </div>
              </Link>
            </div>

            {/* Desktop navigation */}
            <div className="hidden md:flex items-center gap-1">
              {/* Secondary links — lighter weight */}
              <Link href="/about" className={navLinkClass(active === 'about')}>
                About
              </Link>
              <Link href="/methodology" className={navLinkClass(active === 'methodology')}>
                Methodology
              </Link>
              <Link href="/caveats" className={navLinkClass(active === 'caveats')}>
                Caveats
              </Link>

              {/* Divider */}
              <div className="w-px h-4 bg-stone-300/60 dark:bg-slate-600/60 mx-1.5" />

              {/* Explore dropdown — groups Maps, Scatter, Media */}
              <div ref={exploreRef} className="relative">
                <button
                  onClick={() => setIsExploreOpen((o) => !o)}
                  className={`flex items-center gap-1 text-sm px-2 py-1 rounded-md transition-colors ${
                    isExploreActive
                      ? 'text-stone-900 dark:text-amber-100 font-medium bg-stone-100/60 dark:bg-amber-900/20'
                      : 'text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 hover:bg-stone-100/40 dark:hover:bg-slate-800/40'
                  }`}
                >
                  Explore
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${isExploreOpen ? 'rotate-180' : ''}`} />
                </button>
                <div
                  className={`absolute right-0 mt-2 w-44 rounded-lg border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg py-1 transition-all ${
                    isExploreOpen ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-1'
                  }`}
                >
                  <Link
                    href="/maps"
                    onClick={() => setIsExploreOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      active === 'maps'
                        ? 'text-stone-900 dark:text-amber-100 bg-stone-50 dark:bg-slate-700/50'
                        : 'text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <Map className="h-4 w-4 text-stone-400 dark:text-slate-500" />
                    Maps
                  </Link>
                  <Link
                    href="/scatter"
                    onClick={() => setIsExploreOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      active === 'scatter'
                        ? 'text-stone-900 dark:text-amber-100 bg-stone-50 dark:bg-slate-700/50'
                        : 'text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <ScatterChart className="h-4 w-4 text-stone-400 dark:text-slate-500" />
                    Scatter
                  </Link>
                  <Link
                    href="/media"
                    onClick={() => setIsExploreOpen(false)}
                    className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                      active === 'media'
                        ? 'text-stone-900 dark:text-amber-100 bg-stone-50 dark:bg-slate-700/50'
                        : 'text-stone-600 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-700/50'
                    }`}
                  >
                    <Clapperboard className="h-4 w-4 text-stone-400 dark:text-slate-500" />
                    Media
                  </Link>
                </div>
              </div>

              {/* Primary actions — Compare & Benchmarks */}
              <Link href="/compare" className={navLinkClass(active === 'compare')}>
                Compare
              </Link>
              <Link href="/benchmarks" className={navLinkClass(active === 'benchmarks')}>
                Benchmarks
              </Link>

              <div className="w-px h-4 bg-stone-300/60 dark:bg-slate-600/60 mx-1.5" />

              <SettingsSheet
                settings={settings}
                onChange={onSettingsChange}
                onReset={onSettingsReset}
              />
            </div>

            {/* Mobile navigation */}
            <div className="flex items-center gap-2 md:hidden">
              <Link href="/about" className={navLinkClass(active === 'about')}>
                About
              </Link>
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen((open) => !open)}
                  className="inline-flex items-center justify-center rounded-full border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 p-2 text-stone-600 dark:text-slate-300 shadow-sm transition-colors hover:text-stone-900 dark:hover:text-slate-100 min-w-[44px] min-h-[44px]"
                  aria-label="Open menu"
                >
                  <Menu className="h-5 w-5" />
                </button>
                <div
                  className={`absolute right-0 mt-3 w-[calc(100vw-2rem)] max-w-[14rem] rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl transition-all ${
                    isMenuOpen ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-2'
                  }`}
                >
                  <div className="flex flex-col gap-1 p-3 text-sm text-stone-700 dark:text-slate-200">
                    <div className="px-3 py-1 text-xs uppercase tracking-[0.15em] text-stone-400 dark:text-slate-500">Project</div>
                    <Link href="/methodology" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-stone-100 dark:hover:bg-slate-700 min-h-[44px] flex items-center">
                      Methodology
                    </Link>
                    <Link href="/caveats" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-stone-100 dark:hover:bg-slate-700 min-h-[44px] flex items-center">
                      Caveats
                    </Link>
                    <div className="border-t border-stone-100 dark:border-slate-700 my-1" />
                    <div className="px-3 py-1 text-xs uppercase tracking-[0.15em] text-stone-400 dark:text-slate-500">Explore</div>
                    <Link href="/maps" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-stone-100 dark:hover:bg-slate-700 min-h-[44px] flex items-center gap-2">
                      <Map className="h-4 w-4 text-stone-400" /> Maps
                    </Link>
                    <Link href="/scatter" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-stone-100 dark:hover:bg-slate-700 min-h-[44px] flex items-center gap-2">
                      <ScatterChart className="h-4 w-4 text-stone-400" /> Scatter
                    </Link>
                    <Link href="/media" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-stone-100 dark:hover:bg-slate-700 min-h-[44px] flex items-center gap-2">
                      <Clapperboard className="h-4 w-4 text-stone-400" /> Media
                    </Link>
                    <div className="border-t border-stone-100 dark:border-slate-700 my-1" />
                    <Link href="/compare" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-stone-100 dark:hover:bg-slate-700 min-h-[44px] flex items-center gap-2">
                      <GitCompareArrows className="h-4 w-4 text-stone-400" /> Compare
                    </Link>
                    <Link href="/benchmarks" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-3 hover:bg-stone-100 dark:hover:bg-slate-700 min-h-[44px] flex items-center gap-2">
                      <Award className="h-4 w-4 text-stone-400" /> Benchmarks
                    </Link>
                    <div className="px-3 py-2 border-t border-stone-100 dark:border-slate-700 mt-1 pt-2">
                      <SettingsSheet
                        settings={settings}
                        onChange={onSettingsChange}
                        onReset={onSettingsReset}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>
      <AboutDialog open={isAboutOpen} onOpenChange={setIsAboutOpen} />
    </>
  );
}
