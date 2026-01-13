'use client';

import { useState } from 'react';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import {
  ChevronDown,
  ChevronUp,
  RotateCcw,
  ArrowRightLeft,
  Search,
  X,
} from 'lucide-react';
import {
  AXIS_LABELS,
  DOMAIN_COLORS,
  ERA_COLORS,
  type ScatterPlotConfig,
  type AxisOption,
  type ColorMode,
  type SizeMode,
} from '@/types';

interface ScatterPlotControlsProps {
  config: ScatterPlotConfig;
  onConfigChange: (config: ScatterPlotConfig) => void;
  availableSources: string[];
  pointCount: number;
}

const ALL_DOMAINS = Object.keys(DOMAIN_COLORS);
const ALL_ERAS = Object.keys(ERA_COLORS);

export function ScatterPlotControls({
  config,
  onConfigChange,
  availableSources,
  pointCount,
}: ScatterPlotControlsProps) {
  const [isExpanded, setIsExpanded] = useState(true);

  const updateConfig = (updates: Partial<ScatterPlotConfig>) => {
    onConfigChange({ ...config, ...updates });
  };

  const swapAxes = () => {
    updateConfig({
      xAxis: config.yAxis,
      yAxis: config.xAxis,
    });
  };

  const resetConfig = () => {
    onConfigChange({
      xAxis: 'hpiRank',
      yAxis: 'llmConsensusRank',
      colorMode: 'domain',
      sizeMode: 'fixed',
      showDiagonal: true,
      showTrendLine: false,
      showOutlierLabels: true,
      domains: [],
      eras: [],
      rankRange: [1, 1000],
      highlightSearch: '',
    });
  };

  // Build axis options including available LLM sources
  const axisOptions: { value: AxisOption; label: string }[] = [
    { value: 'hpiRank', label: AXIS_LABELS['hpiRank'] },
    { value: 'llmConsensusRank', label: AXIS_LABELS['llmConsensusRank'] },
    { value: 'pageviews', label: AXIS_LABELS['pageviews'] },
    ...availableSources.map(source => ({
      value: source as AxisOption,
      label: AXIS_LABELS[source as AxisOption] || source,
    })),
  ];

  const toggleDomain = (domain: string) => {
    const newDomains = config.domains.includes(domain)
      ? config.domains.filter(d => d !== domain)
      : [...config.domains, domain];
    updateConfig({ domains: newDomains });
  };

  const toggleEra = (era: string) => {
    const newEras = config.eras.includes(era)
      ? config.eras.filter(e => e !== era)
      : [...config.eras, era];
    updateConfig({ eras: newEras });
  };

  return (
    <div className="bg-white border border-stone-200 rounded-lg shadow-sm">
      {/* Header */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-stone-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-stone-900">Settings</span>
          <span className="text-xs text-stone-500">
            {pointCount} points
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="h-4 w-4 text-stone-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-stone-400" />
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-4 space-y-5 border-t border-stone-100">
          {/* Axes */}
          <div className="pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-stone-500">Axes</Label>
              <Button
                variant="ghost"
                size="sm"
                onClick={swapAxes}
                className="h-7 px-2 text-xs"
              >
                <ArrowRightLeft className="h-3 w-3 mr-1" />
                Swap
              </Button>
            </div>

            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 w-6">X:</span>
                <Select
                  value={config.xAxis}
                  onValueChange={(v) => updateConfig({ xAxis: v as AxisOption })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {axisOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs text-stone-500 w-6">Y:</span>
                <Select
                  value={config.yAxis}
                  onValueChange={(v) => updateConfig({ yAxis: v as AxisOption })}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {axisOptions.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* Color coding */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-stone-500">Color by</Label>
            <Select
              value={config.colorMode}
              onValueChange={(v) => updateConfig({ colorMode: v as ColorMode })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="domain">Domain</SelectItem>
                <SelectItem value="era">Era</SelectItem>
                <SelectItem value="variance">Variance (Controversy)</SelectItem>
                <SelectItem value="solid">Solid Color</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Point size */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-stone-500">Point Size</Label>
            <Select
              value={config.sizeMode}
              onValueChange={(v) => updateConfig({ sizeMode: v as SizeMode })}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="fixed">Fixed</SelectItem>
                <SelectItem value="pageviews">By Pageviews</SelectItem>
                <SelectItem value="variance">By Variance</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Visual options */}
          <div className="space-y-3">
            <Label className="text-xs uppercase tracking-wide text-stone-500">Display</Label>

            <div className="flex items-center justify-between">
              <Label htmlFor="diagonal" className="text-sm text-stone-700">
                Reference line
              </Label>
              <Switch
                id="diagonal"
                checked={config.showDiagonal}
                onCheckedChange={(v) => updateConfig({ showDiagonal: v })}
              />
            </div>

            <div className="flex items-center justify-between">
              <Label htmlFor="outliers" className="text-sm text-stone-700">
                Outlier labels
              </Label>
              <Switch
                id="outliers"
                checked={config.showOutlierLabels}
                onCheckedChange={(v) => updateConfig({ showOutlierLabels: v })}
              />
            </div>
          </div>

          {/* Rank range */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-stone-500">Rank Range</Label>
              <span className="text-xs text-stone-500">
                #{config.rankRange[0]} – #{config.rankRange[1]}
              </span>
            </div>
            <Slider
              value={config.rankRange}
              onValueChange={(v) => updateConfig({ rankRange: v as [number, number] })}
              min={1}
              max={1000}
              step={10}
              className="w-full"
            />
          </div>

          {/* Domain filter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-stone-500">Domains</Label>
              {config.domains.length > 0 && (
                <button
                  onClick={() => updateConfig({ domains: [] })}
                  className="text-xs text-stone-500 hover:text-stone-700"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_DOMAINS.map(domain => (
                <Badge
                  key={domain}
                  variant={config.domains.includes(domain) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs py-0.5"
                  style={{
                    backgroundColor: config.domains.includes(domain)
                      ? DOMAIN_COLORS[domain]
                      : 'transparent',
                    borderColor: DOMAIN_COLORS[domain],
                    color: config.domains.includes(domain) ? 'white' : DOMAIN_COLORS[domain],
                  }}
                  onClick={() => toggleDomain(domain)}
                >
                  {domain}
                </Badge>
              ))}
            </div>
          </div>

          {/* Era filter */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase tracking-wide text-stone-500">Eras</Label>
              {config.eras.length > 0 && (
                <button
                  onClick={() => updateConfig({ eras: [] })}
                  className="text-xs text-stone-500 hover:text-stone-700"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ALL_ERAS.map(era => (
                <Badge
                  key={era}
                  variant={config.eras.includes(era) ? 'default' : 'outline'}
                  className="cursor-pointer text-xs py-0.5"
                  style={{
                    backgroundColor: config.eras.includes(era)
                      ? ERA_COLORS[era]
                      : 'transparent',
                    borderColor: ERA_COLORS[era],
                    color: config.eras.includes(era) ? 'white' : ERA_COLORS[era],
                  }}
                  onClick={() => toggleEra(era)}
                >
                  {era}
                </Badge>
              ))}
            </div>
          </div>

          {/* Search highlight */}
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wide text-stone-500">Highlight</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-stone-400" />
              <Input
                placeholder="Search to highlight..."
                value={config.highlightSearch}
                onChange={(e) => updateConfig({ highlightSearch: e.target.value })}
                className="pl-8 h-8 text-sm"
              />
              {config.highlightSearch && (
                <button
                  onClick={() => updateConfig({ highlightSearch: '' })}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2"
                >
                  <X className="h-4 w-4 text-stone-400 hover:text-stone-600" />
                </button>
              )}
            </div>
          </div>

          {/* Reset */}
          <Button
            variant="outline"
            size="sm"
            onClick={resetConfig}
            className="w-full"
          >
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset to Defaults
          </Button>
        </div>
      )}
    </div>
  );
}
