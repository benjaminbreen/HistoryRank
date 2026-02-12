import type { NextConfig } from "next";
import path from "path";

// Files that should never be bundled into any serverless function
const globalExcludes = [
  'data/corpora/**',                  // 10MB+ britannica index, not needed at runtime
  'data/research-candidates/**',      // research data files, not needed at runtime
  'data/research-seeds/**',           // seed data, not needed at runtime
  'mockups/**',                       // HTML mockups, not needed at runtime
  'figuredetailenhancement.md',       // planning doc
  'public/thumbnails/**',
  'public/media-thumbnails/**',
  '**/*.jpg',
  '**/*.png',
  '**/*.webp',
];

const nextConfig: NextConfig = {
  outputFileTracingRoot: path.join(__dirname),
  turbopack: {
    root: __dirname,
  },
  outputFileTracingIncludes: {
    '/api/figures': ['historyrank.db'],
    '/api/figures/[id]': ['historyrank.db'],
    '/api/figures/[id]/evidence': ['historyrank.db'],
    '/api/scatter': ['historyrank.db'],
    '/api/health': ['historyrank.db'],
    '/api/compare': ['historyrank.db'],
    '/api/benchmarks': ['historyrank.db'],
    '/api/benchmarks/[model]': ['historyrank.db'],
    '/api/map': ['historyrank.db'],
    '/api/lists': ['historyrank.db'],
    '/api/export': ['historyrank.db'],
    '/api/influence': ['historyrank.db'],
    '/api/influence/edges/[id]': ['historyrank.db'],
    '/api/media': [
      'data/raw/media/ucsc-history-media.jsonl',
      'data/raw/media/*.json',
      'data/media-figure-links.suggestions.json',
      'data/cache/media-details.json',
      'data/embeddings/media.json',
    ],
    '/figure/[id]': ['historyrank.db'],
  },
  outputFileTracingExcludes: {
    '/api/figures': [...globalExcludes, 'data/raw/media/**'],
    '/api/figures/[id]': [...globalExcludes, 'data/raw/media/**'],
    '/api/figures/[id]/evidence': [...globalExcludes, 'data/raw/media/**'],
    '/api/scatter': [...globalExcludes, 'data/raw/media/**'],
    '/api/compare': [...globalExcludes, 'data/raw/media/**'],
    '/api/benchmarks': [...globalExcludes, 'data/raw/media/**'],
    '/api/benchmarks/[model]': [...globalExcludes, 'data/raw/media/**'],
    '/api/map': [...globalExcludes, 'data/raw/media/**'],
    '/api/media': [...globalExcludes],
    '/api/lists': [...globalExcludes, 'data/raw/media/**'],
    '/api/export': [...globalExcludes, 'data/raw/media/**'],
    '/api/influence': [...globalExcludes, 'data/raw/media/**'],
    '/api/influence/edges/[id]': [...globalExcludes, 'data/raw/media/**'],
    '/api/wikipedia': [...globalExcludes, 'data/raw/media/**'],
    '/api/health': [...globalExcludes, 'data/raw/media/**'],
    '/figure/[id]': [...globalExcludes, 'data/raw/media/**'],
  },
};

export default nextConfig;
