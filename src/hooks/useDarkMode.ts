'use client';

import { useState, useEffect } from 'react';

export function useDarkMode() {
  const [isDarkMode, setIsDarkMode] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    // Check localStorage on mount
    const stored = localStorage.getItem('historyrank-dark-mode');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const shouldBeDark = stored ? stored === 'true' : prefersDark;
    setIsDarkMode(shouldBeDark);
    document.documentElement.classList.toggle('dark', shouldBeDark);

    const handleThemeEvent = (event: Event) => {
      const detail = (event as CustomEvent<boolean>).detail;
      if (typeof detail === 'boolean') {
        setIsDarkMode(detail);
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== 'historyrank-dark-mode') return;
      const nextValue = event.newValue === 'true';
      setIsDarkMode(nextValue);
      document.documentElement.classList.toggle('dark', nextValue);
    };

    window.addEventListener('historyrank:theme', handleThemeEvent as EventListener);
    window.addEventListener('storage', handleStorage);

    return () => {
      window.removeEventListener('historyrank:theme', handleThemeEvent as EventListener);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  const toggleDarkMode = () => {
    const newValue = !isDarkMode;
    setIsDarkMode(newValue);
    localStorage.setItem('historyrank-dark-mode', String(newValue));
    document.documentElement.classList.toggle('dark', newValue);
    window.dispatchEvent(new CustomEvent('historyrank:theme', { detail: newValue }));
  };

  return { isDarkMode, mounted, toggleDarkMode };
}
