import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Scatter Plot | HistoryRank',
  description: 'Interactive scatter plot comparing AI consensus rankings against MIT Pantheon academic rankings. Explore outliers and agreement patterns.',
  openGraph: {
    title: 'Scatter Plot | HistoryRank',
    description: 'Interactive scatter plot comparing AI consensus rankings against MIT Pantheon academic rankings.',
  },
};

export default function ScatterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
