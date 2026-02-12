'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import Link from 'next/link';
import { Clapperboard, Map, ScatterChart, Menu, X, GitCompareArrows, Award, ChevronDown, BookOpen, FileText, AlertTriangle, Sun, Moon, Share2 } from 'lucide-react';
import { SettingsSheet } from '@/components/settings/SettingsSheet';
import { AboutDialog } from '@/components/about/AboutDialog';
import { useDarkMode } from '@/hooks/useDarkMode';
import type { Settings } from '@/hooks/useSettings';

type AppHeaderProps = {
  active?: 'about' | 'methodology' | 'caveats' | 'maps' | 'scatter' | 'influence' | 'compare' | 'media' | 'table' | 'benchmarks';
  settings: Settings;
  onSettingsChange: (patch: Partial<Settings>) => void;
  onSettingsReset: () => void;
  figureCount?: number;
};

const PAGE_LABELS: Record<string, string> = {
  table: 'Rankings',
  maps: 'Maps',
  scatter: 'Scatter',
  influence: 'Influence Graph',
  media: 'Media Atlas',
  compare: 'Compare',
  benchmarks: 'Benchmarks',
  about: 'About',
  methodology: 'Methodology',
  caveats: 'Caveats',
};

export function AppHeader({
  active,
  settings,
  onSettingsChange,
  onSettingsReset,
  figureCount,
}: AppHeaderProps) {
  const { isDarkMode, mounted, toggleDarkMode } = useDarkMode();
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [isCompactHeader, setIsCompactHeader] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<'visualize' | 'analyze' | 'about' | null>(null);
  const visualizeRef = useRef<HTMLDivElement>(null);
  const analyzeRef = useRef<HTMLDivElement>(null);
  const aboutRef = useRef<HTMLDivElement>(null);
  const dropdownTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const headerRef = useRef<HTMLElement>(null);

  // Compact on scroll (hysteresis to prevent oscillation)
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setIsCompactHeader((prev) => {
        if (prev) return y > 12;   // stay compact until near top
        return y > 48;              // compact once scrolled past 48px
      });
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Set CSS variable for header height
  useEffect(() => {
    const setHeaderHeightVar = () => {
      const height = headerRef.current?.offsetHeight;
      if (!height) return;
      document.documentElement.style.setProperty('--app-header-height', `${height}px`);
    };
    setHeaderHeightVar();
    const observer = new ResizeObserver(() => setHeaderHeightVar());
    if (headerRef.current) observer.observe(headerRef.current);
    window.addEventListener('resize', setHeaderHeightVar, { passive: true });
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', setHeaderHeightVar);
    };
  }, [isCompactHeader]);

  // Close dropdowns on outside click or Escape key
  useEffect(() => {
    if (!openDropdown) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        (visualizeRef.current && visualizeRef.current.contains(target)) ||
        (analyzeRef.current && analyzeRef.current.contains(target)) ||
        (aboutRef.current && aboutRef.current.contains(target))
      ) return;
      setOpenDropdown(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpenDropdown(null);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [openDropdown]);

  // Close mobile menu on outside click or Escape
  useEffect(() => {
    if (!isMenuOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('[data-mobile-menu]') || target.closest('[data-menu-trigger]')) return;
      setIsMenuOpen(false);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isMenuOpen]);

  // Cleanup timer
  useEffect(() => {
    return () => {
      if (dropdownTimerRef.current) clearTimeout(dropdownTimerRef.current);
    };
  }, []);

  const openDropdownMenu = useCallback((name: 'visualize' | 'analyze' | 'about') => {
    clearTimeout(dropdownTimerRef.current);
    setOpenDropdown(name);
  }, []);

  const closeDropdownMenu = useCallback(() => {
    dropdownTimerRef.current = setTimeout(() => setOpenDropdown(null), 150);
  }, []);

  const isVisualizeActive = active === 'maps' || active === 'scatter' || active === 'influence';
  const isAnalyzeActive = active === 'compare' || active === 'benchmarks';
  const isAboutActive = active === 'about' || active === 'methodology' || active === 'caveats';
  const pageLabel = active ? PAGE_LABELS[active] || null : null;

  return (
    <>
      {/* Gold accent ribbon */}
      <div
        className="h-[2.5px] relative"
        style={{ background: 'linear-gradient(90deg, #c9a55c 0%, #d4a574 40%, #a8bed2 75%, #7a8fa8 100%)' }}
      >
        {/* Warm glow beneath ribbon in dark mode */}
        <div className="hidden dark:block absolute top-full left-0 right-0 h-[12px] pointer-events-none"
          style={{ background: 'linear-gradient(180deg, rgba(201,165,92,0.12) 0%, transparent 100%)' }}
        />
      </div>

      <header
        ref={headerRef}
        className="sticky top-0 z-50 transition-all duration-300 ease-out"
        style={{
          background: mounted && isDarkMode
            ? 'linear-gradient(180deg, rgba(12, 14, 20, 0.96) 0%, rgba(17, 19, 27, 0.93) 100%)'
            : 'rgba(250, 250, 247, 0.84)',
          backdropFilter: 'blur(24px) saturate(1.6)',
          WebkitBackdropFilter: 'blur(24px) saturate(1.6)',
          borderBottom: '1px solid',
          borderColor: mounted && isDarkMode ? 'rgba(201,165,92,0.12)' : 'rgba(0,0,0,0.05)',
          boxShadow: mounted && isDarkMode
            ? '0 1px 0 rgba(201,165,92,0.06) inset, 0 4px 24px rgba(0,0,0,0.4)'
            : '0 1px 3px rgba(0,0,0,0.04)',
        }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6">
          {/* ── Primary row ── */}
          <div
            className="flex items-center justify-between"
            style={{
              height: isCompactHeader ? '52px' : '56px',
              transition: 'height 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
            }}
          >
            {/* Logo */}
            <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
              <button
                onClick={() => setIsAboutOpen(true)}
                className="flex-shrink-0 rounded-[7px] border flex items-center justify-center font-serif font-bold tracking-wide transition-all duration-200 hover:scale-[1.06]"
                style={{
                  width: isCompactHeader ? '26px' : '30px',
                  height: isCompactHeader ? '26px' : '30px',
                  fontSize: isCompactHeader ? '9px' : '11px',
                  borderColor: mounted && isDarkMode ? 'rgba(201,165,92,0.3)' : '#c4b99a',
                  background: mounted && isDarkMode
                    ? 'linear-gradient(145deg, rgba(38, 42, 52, 1), rgba(22, 25, 34, 1))'
                    : 'linear-gradient(145deg, #faf5eb, #f0e8d8)',
                  color: mounted && isDarkMode ? '#d4b880' : '#7a6630',
                  transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
                aria-label="Open About"
              >
                HR
              </button>
              <Link href="/" className="block min-w-0 group">
                <h1
                  className="font-serif font-semibold text-stone-900 dark:text-amber-100 truncate leading-snug group-hover:text-stone-700 dark:group-hover:text-amber-200 transition-colors duration-200"
                  style={{
                    fontSize: isCompactHeader ? '17px' : '20px',
                    letterSpacing: '-0.015em',
                    transition: 'font-size 0.3s cubic-bezier(0.4, 0, 0.2, 1), color 0.2s',
                  }}
                >
                  History<span className="font-bold">Rank</span>
                </h1>
              </Link>
            </div>

            {/* ── Desktop navigation ── */}
            <nav className="hidden md:flex items-center gap-[2px]">
              {/* Rankings */}
              <NavLink href="/" isActive={active === 'table'}>Rankings</NavLink>

              {/* Visualize dropdown (Maps + Scatter) */}
              <div
                ref={visualizeRef}
                className="relative"
                onMouseEnter={() => openDropdownMenu('visualize')}
                onMouseLeave={closeDropdownMenu}
              >
                <button
                  onClick={() => setOpenDropdown(o => o === 'visualize' ? null : 'visualize')}
                  className={`flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all duration-150 relative ${
                    isVisualizeActive
                      ? 'text-stone-900 dark:text-amber-100 bg-[rgba(201,165,92,0.08)]'
                      : 'text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 hover:bg-black/[0.035] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  Visualize
                  <ChevronDown className={`h-3 w-3 opacity-50 transition-transform duration-200 ${openDropdown === 'visualize' ? 'rotate-180' : ''}`} />
                  {isVisualizeActive && (
                    <span className="absolute -bottom-[1px] left-2.5 right-2.5 h-[2px] bg-[#c9a55c] rounded-[1px]" />
                  )}
                </button>

                <DropdownPanel isOpen={openDropdown === 'visualize'} isDarkMode={mounted && isDarkMode}>
                  <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-stone-400 dark:text-slate-500">
                    Data views
                  </div>
                  <DropdownItem href="/maps" icon={<Map />} desc="Geographic" isActive={active === 'maps'} onClick={() => setOpenDropdown(null)}>
                    Maps
                  </DropdownItem>
                  <DropdownItem href="/scatter" icon={<ScatterChart />} desc="Correlations" isActive={active === 'scatter'} onClick={() => setOpenDropdown(null)}>
                    Scatter
                  </DropdownItem>
                  <DropdownItem href="/influence" icon={<Share2 />} desc="Network" isActive={active === 'influence'} onClick={() => setOpenDropdown(null)}>
                    Influence
                  </DropdownItem>
                </DropdownPanel>
              </div>

              {/* Media Atlas — standalone sub-app, visually distinct */}
              <Link
                href="/media"
                className={`relative flex items-center gap-1.5 px-3 py-1 text-[13px] font-medium rounded-full border transition-all duration-150 ${
                  active === 'media'
                    ? 'text-stone-900 dark:text-amber-100 bg-amber-50 dark:bg-amber-900/20 border-amber-300/60 dark:border-amber-700/50'
                    : 'text-stone-500 dark:text-slate-400 border-stone-200/70 dark:border-slate-600/50 hover:text-stone-900 dark:hover:text-amber-200 hover:border-stone-300 dark:hover:border-slate-500 hover:bg-stone-50 dark:hover:bg-white/[0.06]'
                }`}
              >
                <Clapperboard className="h-3.5 w-3.5" />
                Media Atlas
              </Link>

              <div className="w-px h-[18px] bg-stone-300/40 dark:bg-slate-600/40 mx-1.5" />

              {/* Analyze dropdown (Compare, Benchmarks) */}
              <div
                ref={analyzeRef}
                className="relative"
                onMouseEnter={() => openDropdownMenu('analyze')}
                onMouseLeave={closeDropdownMenu}
              >
                <button
                  onClick={() => setOpenDropdown(o => o === 'analyze' ? null : 'analyze')}
                  className={`flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all duration-150 relative ${
                    isAnalyzeActive
                      ? 'text-stone-900 dark:text-amber-100 bg-[rgba(201,165,92,0.08)]'
                      : 'text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 hover:bg-black/[0.035] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  Analyze
                  <ChevronDown className={`h-3 w-3 opacity-50 transition-transform duration-200 ${openDropdown === 'analyze' ? 'rotate-180' : ''}`} />
                  {isAnalyzeActive && (
                    <span className="absolute -bottom-[1px] left-2.5 right-2.5 h-[2px] bg-[#c9a55c] rounded-[1px]" />
                  )}
                </button>

                <DropdownPanel isOpen={openDropdown === 'analyze'} isDarkMode={mounted && isDarkMode}>
                  <DropdownItem href="/compare" icon={<GitCompareArrows />} desc="Side by side" isActive={active === 'compare'} onClick={() => setOpenDropdown(null)}>
                    Compare
                  </DropdownItem>
                  <DropdownItem href="/benchmarks" icon={<Award />} desc="LLM accuracy" isActive={active === 'benchmarks'} onClick={() => setOpenDropdown(null)}>
                    Benchmarks
                  </DropdownItem>
                </DropdownPanel>
              </div>

              {/* About dropdown (Overview, Methodology, Caveats) */}
              <div
                ref={aboutRef}
                className="relative"
                onMouseEnter={() => openDropdownMenu('about')}
                onMouseLeave={closeDropdownMenu}
              >
                <button
                  onClick={() => setOpenDropdown(o => o === 'about' ? null : 'about')}
                  className={`flex items-center gap-1 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all duration-150 relative ${
                    isAboutActive
                      ? 'text-stone-900 dark:text-amber-100 bg-[rgba(201,165,92,0.08)]'
                      : 'text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 hover:bg-black/[0.035] dark:hover:bg-white/[0.06]'
                  }`}
                >
                  About
                  <ChevronDown className={`h-3 w-3 opacity-50 transition-transform duration-200 ${openDropdown === 'about' ? 'rotate-180' : ''}`} />
                  {isAboutActive && (
                    <span className="absolute -bottom-[1px] left-2.5 right-2.5 h-[2px] bg-[#c9a55c] rounded-[1px]" />
                  )}
                </button>

                <DropdownPanel isOpen={openDropdown === 'about'} isDarkMode={mounted && isDarkMode} align="right">
                  <DropdownItem href="/about" icon={<BookOpen />} desc="The project" isActive={active === 'about'} onClick={() => setOpenDropdown(null)}>
                    Overview
                  </DropdownItem>
                  <DropdownItem href="/methodology" icon={<FileText />} desc="How it works" isActive={active === 'methodology'} onClick={() => setOpenDropdown(null)}>
                    Methodology
                  </DropdownItem>
                  <DropdownItem href="/caveats" icon={<AlertTriangle />} desc="Limitations" isActive={active === 'caveats'} onClick={() => setOpenDropdown(null)}>
                    Caveats
                  </DropdownItem>
                </DropdownPanel>
              </div>

              <div className="w-px h-[18px] bg-stone-300/40 dark:bg-slate-600/40 mx-1.5" />

              <ThemeToggleButton
                isDarkMode={mounted && isDarkMode}
                onToggle={toggleDarkMode}
                className="mr-1.5"
              />

              <SettingsSheet
                settings={settings}
                onChange={onSettingsChange}
                onReset={onSettingsReset}
              />
            </nav>

            {/* ── Mobile navigation ── */}
            <div className="flex items-center gap-1.5 md:hidden">
              {/* Current page indicator on mobile */}
              {pageLabel && active !== 'table' && (
                <span className="text-xs font-medium text-stone-500 dark:text-slate-400 truncate max-w-[120px]">
                  {pageLabel}
                </span>
              )}
              <ThemeToggleButton
                isDarkMode={mounted && isDarkMode}
                onToggle={toggleDarkMode}
                mobile
              />
              <button
                type="button"
                data-menu-trigger
                onClick={() => setIsMenuOpen(o => !o)}
                className="inline-flex items-center justify-center rounded-lg border border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-300 shadow-sm transition-all hover:text-stone-900 dark:hover:text-slate-100 hover:border-stone-300 dark:hover:border-slate-500 w-10 h-10"
                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
              >
                {isMenuOpen ? <X className="h-[18px] w-[18px]" /> : <Menu className="h-[18px] w-[18px]" />}
              </button>
            </div>
          </div>

          {/* ── Secondary row — breadcrumb (collapses on scroll, hidden on mobile) ── */}
          {pageLabel && (
            <div
              className="hidden sm:flex items-center gap-4 text-[11px] tracking-[0.04em] uppercase overflow-hidden transition-all duration-300"
              style={{
                maxHeight: isCompactHeader ? '0px' : '28px',
                paddingBottom: isCompactHeader ? '0px' : '8px',
                opacity: isCompactHeader ? 0 : 1,
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
            >
              <Link href="/" className="text-stone-400 dark:text-slate-500 hover:text-stone-600 dark:hover:text-slate-300 transition-colors">
                Home
              </Link>
              <span className="text-stone-300 dark:text-slate-600">/</span>
              <span className="text-stone-600 dark:text-slate-300 font-semibold">{pageLabel}</span>
              {figureCount != null && figureCount > 0 && (
                <span
                  className="ml-auto font-mono text-stone-400 dark:text-slate-500 tabular-nums normal-case"
                  style={{ letterSpacing: '0', fontVariantNumeric: 'tabular-nums' }}
                >
                  {figureCount.toLocaleString()} figures
                </span>
              )}
            </div>
          )}
        </div>

        {/* ── Mobile menu ── */}
        <div
          data-mobile-menu
          className={`md:hidden border-t border-stone-200/60 dark:border-slate-700/60 overflow-hidden transition-all duration-300 ease-out ${
            isMenuOpen ? 'max-h-[80vh] opacity-100' : 'max-h-0 opacity-0'
          }`}
        >
          <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3">
            <div className="flex flex-col gap-0.5">
              {/* Main pages */}
              <MobileNavLink href="/" icon={<span className="text-base">📊</span>} isActive={active === 'table'} onClick={() => setIsMenuOpen(false)}>
                Rankings
              </MobileNavLink>
              <MobileNavLink href="/media" icon={<Clapperboard className="h-4 w-4" />} isActive={active === 'media'} onClick={() => setIsMenuOpen(false)}>
                Media Atlas
              </MobileNavLink>

              <div className="my-1.5 mx-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400 dark:text-slate-500 px-3 pb-1">Visualize</div>
              </div>
              <MobileNavLink href="/maps" icon={<Map className="h-4 w-4" />} isActive={active === 'maps'} onClick={() => setIsMenuOpen(false)}>
                Maps
              </MobileNavLink>
              <MobileNavLink href="/scatter" icon={<ScatterChart className="h-4 w-4" />} isActive={active === 'scatter'} onClick={() => setIsMenuOpen(false)}>
                Scatter
              </MobileNavLink>
              <MobileNavLink href="/influence" icon={<Share2 className="h-4 w-4" />} isActive={active === 'influence'} onClick={() => setIsMenuOpen(false)}>
                Influence
              </MobileNavLink>

              <div className="my-1.5 mx-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400 dark:text-slate-500 px-3 pb-1">Analyze</div>
              </div>
              <MobileNavLink href="/compare" icon={<GitCompareArrows className="h-4 w-4" />} isActive={active === 'compare'} onClick={() => setIsMenuOpen(false)}>
                Compare
              </MobileNavLink>
              <MobileNavLink href="/benchmarks" icon={<Award className="h-4 w-4" />} isActive={active === 'benchmarks'} onClick={() => setIsMenuOpen(false)}>
                Benchmarks
              </MobileNavLink>

              <div className="my-1.5 mx-1">
                <div className="text-[10px] font-semibold uppercase tracking-[0.12em] text-stone-400 dark:text-slate-500 px-3 pb-1">About</div>
              </div>
              <MobileNavLink href="/about" icon={<BookOpen className="h-4 w-4" />} isActive={active === 'about'} onClick={() => setIsMenuOpen(false)}>
                Overview
              </MobileNavLink>
              <MobileNavLink href="/methodology" icon={<FileText className="h-4 w-4" />} isActive={active === 'methodology'} onClick={() => setIsMenuOpen(false)}>
                Methodology
              </MobileNavLink>
              <MobileNavLink href="/caveats" icon={<AlertTriangle className="h-4 w-4" />} isActive={active === 'caveats'} onClick={() => setIsMenuOpen(false)}>
                Caveats
              </MobileNavLink>

              <div className="h-px bg-stone-200/60 dark:bg-slate-700/60 mx-1 my-2" />

              <div className="px-3 py-1">
                <SettingsSheet
                  settings={settings}
                  onChange={onSettingsChange}
                  onReset={onSettingsReset}
                />
              </div>
            </div>
          </div>
        </div>
      </header>

      <AboutDialog open={isAboutOpen} onOpenChange={setIsAboutOpen} />
    </>
  );
}

/* ── Dropdown panel (shared between Visualize and More) ── */
function DropdownPanel({
  isOpen,
  isDarkMode,
  align = 'center',
  children,
}: {
  isOpen: boolean;
  isDarkMode: boolean | undefined;
  align?: 'center' | 'right';
  children: React.ReactNode;
}) {
  const positionClass = align === 'right'
    ? 'right-0'
    : 'left-1/2 -translate-x-1/2';

  return (
    <div
      className={`absolute top-[calc(100%+6px)] ${positionClass} min-w-[210px] bg-white dark:bg-[#181b24] border rounded-[10px] p-1 transition-all duration-[180ms] ease-out ${
        isOpen
          ? `opacity-100 pointer-events-auto translate-y-0 ${align === 'center' ? '-translate-x-1/2' : ''}`
          : `opacity-0 pointer-events-none -translate-y-1 ${align === 'center' ? '-translate-x-1/2' : ''}`
      }`}
      style={{
        borderColor: isDarkMode ? 'rgba(201,165,92,0.15)' : 'rgba(0,0,0,0.08)',
        boxShadow: isDarkMode
          ? '0 8px 30px rgba(0,0,0,0.5), 0 2px 8px rgba(0,0,0,0.3), 0 0 1px rgba(201,165,92,0.1)'
          : '0 8px 30px rgba(0,0,0,0.1), 0 2px 8px rgba(0,0,0,0.04)',
      }}
    >
      {children}
    </div>
  );
}

/* ── Dropdown item ── */
function DropdownItem({
  href,
  icon,
  desc,
  isActive,
  onClick,
  secondary,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  desc?: string;
  isActive: boolean;
  onClick: () => void;
  secondary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium rounded-[7px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
        isActive
          ? 'text-stone-900 dark:text-amber-100 bg-stone-50 dark:bg-slate-700/50'
          : secondary
            ? 'text-stone-400 dark:text-slate-400 hover:bg-stone-50 dark:hover:bg-slate-700/50 hover:text-stone-700 dark:hover:text-slate-200'
            : 'text-stone-500 dark:text-slate-300 hover:bg-stone-50 dark:hover:bg-slate-700/50 hover:text-stone-900 dark:hover:text-amber-100'
      }`}
    >
      <span className={`h-4 w-4 flex-shrink-0 [&>svg]:h-4 [&>svg]:w-4 ${isActive ? 'text-stone-500 dark:text-slate-400' : 'text-stone-400 dark:text-slate-500'}`}>
        {icon}
      </span>
      <span>{children}</span>
      {desc && (
        <span className="text-[11px] text-stone-400 dark:text-slate-500 font-normal ml-auto whitespace-nowrap">{desc}</span>
      )}
    </Link>
  );
}

/* ── Nav link (primary, desktop) ── */
function NavLink({
  href,
  isActive,
  icon,
  children,
}: {
  href: string;
  isActive: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`relative flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-md transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 ${
        isActive
          ? 'text-stone-900 dark:text-amber-100'
          : 'text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 hover:bg-black/[0.035] dark:hover:bg-white/[0.06]'
      }`}
    >
      {icon && <span className={isActive ? 'opacity-70' : 'opacity-50'}>{icon}</span>}
      {children}
      {isActive && (
        <span className="absolute -bottom-[1px] left-2.5 right-2.5 h-[2px] bg-[#c9a55c] rounded-[1px]" />
      )}
    </Link>
  );
}

/* ── Mobile nav link ── */
function MobileNavLink({
  href,
  icon,
  isActive,
  onClick,
  secondary,
  children,
}: {
  href: string;
  icon: React.ReactNode;
  isActive: boolean;
  onClick: () => void;
  secondary?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className={`rounded-lg px-3 py-2.5 min-h-[44px] flex items-center gap-3 transition-colors text-sm ${
        isActive
          ? 'bg-amber-50/60 dark:bg-amber-900/15 text-stone-900 dark:text-amber-100 font-medium border-l-2 border-[#c9a55c] ml-0 pl-[10px]'
          : secondary
            ? 'text-stone-500 dark:text-slate-400 hover:bg-stone-100/60 dark:hover:bg-slate-700/40 hover:text-stone-700 dark:hover:text-slate-200'
            : 'text-stone-700 dark:text-slate-200 hover:bg-stone-100/60 dark:hover:bg-slate-700/40'
      }`}
    >
      <span className={`flex-shrink-0 ${isActive ? 'text-[#c9a55c]' : secondary ? 'text-stone-400 dark:text-slate-500' : 'text-stone-400 dark:text-slate-500'}`}>
        {icon}
      </span>
      {children}
    </Link>
  );
}

function ThemeToggleButton({
  isDarkMode,
  onToggle,
  mobile = false,
  className,
}: {
  isDarkMode: boolean;
  onToggle: () => void;
  mobile?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
      title={isDarkMode ? 'Light mode' : 'Dark mode'}
      className={`inline-flex items-center justify-center rounded-lg border transition-all ${
        mobile
          ? 'w-10 h-10 border-stone-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-stone-600 dark:text-slate-300 hover:text-stone-900 dark:hover:text-slate-100 hover:border-stone-300 dark:hover:border-slate-500'
          : 'w-8 h-8 border-stone-200/70 dark:border-slate-600/50 bg-white/70 dark:bg-slate-800/60 text-stone-500 dark:text-slate-400 hover:text-stone-900 dark:hover:text-amber-200 hover:border-stone-300/80 dark:hover:border-slate-500'
      } ${className ?? ''}`}
    >
      {isDarkMode ? <Sun className="h-3.5 w-3.5" /> : <Moon className="h-3.5 w-3.5" />}
    </button>
  );
}
