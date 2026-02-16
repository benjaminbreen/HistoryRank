import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Geographic Maps | HistoryRank',
  description: 'Visualize the birthplaces of history\'s most significant figures on interactive flat maps and 3D globes. Filter by era, domain, and AI model.',
  openGraph: {
    title: 'Geographic Maps | HistoryRank',
    description: 'Visualize the birthplaces of history\'s most significant figures on interactive maps and globes.',
  },
};

export default function MapsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
