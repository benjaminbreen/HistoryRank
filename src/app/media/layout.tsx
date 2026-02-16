import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Historical Media Atlas | HistoryRank',
  description: 'Curated collection of films, series, podcasts, and books about historical figures. Recommendations from UC Santa Cruz historians and students.',
  openGraph: {
    title: 'Historical Media Atlas | HistoryRank',
    description: 'Curated films, series, podcasts, and books about historical figures from UC Santa Cruz historians.',
  },
};

export default function MediaLayout({ children }: { children: React.ReactNode }) {
  return children;
}
