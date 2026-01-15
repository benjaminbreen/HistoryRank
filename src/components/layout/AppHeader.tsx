'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ScatterChart, GitCompareArrows, Map, Menu, Clapperboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SettingsSheet } from '@/components/settings/SettingsSheet';
import { AboutDialog } from '@/components/about/AboutDialog';
import { useDarkMode } from '@/hooks/useDarkMode';
import type { Settings } from '@/hooks/useSettings';

type AppHeaderProps = {
  active?: 'about' | 'methodology' | 'caveats' | 'maps' | 'scatter' | 'compare' | 'media' | 'table';
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onSettingsReset: () => void;
};

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

  useEffect(() => {
    const onScroll = () => setIsCompactHeader(window.scrollY > 48);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

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
        <div className="max-w-7xl mx-auto px-6">
          <div className="flex items-center justify-between gap-4">
            <div className="hr-logo group flex items-center gap-2 sm:gap-3">
              <button
                onClick={() => setIsAboutOpen(true)}
                className="hr-logo-icon rounded-full border border-stone-300 dark:border-amber-800/50 bg-stone-50 dark:bg-slate-800 text-stone-800 dark:text-amber-200 flex items-center justify-center font-serif text-xs tracking-wide transition-all duration-300 hover:scale-[1.03] hover:shadow-md hover:border-stone-400/70 dark:hover:border-amber-600/60"
                style={{
                  width: isCompactHeader ? '32px' : '36px',
                  height: isCompactHeader ? '32px' : '36px',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                }}
                aria-label="Open About"
              >
                HR
              </button>
              <Link href="/" className="block text-left">
                <div className="overflow-hidden">
                  <h1
                    className="hr-logo-text font-serif font-semibold text-stone-900 dark:text-amber-100 transition-colors duration-300 group-hover:text-stone-700 dark:group-hover:text-amber-200"
                    style={{
                      fontSize: isCompactHeader ? '1.1rem' : '1.5rem',
                      lineHeight: 1.2,
                      transition: 'font-size 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    HistoryRank
                  </h1>
                  <p
                    className="hr-logo-tagline text-stone-500/80 dark:text-slate-400/80 text-sm overflow-hidden transition-opacity duration-300 group-hover:text-stone-600 dark:group-hover:text-slate-300"
                    style={{
                      maxHeight: isCompactHeader ? '0px' : '24px',
                      opacity: isCompactHeader ? 0 : 1,
                      marginTop: isCompactHeader ? '0px' : '2px',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)'
                    }}
                  >
                    Comparing historical importance across rankings
                  </p>
                </div>
              </Link>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/about"
                className={`text-sm px-2 py-1 transition-all active:translate-y-[2px] active:scale-[0.96] ${
                  active === 'about'
                    ? 'text-stone-900 dark:text-amber-100 font-medium'
                    : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200'
                }`}
              >
                About
              </Link>

              <div className="hidden md:flex items-center gap-2">
                <Link
                  href="/methodology"
                  className={`text-sm px-2 py-1 transition-all active:translate-y-[2px] active:scale-[0.96] ${
                    active === 'methodology'
                      ? 'text-stone-900 dark:text-amber-100 font-medium'
                      : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200'
                  }`}
                >
                  Methodology
                </Link>
                <Link
                  href="/caveats"
                  className={`text-sm px-2 py-1 transition-all active:translate-y-[2px] active:scale-[0.96] ${
                    active === 'caveats'
                      ? 'text-stone-900 dark:text-amber-100 font-medium'
                      : 'text-stone-600 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200'
                  }`}
                >
                  Caveats
                </Link>
                <Link href="/maps">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-2 transition-all active:translate-y-[2px] active:scale-[0.96] ${
                      active === 'maps'
                        ? 'border-stone-300 bg-stone-100/70 text-stone-900 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-100'
                        : 'hover:border-stone-300/80 hover:bg-stone-100/60 dark:hover:border-amber-600/60 dark:hover:bg-amber-900/10'
                    }`}
                  >
                    <Map className="h-4 w-4" />
                    <span className="hidden lg:inline">Maps</span>
                  </Button>
                </Link>
                <Link href="/media">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-2 transition-all active:translate-y-[2px] active:scale-[0.96] ${
                      active === 'media'
                        ? 'border-stone-300 bg-stone-100/70 text-stone-900 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-100'
                        : 'hover:border-stone-300/80 hover:bg-stone-100/60 dark:hover:border-amber-600/60 dark:hover:bg-amber-900/10'
                    }`}
                  >
                    <Clapperboard className="h-4 w-4" />
                    <span className="hidden lg:inline">Media</span>
                  </Button>
                </Link>
                <Link href="/scatter">
                  <Button
                    variant="outline"
                    size="sm"
                    className={`gap-2 transition-all active:translate-y-[2px] active:scale-[0.96] ${
                      active === 'scatter'
                        ? 'border-stone-300 bg-stone-100/70 text-stone-900 dark:border-amber-700/70 dark:bg-amber-900/20 dark:text-amber-100'
                        : 'hover:border-stone-300/80 hover:bg-stone-100/60 dark:hover:border-amber-600/60 dark:hover:bg-amber-900/10'
                    }`}
                  >
                    <ScatterChart className="h-4 w-4" />
                    <span className="hidden lg:inline">Scatter</span>
                  </Button>
                </Link>
                <Link href="/compare">
                  <Button
                    variant="outline"
                    size="sm"
                    className="group gap-2 border-amber-200/60 hover:border-amber-300/80 hover:bg-amber-50/40 dark:border-amber-700/40 dark:hover:border-amber-500/60 dark:hover:bg-amber-900/15 shadow-sm hover:shadow-[0_0_10px_rgba(245,158,11,0.1)] transition-all active:translate-y-[2px] active:scale-[0.96]"
                  >
                    <GitCompareArrows className="h-4 w-4 text-stone-700 dark:text-amber-200 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors" />
                    <span className="hidden lg:inline text-stone-700 dark:text-amber-200 group-hover:text-amber-700 dark:group-hover:text-amber-300 transition-colors">Compare</span>
                  </Button>
                </Link>
                <SettingsSheet
                  settings={settings}
                  onChange={onSettingsChange}
                  onReset={onSettingsReset}
                />
              </div>

              <div className="relative md:hidden">
                <button
                  type="button"
                  onClick={() => setIsMenuOpen((open) => !open)}
                  className="inline-flex items-center justify-center rounded-full border border-stone-200 bg-white p-2 text-stone-600 shadow-sm transition-colors hover:text-stone-900"
                  aria-label="Open menu"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div
                  className={`absolute right-0 mt-3 w-56 rounded-2xl border border-stone-200 bg-white shadow-xl transition-all ${
                    isMenuOpen ? 'opacity-100 translate-y-0' : 'pointer-events-none opacity-0 -translate-y-2'
                  }`}
                >
                  <div className="flex flex-col gap-1 p-3 text-sm text-stone-700">
                    <Link href="/methodology" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-stone-100">
                      Methodology
                    </Link>
                    <Link href="/caveats" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-stone-100">
                      Caveats
                    </Link>
                    <Link href="/maps" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-stone-100">
                      Maps
                    </Link>
                    <Link href="/media" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-stone-100">
                      Media
                    </Link>
                    <Link href="/scatter" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-stone-100">
                      Scatter
                    </Link>
                    <Link href="/compare" onClick={() => setIsMenuOpen(false)} className="rounded-lg px-3 py-2 hover:bg-stone-100">
                      Compare
                    </Link>
                    <div className="px-3 py-2">
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
