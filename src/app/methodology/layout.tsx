import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Methodology | HistoryRank',
  description: 'Detailed methodology behind HistoryRank: data sources, model weights, ranking algorithms, known biases, and the weighted averaging approach.',
  openGraph: {
    title: 'Methodology | HistoryRank',
    description: 'Detailed methodology behind HistoryRank: data sources, model weights, ranking algorithms, and known biases.',
  },
};

export default function MethodologyLayout({ children }: { children: React.ReactNode }) {
  return children;
}
