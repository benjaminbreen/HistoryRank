import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Model Comparison | HistoryRank',
  description: 'Compare how different AI models rank historical figures. Interactive heatmaps, domain breakdowns, geographic bias analysis, and pairwise scatter plots.',
  openGraph: {
    title: 'Model Comparison | HistoryRank',
    description: 'Compare how different AI models rank historical figures with interactive heatmaps and bias analysis.',
  },
};

export default function CompareLayout({ children }: { children: React.ReactNode }) {
  return children;
}
