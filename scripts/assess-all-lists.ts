#!/usr/bin/env npx tsx
/**
 * Batch List Quality Assessment Script
 *
 * Scans all list files in data/raw/ and generates quality reports.
 * Produces both individual reports and a summary CSV.
 *
 * Usage:
 *   npx tsx scripts/assess-all-lists.ts [options]
 *
 * Options:
 *   --dir=<path>       Directory to scan (default: data/raw)
 *   --output=<path>    Output directory for reports (default: data/quality-reports)
 *   --summary-only     Only output summary, don't generate individual reports
 *   --failing-only     Only show lists that FAIL quality checks
 *   --rerun            Re-assess all lists, even if reports already exist
 */

import fs from 'node:fs';
import path from 'node:path';
import {
  assessListQuality,
  formatReportAsText,
  parseListFile,
  type QualityReport,
  type QualityStatus,
} from './lib/assess-list-quality.js';

type Options = {
  inputDir: string;
  outputDir: string;
  summaryOnly: boolean;
  failingOnly: boolean;
  rerun: boolean;
};

function parseArgs(): Options {
  const args = process.argv.slice(2);
  const options: Options = {
    inputDir: path.join(process.cwd(), 'data', 'raw'),
    outputDir: path.join(process.cwd(), 'data', 'quality-reports'),
    summaryOnly: false,
    failingOnly: false,
    rerun: false,
  };

  for (const arg of args) {
    if (arg.startsWith('--dir=')) {
      options.inputDir = path.resolve(arg.slice('--dir='.length));
    } else if (arg.startsWith('--output=')) {
      options.outputDir = path.resolve(arg.slice('--output='.length));
    } else if (arg === '--summary-only') {
      options.summaryOnly = true;
    } else if (arg === '--failing-only') {
      options.failingOnly = true;
    } else if (arg === '--rerun') {
      options.rerun = true;
    }
  }

  return options;
}

function extractModelFromFilename(filename: string): string {
  // Extract model name from filename like "Claude Opus 4.5 LIST 1 (January 15, 2026).txt"
  const match = filename.match(/^(.+?) LIST \d+/i);
  if (match) {
    return match[1].trim();
  }
  return 'unknown';
}

function findListFiles(dir: string): string[] {
  if (!fs.existsSync(dir)) {
    return [];
  }

  return fs.readdirSync(dir)
    .filter(file =>
      file.endsWith('.txt') &&
      file.includes('LIST') &&
      !file.includes('.quality.')
    )
    .sort();
}

function formatVerdict(verdict: QualityStatus): string {
  const colors: Record<QualityStatus, string> = {
    'PASS': '\x1b[32m',
    'WARN': '\x1b[33m',
    'FAIL': '\x1b[31m',
  };
  const reset = '\x1b[0m';
  return `${colors[verdict]}${verdict}${reset}`;
}

function generateSummaryCSV(reports: QualityReport[]): string {
  const headers = [
    'File',
    'Model',
    'Verdict',
    'Exact Duplicates',
    'Fuzzy Duplicates',
    'Max Pattern Sequence',
    'Entry Count',
    'Anchor Coverage',
    'Summary',
  ];

  const rows = reports.map(r => [
    r.file,
    r.model,
    r.verdict,
    r.scores.repetition.exact.toString(),
    r.scores.repetition.fuzzy.toString(),
    r.scores.pattern_collapse.maxSequence.toString(),
    r.scores.structural.entries.toString(),
    `${r.scores.anchor_coverage.found}/${r.scores.anchor_coverage.expected}`,
    `"${r.summary.replace(/"/g, '""')}"`,
  ]);

  return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
}

type ModelStats = {
  model: string;
  listCount: number;
  avgDuplicates: number;
  avgMaxSequence: number;
  avgAnchorCoverage: number;
  passCount: number;
  warnCount: number;
  failCount: number;
  qualityScore: number; // 0-100, higher is better
};

function calculateModelStats(reports: QualityReport[]): ModelStats[] {
  const byModel = new Map<string, QualityReport[]>();
  for (const report of reports) {
    // Normalize model names (handle case variations)
    const normalizedModel = report.model.toLowerCase().replace(/\s+/g, ' ').trim();
    const existing = byModel.get(normalizedModel) || [];
    existing.push(report);
    byModel.set(normalizedModel, existing);
  }

  const stats: ModelStats[] = [];

  for (const [, modelReports] of byModel) {
    const avgDupes = modelReports.reduce((sum, r) => sum + r.scores.repetition.exact, 0) / modelReports.length;
    const avgSeq = modelReports.reduce((sum, r) => sum + r.scores.pattern_collapse.maxSequence, 0) / modelReports.length;
    const avgAnchor = modelReports.reduce((sum, r) => sum + (r.scores.anchor_coverage.found / r.scores.anchor_coverage.expected), 0) / modelReports.length;

    // Calculate quality score (0-100)
    // Penalize: duplicates (up to -40), pattern collapse (up to -40), missing anchors (up to -20)
    let score = 100;
    score -= Math.min(40, avgDupes * 0.5);  // -0.5 per duplicate, max -40
    score -= Math.min(40, avgSeq * 2);       // -2 per sequence length, max -40
    score -= Math.min(20, (1 - avgAnchor) * 100);  // penalty for missing anchors
    score = Math.max(0, score);

    stats.push({
      model: modelReports[0].model, // Use original casing from first report
      listCount: modelReports.length,
      avgDuplicates: avgDupes,
      avgMaxSequence: avgSeq,
      avgAnchorCoverage: avgAnchor,
      passCount: modelReports.filter(r => r.verdict === 'PASS').length,
      warnCount: modelReports.filter(r => r.verdict === 'WARN').length,
      failCount: modelReports.filter(r => r.verdict === 'FAIL').length,
      qualityScore: score,
    });
  }

  // Sort by quality score descending
  stats.sort((a, b) => b.qualityScore - a.qualityScore);
  return stats;
}

function generateSummaryMarkdown(reports: QualityReport[]): string {
  const modelStats = calculateModelStats(reports);

  const lines: string[] = [
    '# List Quality Assessment Summary',
    '',
    `Generated: ${new Date().toISOString()}`,
    '',
    `Total lists assessed: ${reports.length}`,
    `- PASS: ${reports.filter(r => r.verdict === 'PASS').length}`,
    `- WARN: ${reports.filter(r => r.verdict === 'WARN').length}`,
    `- FAIL: ${reports.filter(r => r.verdict === 'FAIL').length}`,
    '',
    '## Model Quality Ranking',
    '',
    'Models ranked by quality score (0-100). Higher is better.',
    '',
    '| Rank | Model | Score | Lists | Avg Duplicates | Avg Max Sequence | Anchor Coverage |',
    '|------|-------|-------|-------|----------------|------------------|-----------------|',
  ];

  let rank = 1;
  for (const stat of modelStats) {
    const scoreEmoji = stat.qualityScore >= 80 ? '🟢' : stat.qualityScore >= 50 ? '🟡' : '🔴';
    lines.push(`| ${rank} | ${stat.model} | ${scoreEmoji} ${stat.qualityScore.toFixed(0)} | ${stat.listCount} | ${stat.avgDuplicates.toFixed(1)} | ${stat.avgMaxSequence.toFixed(1)} | ${(stat.avgAnchorCoverage * 100).toFixed(0)}% |`);
    rank++;
  }

  const failingReports = reports.filter(r => r.verdict === 'FAIL');
  if (failingReports.length > 0) {
    lines.push('', '## Failing Lists', '');
    for (const report of failingReports) {
      lines.push(`### ${report.file}`);
      lines.push(`- **Model:** ${report.model}`);
      lines.push(`- **Issues:** ${report.summary}`);
      if (report.issues.length > 0) {
        lines.push('- **Details:**');
        for (const issue of report.issues.slice(0, 5)) {
          if (issue.type === 'exact_duplicate') {
            lines.push(`  - Exact duplicate: "${issue.name}" at ranks ${issue.ranks.join(', ')}`);
          } else if (issue.type === 'pattern_collapse') {
            lines.push(`  - Pattern collapse: "${issue.pattern}" (${issue.count} entries)`);
          }
        }
      }
      lines.push('');
    }
  }

  const warningReports = reports.filter(r => r.verdict === 'WARN');
  if (warningReports.length > 0) {
    lines.push('', '## Warning Lists', '');
    for (const report of warningReports) {
      lines.push(`- **${report.file}** (${report.model}): ${report.summary}`);
    }
  }

  return lines.join('\n');
}

async function main() {
  const options = parseArgs();

  console.log('🔍 List Quality Assessment');
  console.log(`   Input directory: ${options.inputDir}`);
  console.log(`   Output directory: ${options.outputDir}`);
  console.log('');

  const listFiles = findListFiles(options.inputDir);

  if (listFiles.length === 0) {
    console.log('No list files found.');
    return;
  }

  console.log(`Found ${listFiles.length} list files to assess.\n`);

  fs.mkdirSync(options.outputDir, { recursive: true });

  const reports: QualityReport[] = [];
  let passCount = 0;
  let warnCount = 0;
  let failCount = 0;

  for (const file of listFiles) {
    const model = extractModelFromFilename(file);

    // Check if report already exists
    const reportPath = path.join(options.outputDir, file.replace(/\.txt$/, '.quality.json'));
    if (!options.rerun && fs.existsSync(reportPath)) {
      try {
        const existingReport = JSON.parse(fs.readFileSync(reportPath, 'utf8')) as QualityReport;
        reports.push(existingReport);

        if (existingReport.verdict === 'PASS') passCount++;
        else if (existingReport.verdict === 'WARN') warnCount++;
        else failCount++;

        if (!options.failingOnly || existingReport.verdict === 'FAIL') {
          console.log(`   [cached] ${file}: ${formatVerdict(existingReport.verdict)}`);
        }
        continue;
      } catch {
        // Report file is invalid, regenerate
      }
    }

    try {
      const content = fs.readFileSync(path.join(options.inputDir, file), 'utf8');
      const entries = parseListFile(content);
      const report = assessListQuality(entries, file, model);
      reports.push(report);

      if (report.verdict === 'PASS') passCount++;
      else if (report.verdict === 'WARN') warnCount++;
      else failCount++;

      if (!options.failingOnly || report.verdict === 'FAIL') {
        console.log(`   ${file}: ${formatVerdict(report.verdict)}`);
        if (report.verdict !== 'PASS') {
          console.log(`      ${report.summary}`);
        }
      }

      if (!options.summaryOnly) {
        // Save individual JSON report
        fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

        // Save individual text report
        const textReportPath = path.join(options.outputDir, file.replace(/\.txt$/, '.quality.txt'));
        fs.writeFileSync(textReportPath, formatReportAsText(report));
      }
    } catch (error) {
      console.error(`   ${file}: ERROR - ${(error as Error).message}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('MODEL QUALITY RANKING');
  console.log('='.repeat(70));

  const modelStats = calculateModelStats(reports);

  console.log('\nRank | Model                    | Score | Lists | Avg Dupes | Avg Seq');
  console.log('-'.repeat(70));

  let rank = 1;
  for (const stat of modelStats) {
    const scoreColor = stat.qualityScore >= 80 ? '\x1b[32m' : stat.qualityScore >= 50 ? '\x1b[33m' : '\x1b[31m';
    const reset = '\x1b[0m';
    const modelPadded = stat.model.padEnd(24).slice(0, 24);
    console.log(`${String(rank).padStart(4)} | ${modelPadded} | ${scoreColor}${stat.qualityScore.toFixed(0).padStart(5)}${reset} | ${String(stat.listCount).padStart(5)} | ${stat.avgDuplicates.toFixed(1).padStart(9)} | ${stat.avgMaxSequence.toFixed(1).padStart(7)}`);
    rank++;
  }

  console.log('\n' + '-'.repeat(70));
  console.log(`Total: ${reports.length} lists | PASS: ${passCount} | WARN: ${warnCount} | FAIL: ${failCount}`);
  console.log('-'.repeat(70));

  // Generate summary files
  const summaryCSVPath = path.join(options.outputDir, 'summary.csv');
  fs.writeFileSync(summaryCSVPath, generateSummaryCSV(reports));

  const summaryMDPath = path.join(options.outputDir, 'summary.md');
  fs.writeFileSync(summaryMDPath, generateSummaryMarkdown(reports));

  console.log(`\nReports saved to: ${options.outputDir}/`);
  console.log(`  - summary.csv (spreadsheet data)`);
  console.log(`  - summary.md (detailed markdown report)`);

  // Identify worst models
  const worstModels = modelStats.filter(s => s.qualityScore < 50);
  if (worstModels.length > 0) {
    console.log('\n⚠️  Models scoring below 50 (consider excluding):');
    for (const stat of worstModels) {
      console.log(`   - ${stat.model}: score ${stat.qualityScore.toFixed(0)}, avg ${stat.avgDuplicates.toFixed(0)} duplicates`);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
