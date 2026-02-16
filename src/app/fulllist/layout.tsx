import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Full List | HistoryRank',
  description: 'Complete alphabetical and era-grouped index of all ranked historical figures in the HistoryRank database.',
  openGraph: {
    title: 'Full List | HistoryRank',
    description: 'Complete index of all ranked historical figures in the HistoryRank database.',
  },
};

export default function FullListLayout({ children }: { children: React.ReactNode }) {
  return children;
}
