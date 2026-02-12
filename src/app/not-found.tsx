'use client';

import { useEffect, useState } from 'react';
import { AppHeader } from '@/components/layout/AppHeader';
import { useSettings } from '@/hooks/useSettings';
import { NotFound404Ozymandias } from '@/components/404/Ozymandias';
import { NotFound404HereBeDragons } from '@/components/404/HereBeDragons';
import { NotFound404RomanRuins } from '@/components/404/RomanRuins';

/**
 * 404 variant registry.
 * The page randomly picks one on each load.
 */
const VARIANTS = [
  NotFound404Ozymandias,
  NotFound404HereBeDragons,
  NotFound404RomanRuins,
] as const;

export default function NotFoundPage() {
  const { settings, updateSettings, resetSettings } = useSettings();
  const [VariantComponent, setVariantComponent] = useState<(typeof VARIANTS)[number] | null>(null);

  useEffect(() => {
    const pick = VARIANTS[Math.floor(Math.random() * VARIANTS.length)];
    setVariantComponent(() => pick);
  }, []);

  if (!VariantComponent) return null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent text-stone-900 dark:text-slate-100">
      <AppHeader
        active={undefined}
        settings={settings}
        onSettingsChange={updateSettings}
        onSettingsReset={resetSettings}
      />
      <VariantComponent />
    </div>
  );
}
