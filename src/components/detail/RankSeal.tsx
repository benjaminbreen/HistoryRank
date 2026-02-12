'use client';

import { DOMAIN_COLORS } from '@/types';

type WaxSealPalette = {
  border: string;
  outer: string;
  mid: string;
  inner: string;
  ring: string;
  text: string;
};

const DOMAIN_WAX_PALETTES: Record<string, WaxSealPalette> = {
  Science: { border: '#234b88', outer: '#5f95e3', mid: '#3d6fbe', inner: '#294b86', ring: 'rgba(214,232,255,0.38)', text: '#eef5ff' },
  Religion: { border: '#5f3e84', outer: '#9a72cc', mid: '#7654aa', inner: '#523875', ring: 'rgba(244,223,255,0.34)', text: '#f8efff' },
  Philosophy: { border: '#3f4e92', outer: '#6b7dd8', mid: '#4f60b5', inner: '#35407f', ring: 'rgba(226,233,255,0.34)', text: '#f2f6ff' },
  Politics: { border: '#7f111f', outer: '#be2a43', mid: '#931a2f', inner: '#641220', ring: 'rgba(255,220,225,0.32)', text: '#fff1f3' },
  Military: { border: '#7f3e13', outer: '#cf6b29', mid: '#a14d1f', inner: '#6f3313', ring: 'rgba(255,224,197,0.32)', text: '#fff3e8' },
  Arts: { border: '#17664f', outer: '#33ab86', mid: '#248366', inner: '#195d48', ring: 'rgba(215,255,241,0.3)', text: '#ebfff8' },
  Exploration: { border: '#1c5f67', outer: '#3ca9bb', mid: '#2f8390', inner: '#1f5f68', ring: 'rgba(214,247,255,0.3)', text: '#ebfbff' },
  Economics: { border: '#7a4b10', outer: '#cf9230', mid: '#9f6f22', inner: '#704d18', ring: 'rgba(255,236,202,0.32)', text: '#fff8e8' },
  Medicine: { border: '#7a1f57', outer: '#c85a9b', mid: '#9a3f77', inner: '#6d2c56', ring: 'rgba(255,225,244,0.34)', text: '#fff1f8' },
};

const DEFAULT_WAX_PALETTE: WaxSealPalette = DOMAIN_WAX_PALETTES.Politics;

function getWaxSealPalette(domain: string | null | undefined): WaxSealPalette {
  if (!domain) return DEFAULT_WAX_PALETTE;
  const direct = DOMAIN_WAX_PALETTES[domain];
  if (direct) return direct;
  if (DOMAIN_COLORS[domain]) return DEFAULT_WAX_PALETTE;
  return DEFAULT_WAX_PALETTE;
}

interface RankSealProps {
  rank: number | null | undefined;
  domain?: string | null;
  size?: number;
  className?: string;
}

export function RankSeal({ rank, domain, size = 72, className = '' }: RankSealProps) {
  if (rank == null) return null;

  const safeSize = Math.max(44, size);
  const outerInset = Math.max(2, Math.round(safeSize * 0.05));
  const innerInset = Math.max(7, Math.round(safeSize * 0.145));
  const digits = String(Math.abs(rank)).length;
  const palette = getWaxSealPalette(domain);
  const labelSize = digits <= 2 ? Math.round(safeSize * 0.11) : digits === 3 ? Math.round(safeSize * 0.1) : Math.round(safeSize * 0.09);
  const numberSize = digits <= 2 ? Math.round(safeSize * 0.31) : digits === 3 ? Math.round(safeSize * 0.26) : Math.round(safeSize * 0.21);

  return (
    <div
      className={`relative rounded-full border shadow-[inset_0_2px_3px_rgba(255,255,255,0.28),inset_0_-4px_6px_rgba(35,8,14,0.6),0_6px_12px_rgba(35,8,14,0.28)] ${className}`.trim()}
      style={{
        width: safeSize,
        height: safeSize,
        borderColor: palette.border,
        backgroundImage:
          `radial-gradient(circle at 30% 22%, rgba(255,255,255,0.18) 0%, rgba(255,255,255,0.05) 16%, transparent 30%), ` +
          `radial-gradient(circle at 28% 24%, ${palette.outer} 0%, ${palette.mid} 62%, ${palette.inner} 100%)`,
      }}
      aria-label={`Historical rank ${rank}`}
      role="img"
    >
      <div
        className="absolute rounded-full border"
        style={{
          inset: outerInset,
          borderColor: palette.ring,
          backgroundImage: 'repeating-conic-gradient(from 0deg, rgba(255,255,255,0.12) 0deg 10deg, rgba(0,0,0,0.08) 10deg 20deg)',
        }}
      />
      <div
        className="absolute rounded-full border shadow-[inset_0_2px_4px_rgba(255,255,255,0.2),inset_0_-2px_4px_rgba(20,4,8,0.55)]"
        style={{
          inset: innerInset,
          borderColor: palette.ring,
          backgroundImage:
            `radial-gradient(circle at 30% 24%, rgba(255,255,255,0.16) 0%, rgba(255,255,255,0.04) 18%, transparent 32%), ` +
            `radial-gradient(circle at 30% 25%, ${palette.outer} 0%, ${palette.mid} 60%, ${palette.inner} 100%)`,
        }}
      >
        <div className="flex h-full w-full flex-col items-center justify-center text-center">
          <span
            className="uppercase tracking-[0.18em]"
            style={{ color: palette.text, fontSize: `${labelSize}px`, lineHeight: 1 }}
          >
            Rank
          </span>
          <span
            className="mt-0.5 font-serif font-semibold leading-none drop-shadow-[0_1px_1px_rgba(30,5,10,0.7)]"
            style={{ color: palette.text, fontSize: `${numberSize}px` }}
          >
            #{rank}
          </span>
        </div>
      </div>
    </div>
  );
}
