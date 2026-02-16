import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'HistoryBench v1.0 | HistoryRank',
  description: 'Benchmarking 13 frontier AI models on historical knowledge. Two-layer evaluation with objective metrics and multi-judge scoring across 256 descriptions.',
  openGraph: {
    title: 'HistoryBench v1.0 | HistoryRank',
    description: 'Benchmarking 13 frontier AI models on historical knowledge with objective metrics and multi-judge scoring.',
  },
};

export default function HistoryBenchLayout({ children }: { children: React.ReactNode }) {
  return children;
}
