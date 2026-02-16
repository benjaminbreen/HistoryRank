import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Influence Network | HistoryRank',
  description: 'Explore intellectual influence connections between historical figures. Chronological DAG and network visualizations with evidence-backed links.',
  openGraph: {
    title: 'Influence Network | HistoryRank',
    description: 'Explore intellectual influence connections between historical figures in an interactive network visualization.',
  },
};

export default function InfluenceLayout({ children }: { children: React.ReactNode }) {
  return children;
}
