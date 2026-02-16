'use client';

import { useState, useEffect, useMemo, useRef } from 'react';

export type RankingMode = 'data-driven' | 'unweighted';

// Damped spring simulation for smooth physics animation
function useSpring(target: number, config = { stiffness: 170, damping: 18, mass: 1.2 }) {
  const [value, setValue] = useState(target);
  const ref = useRef({ value: target, velocity: 0, target, settled: true });
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const s = ref.current;
    s.target = target;
    if (s.settled && Math.abs(s.value - target) < 0.5) {
      // Snap for tiny changes (e.g., resize)
      s.value = target;
      setValue(target);
      return;
    }
    s.settled = false;

    const step = () => {
      const { stiffness, damping, mass } = config;
      const displacement = s.value - s.target;
      const springForce = -stiffness * displacement;
      const dampingForce = -damping * s.velocity;
      const acceleration = (springForce + dampingForce) / mass;
      const dt = 1 / 60;
      s.velocity += acceleration * dt;
      s.value += s.velocity * dt;

      if (Math.abs(s.velocity) < 0.1 && Math.abs(s.value - s.target) < 0.3) {
        s.value = s.target;
        s.velocity = 0;
        s.settled = true;
        setValue(s.target);
        return;
      }
      setValue(s.value);
      rafRef.current = requestAnimationFrame(step);
    };

    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafRef.current);
  }, [target, config.stiffness, config.damping, config.mass]);

  return value;
}

// Animated ranking mode toggle with sliding pill + glow
export function RankingModeToggle({
  rankingMode,
  onModeChange,
  disabled,
  openRankingTooltip,
  setOpenRankingTooltip,
}: {
  rankingMode: RankingMode;
  onModeChange: (mode: RankingMode) => void;
  disabled: boolean;
  openRankingTooltip: RankingMode | null;
  setOpenRankingTooltip: React.Dispatch<React.SetStateAction<RankingMode | null>>;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const ddBtnRef = useRef<HTMLButtonElement>(null);
  const uwBtnRef = useRef<HTMLButtonElement>(null);
  const pillRef = useRef<HTMLDivElement>(null);
  const [targetLeft, setTargetLeft] = useState(0);
  const [targetWidth, setTargetWidth] = useState(0);
  const [ready, setReady] = useState(false);

  // Measure active button position
  useEffect(() => {
    const activeBtn = rankingMode === 'data-driven' ? ddBtnRef.current : uwBtnRef.current;
    const container = containerRef.current;
    if (!activeBtn || !container) return;
    const cRect = container.getBoundingClientRect();
    const bRect = activeBtn.getBoundingClientRect();
    setTargetLeft(bRect.left - cRect.left);
    setTargetWidth(bRect.width);
    if (!ready) requestAnimationFrame(() => setReady(true));
  }, [rankingMode, ready]);

  // Spring-animated position — heavier mass for visible inertia + bounce
  const springConfig = useMemo(() => ({ stiffness: 160, damping: 16, mass: 1.5 }), []);
  const animLeft = useSpring(ready ? targetLeft : targetLeft, springConfig);
  // Width uses a slightly stiffer spring so it doesn't wobble as much
  const widthConfig = useMemo(() => ({ stiffness: 200, damping: 18, mass: 1.4 }), []);
  const animWidth = useSpring(ready ? targetWidth : targetWidth, widthConfig);

  // Compute animation progress (0 = settled, 1 = peak movement) for glow intensity
  const velocity = Math.abs(animLeft - targetLeft);
  const maxExpectedVelocity = 30;
  const motionProgress = Math.min(velocity / maxExpectedVelocity, 1);

  const isDataDriven = rankingMode === 'data-driven';
  // Interpolate colors smoothly via CSS transition on the pill element
  const emerald = { bg: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.45)', glow: 'rgba(16, 185, 129,' };
  const sky = { bg: 'rgba(14, 165, 233, 0.12)', border: 'rgba(14, 165, 233, 0.45)', glow: 'rgba(14, 165, 233,' };
  const c = isDataDriven ? emerald : sky;
  // Glow intensifies during motion, settles to subtle resting glow
  const glowIntensity = 0.08 + motionProgress * 0.3;
  const glowSpread = 8 + motionProgress * 14;
  const innerGlow = 0.04 + motionProgress * 0.08;

  const handleLongPress = (mode: RankingMode) => {
    const timer = setTimeout(() => setOpenRankingTooltip(t => t === mode ? null : mode), 400);
    const clear = () => clearTimeout(timer);
    window.addEventListener('touchend', clear, { once: true });
    window.addEventListener('touchmove', clear, { once: true });
  };

  return (
    <div
      ref={containerRef}
      className="relative inline-flex items-center rounded-full border border-stone-200/70 dark:border-slate-700/50 bg-white/70 dark:bg-slate-800/30 p-1 shadow-inner shadow-black/[0.03] dark:shadow-black/20"
    >
      {/* Sliding pill indicator — position driven by spring physics */}
      <div
        ref={pillRef}
        className="absolute top-1 bottom-1 rounded-full pointer-events-none"
        style={{
          left: animLeft,
          width: animWidth,
          backgroundColor: c.bg,
          border: `1px solid ${c.border}`,
          boxShadow: `0 0 ${glowSpread}px ${c.glow}${glowIntensity}), inset 0 1px 0 rgba(255,255,255,${innerGlow})`,
          // Only color/shadow transitions use CSS — position is spring-driven
          transition: ready
            ? 'background-color 0.5s ease, border-color 0.5s ease'
            : 'none',
        }}
      />

      {/* Data-Driven button */}
      <div className="relative group z-10">
        <button
          ref={ddBtnRef}
          onClick={() => onModeChange('data-driven')}
          onContextMenu={(e) => { e.preventDefault(); setOpenRankingTooltip(t => t === 'data-driven' ? null : 'data-driven'); }}
          onTouchStart={() => handleLongPress('data-driven')}
          disabled={disabled}
          className={`relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ${
            disabled
              ? 'text-stone-400 dark:text-slate-500 cursor-not-allowed'
              : isDataDriven
                ? 'text-emerald-900 dark:text-emerald-100'
                : 'text-stone-600 dark:text-slate-300 hover:text-stone-800 dark:hover:text-slate-100'
          }`}
        >
          Data-Driven Avg
        </button>
        <div
          className={`absolute right-0 top-full mt-5 w-80 max-w-[calc(100vw-2rem)] p-3.5 bg-stone-900/95 dark:bg-slate-950/95 backdrop-blur-sm text-white text-xs rounded-xl shadow-2xl z-50 border border-white/[0.06] transition-all duration-300 ease-out origin-top-right ${
            openRankingTooltip === 'data-driven'
              ? 'opacity-100 visible translate-y-0 scale-100'
              : 'opacity-0 invisible translate-y-1.5 scale-[0.97] group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:scale-100'
          }`}
        >
          <div className="absolute top-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-emerald-400/50 to-transparent" />
          <div className="font-semibold mb-2">Data-Driven Average</div>
          <p className="text-stone-300 dark:text-slate-300 mb-2.5 leading-relaxed">
            Quality-weighted consensus across v1+v2+v3 lists, excluding the bottom 10 known-bad lists.
          </p>
          <div className="space-y-1.5 text-[10px] text-stone-400 dark:text-slate-400">
            <div className="flex justify-between"><span>Opus 4.6 / 4.5</span><span className="text-emerald-400">0.875 / 0.843</span></div>
            <div className="flex justify-between"><span>GPT 5.3 / 5.2</span><span className="text-emerald-400">0.826 / 0.778</span></div>
            <div className="flex justify-between"><span>Claude Sonnet 4.5</span><span className="text-amber-400">0.799</span></div>
            <div className="flex justify-between"><span>Gemini Pro / Flash</span><span className="text-amber-400">0.748 / 0.723</span></div>
            <div className="flex justify-between"><span>Grok 4 / 4.1</span><span className="text-orange-400">0.713 / 0.677</span></div>
            <div className="flex justify-between"><span>GLM / Qwen</span><span className="text-orange-400">0.623 / 0.513</span></div>
            <div className="flex justify-between"><span>DeepSeek / Mistral</span><span className="text-red-400">0.465 / 0.443</span></div>
          </div>
          <div className="absolute -top-[5px] right-5 w-2.5 h-2.5 bg-stone-900/95 dark:bg-slate-950/95 rotate-45 border-l border-t border-white/[0.06]" />
        </div>
      </div>

      {/* Unweighted button */}
      <div className="relative group z-10">
        <button
          ref={uwBtnRef}
          onClick={() => onModeChange('unweighted')}
          onContextMenu={(e) => { e.preventDefault(); setOpenRankingTooltip(t => t === 'unweighted' ? null : 'unweighted'); }}
          onTouchStart={() => handleLongPress('unweighted')}
          disabled={disabled}
          className={`relative rounded-full px-3 py-1.5 text-xs font-medium transition-colors duration-300 ${
            disabled
              ? 'text-stone-400 dark:text-slate-500 cursor-not-allowed'
              : !isDataDriven
                ? 'text-sky-900 dark:text-sky-100'
                : 'text-stone-600 dark:text-slate-300 hover:text-stone-800 dark:hover:text-slate-100'
          }`}
        >
          Unweighted Rankings
        </button>
        <div
          className={`absolute right-0 top-full mt-5 w-72 max-w-[calc(100vw-2rem)] p-3.5 bg-stone-900/95 dark:bg-slate-950/95 backdrop-blur-sm text-white text-xs rounded-xl shadow-2xl z-50 border border-white/[0.06] transition-all duration-300 ease-out origin-top-right ${
            openRankingTooltip === 'unweighted'
              ? 'opacity-100 visible translate-y-0 scale-100'
              : 'opacity-0 invisible translate-y-1.5 scale-[0.97] group-hover:opacity-100 group-hover:visible group-hover:translate-y-0 group-hover:scale-100'
          }`}
        >
          <div className="absolute top-0 left-3 right-3 h-px bg-gradient-to-r from-transparent via-sky-400/50 to-transparent" />
          <div className="font-semibold mb-2">Unweighted Rankings</div>
          <p className="text-stone-300 dark:text-slate-300 mb-2.5 leading-relaxed">
            Equal-weight consensus across v1+v2+v3 lists. No model weights and no bottom-10 exclusion.
          </p>
          <p className="text-stone-400 dark:text-slate-400 leading-relaxed">
            Includes all available v1+v2+v3 lists with equal weight; list count is higher than data-driven because no bottom-list exclusions are applied.
          </p>
          <div className="absolute -top-[5px] right-5 w-2.5 h-2.5 bg-stone-900/95 dark:bg-slate-950/95 rotate-45 border-l border-t border-white/[0.06]" />
        </div>
      </div>
    </div>
  );
}
