'use client';

import { useEffect, useState } from 'react';

export type Settings = {
  density: 'comfortable' | 'compact';
  thumbnailSize: 'sm' | 'md' | 'lg';
  fontScale: number;
  showRegion: boolean;
  showEra: boolean;
  showViews: boolean;
  showVariance: boolean;
};

export const defaultSettings: Settings = {
  density: 'comfortable',
  thumbnailSize: 'md',
  fontScale: 1,
  showRegion: true,
  showEra: true,
  showViews: true,
  showVariance: true,
};

const STORAGE_KEY = 'historyrank-settings-v1';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return;
    try {
      const parsed = JSON.parse(stored) as Partial<Settings>;
      setSettings((current) => ({ ...current, ...parsed }));
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    if (!mounted) return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  }, [settings, mounted]);

  const updateSettings = (patch: Partial<Settings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const resetSettings = () => {
    setSettings(defaultSettings);
  };

  return { settings, updateSettings, resetSettings, mounted };
}
