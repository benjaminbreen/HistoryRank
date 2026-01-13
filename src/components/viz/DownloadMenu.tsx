'use client';

import { useState, useCallback } from 'react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Download, Image, FileCode, FileSpreadsheet, Loader2 } from 'lucide-react';
import type { ScatterDataPoint, ScatterPlotConfig, AXIS_LABELS } from '@/types';

interface DownloadMenuProps {
  chartRef: React.RefObject<HTMLDivElement | null>;
  data: ScatterDataPoint[];
  config: ScatterPlotConfig;
}

export function DownloadMenu({ chartRef, data, config }: DownloadMenuProps) {
  const [isExporting, setIsExporting] = useState(false);

  // Download as PNG
  const downloadPNG = useCallback(async () => {
    if (!chartRef.current) return;

    setIsExporting(true);
    try {
      // Dynamic import of html-to-image
      const { toPng } = await import('html-to-image');

      const svgElement = chartRef.current.querySelector('svg');
      if (!svgElement) return;

      const dataUrl = await toPng(chartRef.current, {
        backgroundColor: '#ffffff',
        pixelRatio: 2, // High resolution
        style: {
          padding: '20px',
        },
      });

      const link = document.createElement('a');
      link.download = `historyrank-scatter-${Date.now()}.png`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to export PNG:', error);
      alert('Failed to export PNG. Try again.');
    } finally {
      setIsExporting(false);
    }
  }, [chartRef]);

  // Download as SVG
  const downloadSVG = useCallback(async () => {
    if (!chartRef.current) return;

    setIsExporting(true);
    try {
      const { toSvg } = await import('html-to-image');

      const dataUrl = await toSvg(chartRef.current, {
        backgroundColor: '#ffffff',
      });

      const link = document.createElement('a');
      link.download = `historyrank-scatter-${Date.now()}.svg`;
      link.href = dataUrl;
      link.click();
    } catch (error) {
      console.error('Failed to export SVG:', error);
      alert('Failed to export SVG. Try again.');
    } finally {
      setIsExporting(false);
    }
  }, [chartRef]);

  // Download as CSV
  const downloadCSV = useCallback(() => {
    // Build CSV with current filtered data
    const headers = [
      'id',
      'name',
      'domain',
      'era',
      'birth_year',
      'hpi_rank',
      'llm_consensus_rank',
      'pageviews_2025',
      'variance_score',
    ];

    const rows = data.map(point => [
      point.id,
      `"${point.name.replace(/"/g, '""')}"`,
      point.domain || '',
      point.era || '',
      point.birthYear || '',
      point.hpiRank || '',
      point.llmConsensusRank || '',
      point.pageviews || '',
      point.varianceScore || '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `historyrank-data-${Date.now()}.csv`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
  }, [data]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" disabled={isExporting}>
          {isExporting ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Download className="h-4 w-4 mr-2" />
          )}
          Export
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs text-stone-500">
          Image Export
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={downloadPNG} className="cursor-pointer">
          <Image className="h-4 w-4 mr-2 text-stone-500" />
          Download PNG
          <span className="ml-auto text-xs text-stone-400">High-res</span>
        </DropdownMenuItem>
        <DropdownMenuItem onClick={downloadSVG} className="cursor-pointer">
          <FileCode className="h-4 w-4 mr-2 text-stone-500" />
          Download SVG
          <span className="ml-auto text-xs text-stone-400">Vector</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs text-stone-500">
          Data Export
        </DropdownMenuLabel>
        <DropdownMenuItem onClick={downloadCSV} className="cursor-pointer">
          <FileSpreadsheet className="h-4 w-4 mr-2 text-stone-500" />
          Download CSV
          <span className="ml-auto text-xs text-stone-400">{data.length} rows</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
