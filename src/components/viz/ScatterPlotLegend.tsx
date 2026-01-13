'use client';

import { DOMAIN_COLORS, ERA_COLORS, type ColorMode } from '@/types';

interface ScatterPlotLegendProps {
  colorMode: ColorMode;
}

export function ScatterPlotLegend({ colorMode }: ScatterPlotLegendProps) {
  if (colorMode === 'solid') return null;

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
      {colorMode === 'domain' && (
        <>
          {Object.entries(DOMAIN_COLORS).map(([domain, color]) => (
            <div key={domain} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-stone-600">{domain}</span>
            </div>
          ))}
        </>
      )}

      {colorMode === 'era' && (
        <>
          {Object.entries(ERA_COLORS).map(([era, color]) => (
            <div key={era} className="flex items-center gap-1.5">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: color }}
              />
              <span className="text-stone-600">{era}</span>
            </div>
          ))}
        </>
      )}

      {colorMode === 'variance' && (
        <>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-green-500" />
            <span className="text-stone-600">Low variance (consensus)</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-yellow-500" />
            <span className="text-stone-600">Medium variance</span>
          </div>
          <div className="flex items-center gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500" />
            <span className="text-stone-600">High variance (controversial)</span>
          </div>
        </>
      )}
    </div>
  );
}
