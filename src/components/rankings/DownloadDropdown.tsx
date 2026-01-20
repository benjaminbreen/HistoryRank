'use client';

import { useState, useRef, useEffect } from 'react';
import { Download, FileJson, FileSpreadsheet, FileText, FileType, X } from 'lucide-react';

interface FigureData {
  id: string;
  name: string;
  llmRank: number | null;
  hpiRank?: number | null;
  domain?: string | null;
  era?: string | null;
  regionSub?: string | null;
  varianceScore?: number | null;
  pageviews?: number | null;
}

interface DownloadDropdownProps {
  figures: FigureData[];
  filters?: {
    domain?: string | null;
    era?: string | null;
    region?: string | null;
    search?: string;
    modelSource?: string | null;
    useWeightedAvg?: boolean;
  };
}

export function DownloadDropdown({ figures, filters }: DownloadDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isDownloading, setIsDownloading] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Close on escape
  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === 'Escape') setIsOpen(false);
    }
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const getFilename = (ext: string) => {
    const date = new Date().toISOString().split('T')[0];
    const filterParts: string[] = [];
    if (filters?.domain) filterParts.push(filters.domain.toLowerCase().replace(/\s+/g, '-'));
    if (filters?.era) filterParts.push(filters.era.toLowerCase().replace(/\s+/g, '-'));
    if (filters?.useWeightedAvg) filterParts.push('weighted');
    const suffix = filterParts.length > 0 ? `-${filterParts.join('-')}` : '';
    return `historyrank${suffix}-${date}.${ext}`;
  };

  const downloadFile = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPlaintext = async () => {
    setIsDownloading('txt');
    try {
      // Generate plaintext: just rank and name
      const lines = figures
        .filter(f => f.llmRank !== null)
        .map((f, i) => `${i + 1}. ${f.name}`);

      const header = [
        'HistoryRank - Historical Figures Ranked by AI Consensus',
        `Generated: ${new Date().toLocaleString()}`,
        `Total figures: ${lines.length}`,
        filters?.domain ? `Domain: ${filters.domain}` : null,
        filters?.era ? `Era: ${filters.era}` : null,
        filters?.useWeightedAvg ? 'Using quality-weighted average' : null,
        '',
        '---',
        '',
      ].filter(Boolean).join('\n');

      const content = header + lines.join('\n');
      downloadFile(content, getFilename('txt'), 'text/plain');
    } finally {
      setIsDownloading(null);
      setIsOpen(false);
    }
  };

  const handleDownloadCSV = async () => {
    setIsDownloading('csv');
    try {
      // Build query params
      const params = new URLSearchParams();
      params.set('format', 'csv');
      if (filters?.domain) params.set('domain', filters.domain);
      if (filters?.era) params.set('era', filters.era);
      if (filters?.region) params.set('region', filters.region);

      const response = await fetch(`/api/export/figures?${params}`);
      if (!response.ok) throw new Error('Export failed');

      const content = await response.text();
      downloadFile(content, getFilename('csv'), 'text/csv');
    } catch (error) {
      console.error('CSV download failed:', error);
    } finally {
      setIsDownloading(null);
      setIsOpen(false);
    }
  };

  const handleDownloadJSON = async () => {
    setIsDownloading('json');
    try {
      // Build query params
      const params = new URLSearchParams();
      params.set('format', 'json');
      if (filters?.domain) params.set('domain', filters.domain);
      if (filters?.era) params.set('era', filters.era);
      if (filters?.region) params.set('region', filters.region);

      const response = await fetch(`/api/export/figures?${params}`);
      if (!response.ok) throw new Error('Export failed');

      const data = await response.json();
      const content = JSON.stringify(data, null, 2);
      downloadFile(content, getFilename('json'), 'application/json');
    } catch (error) {
      console.error('JSON download failed:', error);
    } finally {
      setIsDownloading(null);
      setIsOpen(false);
    }
  };

  const handleDownloadPDF = async () => {
    setIsDownloading('pdf');
    try {
      // Create a nicely formatted HTML document for printing as PDF
      const figureRows = figures
        .filter(f => f.llmRank !== null)
        .slice(0, 500) // Limit for PDF
        .map((f, i) => `
          <tr style="border-bottom: 1px solid #e5e5e5;">
            <td style="padding: 8px 12px; font-weight: 600; color: #78716c; width: 50px;">${i + 1}</td>
            <td style="padding: 8px 12px; font-weight: 500;">${f.name}</td>
            <td style="padding: 8px 12px; color: #78716c; font-size: 13px;">${f.domain || ''}</td>
            <td style="padding: 8px 12px; color: #78716c; font-size: 13px;">${f.era || ''}</td>
          </tr>
        `).join('');

      const filterInfo = [
        filters?.domain ? `Domain: ${filters.domain}` : null,
        filters?.era ? `Era: ${filters.era}` : null,
        filters?.region ? `Region: ${filters.region}` : null,
        filters?.useWeightedAvg ? 'Quality-weighted average' : null,
      ].filter(Boolean);

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <title>HistoryRank - Historical Figures</title>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
            }
            body {
              font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              max-width: 800px;
              margin: 0 auto;
              padding: 40px 20px;
              color: #1c1917;
              line-height: 1.5;
            }
            .header {
              text-align: center;
              margin-bottom: 40px;
              padding-bottom: 20px;
              border-bottom: 2px solid #d97706;
            }
            .header h1 {
              font-size: 28px;
              font-weight: 700;
              margin: 0 0 8px;
              color: #1c1917;
            }
            .header .subtitle {
              color: #78716c;
              font-size: 14px;
            }
            .filters {
              background: #fef3c7;
              padding: 12px 16px;
              border-radius: 8px;
              margin-bottom: 24px;
              font-size: 13px;
              color: #92400e;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 14px;
            }
            thead th {
              text-align: left;
              padding: 12px;
              background: #fafaf9;
              font-weight: 600;
              font-size: 11px;
              text-transform: uppercase;
              letter-spacing: 0.05em;
              color: #78716c;
              border-bottom: 2px solid #e5e5e5;
            }
            .footer {
              margin-top: 40px;
              padding-top: 20px;
              border-top: 1px solid #e5e5e5;
              font-size: 12px;
              color: #a8a29e;
              text-align: center;
            }
            .footer a {
              color: #d97706;
              text-decoration: none;
            }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>HistoryRank</h1>
            <div class="subtitle">Historical Figures Ranked by AI Consensus</div>
          </div>

          ${filterInfo.length > 0 ? `<div class="filters">Filters: ${filterInfo.join(' | ')}</div>` : ''}

          <table>
            <thead>
              <tr>
                <th>Rank</th>
                <th>Name</th>
                <th>Domain</th>
                <th>Era</th>
              </tr>
            </thead>
            <tbody>
              ${figureRows}
            </tbody>
          </table>

          <div class="footer">
            Generated ${new Date().toLocaleString()} | ${figures.filter(f => f.llmRank !== null).length} figures total<br>
            <a href="https://historyrank.org">historyrank.org</a> | Created by Benjamin Breen, UC Santa Cruz
          </div>
        </body>
        </html>
      `;

      // Open in new window for printing
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        // Trigger print dialog after a brief delay for rendering
        setTimeout(() => {
          printWindow.print();
        }, 250);
      }
    } finally {
      setIsDownloading(null);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium transition-all
          ${isOpen
            ? 'bg-stone-100 text-stone-700 border border-stone-300 shadow-sm dark:bg-slate-700 dark:text-slate-200 dark:border-slate-600'
            : 'bg-white/70 text-stone-600 border border-stone-200/70 hover:bg-white hover:border-stone-300 hover:shadow-sm dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800'
          }
        `}
        aria-expanded={isOpen}
        aria-haspopup="true"
      >
        <Download className="w-3.5 h-3.5" />
        <span>Download</span>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 top-full mt-2 w-56 rounded-xl border border-stone-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-stone-100 dark:border-slate-700">
            <div className="flex items-center justify-between px-2">
              <span className="text-xs font-medium text-stone-500 dark:text-slate-400 uppercase tracking-wider">
                Export Format
              </span>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md hover:bg-stone-100 dark:hover:bg-slate-700 text-stone-400 dark:text-slate-500"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="p-1">
            <button
              onClick={handleDownloadPDF}
              disabled={isDownloading !== null}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-stone-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                <FileType className="w-4 h-4 text-red-600 dark:text-red-400" />
              </div>
              <div className="text-left">
                <div className="font-medium">PDF</div>
                <div className="text-xs text-stone-500 dark:text-slate-400">Print-ready format</div>
              </div>
              {isDownloading === 'pdf' && <Spinner />}
            </button>

            <button
              onClick={handleDownloadJSON}
              disabled={isDownloading !== null}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-stone-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                <FileJson className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="text-left">
                <div className="font-medium">JSON</div>
                <div className="text-xs text-stone-500 dark:text-slate-400">Full data with metadata</div>
              </div>
              {isDownloading === 'json' && <Spinner />}
            </button>

            <button
              onClick={handleDownloadCSV}
              disabled={isDownloading !== null}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-stone-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="text-left">
                <div className="font-medium">CSV</div>
                <div className="text-xs text-stone-500 dark:text-slate-400">Spreadsheet compatible</div>
              </div>
              {isDownloading === 'csv' && <Spinner />}
            </button>

            <button
              onClick={handleDownloadPlaintext}
              disabled={isDownloading !== null}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-stone-700 dark:text-slate-200 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors disabled:opacity-50"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
                <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="text-left">
                <div className="font-medium">Plain Text</div>
                <div className="text-xs text-stone-500 dark:text-slate-400">Just rank and name</div>
              </div>
              {isDownloading === 'txt' && <Spinner />}
            </button>
          </div>

          <div className="p-2 border-t border-stone-100 dark:border-slate-700 bg-stone-50 dark:bg-slate-900/50">
            <div className="text-[10px] text-stone-400 dark:text-slate-500 px-2">
              {figures.filter(f => f.llmRank !== null).length} figures will be exported
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin ml-auto h-4 w-4 text-amber-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
    </svg>
  );
}
