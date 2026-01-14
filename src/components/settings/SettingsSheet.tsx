'use client';

import { Instrument_Sans } from 'next/font/google';
import { Menu, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Sheet, SheetContent, SheetFooter, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet';
import { useDarkMode } from '@/hooks/useDarkMode';
import type { Settings } from '@/hooks/useSettings';

const instrument = Instrument_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
});

type SettingsSheetProps = {
  settings: Settings;
  onChange: (patch: Partial<Settings>) => void;
  onReset: () => void;
};

const densityOptions: Array<{ id: Settings['density']; label: string; hint: string }> = [
  { id: 'comfortable', label: 'Comfort', hint: 'More air between rows' },
  { id: 'compact', label: 'Compact', hint: 'Tighter, information-first' },
];

const thumbnailOptions: Array<{ id: Settings['thumbnailSize']; label: string }> = [
  { id: 'sm', label: 'Small' },
  { id: 'md', label: 'Medium' },
  { id: 'lg', label: 'Large' },
];

export function SettingsSheet({ settings, onChange, onReset }: SettingsSheetProps) {
  const { isDarkMode, toggleDarkMode } = useDarkMode();

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" aria-label="Open settings">
          <Menu className="h-4 w-4" />
        </Button>
      </SheetTrigger>
      <SheetContent
        className={`${instrument.className} w-[340px] border-stone-200/70 bg-stone-50/95 backdrop-blur-xl dark:border-slate-700/60 dark:bg-slate-950/90`}
      >
        <SheetHeader className="gap-2">
          <div className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm ring-1 ring-stone-200/60 dark:bg-slate-900 dark:ring-slate-700/60">
            <SlidersHorizontal className="h-4 w-4 text-stone-700 dark:text-slate-200" />
          </div>
          <div>
            <SheetTitle className="text-lg font-semibold text-stone-900 dark:text-slate-100">Settings</SheetTitle>
            <p className="text-sm text-stone-500 dark:text-slate-400">
              Tune the table for your workflow.
            </p>
          </div>
        </SheetHeader>

        <div className="space-y-5 px-4">
          <section className="rounded-2xl border border-stone-200/70 bg-white/90 p-4 shadow-sm transition-shadow duration-300 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/80">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">Theme</h3>
                <p className="text-xs text-stone-500 dark:text-slate-400">Switch between light and dark.</p>
              </div>
              <button
                type="button"
                aria-label={isDarkMode ? 'Switch to light mode' : 'Switch to dark mode'}
                onClick={toggleDarkMode}
                className={`relative h-10 w-28 rounded-full border border-stone-200/70 transition-colors duration-300 ${
                  isDarkMode ? 'bg-slate-900 dark:border-slate-700/60' : 'bg-amber-50'
                }`}
              >
                <span
                  className={`absolute inset-0 rounded-full transition-opacity duration-300 ${
                    isDarkMode ? 'opacity-30' : 'opacity-70'
                  }`}
                  style={{
                    backgroundImage: isDarkMode
                      ? 'radial-gradient(circle at 20% 20%, rgba(148, 163, 184, 0.4), transparent 55%), radial-gradient(circle at 80% 80%, rgba(148, 163, 184, 0.25), transparent 55%)'
                      : 'radial-gradient(circle at 20% 20%, rgba(251, 191, 36, 0.35), transparent 60%), radial-gradient(circle at 80% 80%, rgba(252, 211, 77, 0.35), transparent 60%)',
                  }}
                />
                <span
                  className="absolute top-1 left-0 h-8 w-8 rounded-full bg-white shadow-md transition-transform duration-300"
                  style={{ transform: `translateX(${isDarkMode ? 72 : 4}px)` }}
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    className={`transition-all duration-300 ${
                      isDarkMode ? 'opacity-40 scale-90' : 'opacity-100 scale-100'
                    }`}
                  >
                    <circle cx="12" cy="12" r="4.5" stroke="#D97706" strokeWidth="1.6" />
                    <path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.2 5.2l1.8 1.8M17 17l1.8 1.8M5.2 18.8L7 17M17 7l1.8-1.8" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="absolute right-2 top-1/2 -translate-y-1/2">
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    className={`transition-all duration-300 ${
                      isDarkMode ? 'opacity-100 scale-100' : 'opacity-35 scale-90'
                    }`}
                  >
                    <path
                      d="M21 15.5A8.5 8.5 0 1 1 8.5 3c.6 0 1.2.06 1.76.18A6.5 6.5 0 0 0 21 15.5Z"
                      stroke="#E2E8F0"
                      strokeWidth="1.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <circle cx="16.5" cy="7.5" r="0.9" fill="#E2E8F0" />
                    <circle cx="19" cy="10" r="0.6" fill="#E2E8F0" />
                  </svg>
                </span>
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/70 bg-white/90 p-4 shadow-sm transition-shadow duration-300 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/80">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">Density</h3>
                <p className="text-xs text-stone-500 dark:text-slate-400">Adjust spacing for the table view.</p>
              </div>
            </div>
            <div className="mt-3 flex rounded-full bg-stone-100 p-1 dark:bg-slate-800">
              {densityOptions.map((option) => {
                const isActive = settings.density === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => onChange({ density: option.id })}
                    className={`flex-1 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                      isActive
                        ? 'bg-white text-stone-900 shadow-sm dark:bg-slate-100 dark:text-slate-900'
                        : 'text-stone-500 hover:text-stone-700 dark:text-slate-400 dark:hover:text-slate-200'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-[11px] text-stone-400">
              {densityOptions.find((option) => option.id === settings.density)?.hint}
            </p>
          </section>

          <section className="rounded-2xl border border-stone-200/70 bg-white/90 p-4 shadow-sm transition-shadow duration-300 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/80">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">Font size</h3>
            <p className="text-xs text-stone-500 dark:text-slate-400">Scale the table text.</p>
            <div className="mt-3">
              <input
                type="range"
                min={90}
                max={115}
                step={5}
                value={Math.round(settings.fontScale * 100)}
                onChange={(event) => onChange({ fontScale: Number(event.target.value) / 100 })}
                className="w-full accent-stone-900 dark:accent-amber-200"
              />
              <div className="mt-2 flex justify-between text-[11px] text-stone-400 dark:text-slate-500">
                <span>Smaller</span>
                <span>{Math.round(settings.fontScale * 100)}%</span>
                <span>Larger</span>
              </div>
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/70 bg-white/90 p-4 shadow-sm transition-shadow duration-300 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/80">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">Portrait size</h3>
            <p className="text-xs text-stone-500 dark:text-slate-400">Scale the thumbnail portraits.</p>
            <div className="mt-3 flex gap-2">
              {thumbnailOptions.map((option) => {
                const isActive = settings.thumbnailSize === option.id;
                return (
                  <button
                    key={option.id}
                    onClick={() => onChange({ thumbnailSize: option.id })}
                    className={`flex-1 rounded-xl border px-3 py-2 text-xs font-medium transition-all duration-200 ${
                      isActive
                        ? 'border-stone-300 bg-stone-900 text-stone-50 shadow-sm dark:border-slate-600 dark:bg-slate-100 dark:text-slate-900'
                        : 'border-stone-200 bg-white text-stone-600 hover:border-stone-300 dark:border-slate-700 dark:bg-slate-900/60 dark:text-slate-300'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-stone-200/70 bg-white/90 p-4 shadow-sm transition-shadow duration-300 hover:shadow-md dark:border-slate-700/60 dark:bg-slate-900/80">
            <h3 className="text-sm font-semibold text-stone-900 dark:text-slate-100">Columns</h3>
            <p className="text-xs text-stone-500 dark:text-slate-400">Choose what appears in the list.</p>
            <div className="mt-3 space-y-3">
              <label className="flex items-center justify-between text-sm text-stone-700 dark:text-slate-300">
                <span>Region tag</span>
                <Switch
                  checked={settings.showRegion}
                  onCheckedChange={(checked) => onChange({ showRegion: checked })}
                />
              </label>
              <label className="flex items-center justify-between text-sm text-stone-700 dark:text-slate-300">
                <span>Era</span>
                <Switch
                  checked={settings.showEra}
                  onCheckedChange={(checked) => onChange({ showEra: checked })}
                />
              </label>
              <label className="flex items-center justify-between text-sm text-stone-700 dark:text-slate-300">
                <span>Variance</span>
                <Switch
                  checked={settings.showVariance}
                  onCheckedChange={(checked) => onChange({ showVariance: checked })}
                />
              </label>
              <label className="flex items-center justify-between text-sm text-stone-700 dark:text-slate-300">
                <span>Views</span>
                <Switch
                  checked={settings.showViews}
                  onCheckedChange={(checked) => onChange({ showViews: checked })}
                />
              </label>
            </div>
          </section>
        </div>

        <SheetFooter className="gap-2 border-t border-stone-200/70 dark:border-slate-700/60">
          <Button
            variant="ghost"
            className="w-full text-stone-500 hover:text-stone-800 dark:text-slate-400 dark:hover:text-slate-100"
            onClick={onReset}
          >
            Reset to defaults
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
