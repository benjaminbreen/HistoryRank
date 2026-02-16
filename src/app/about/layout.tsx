import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'About | HistoryRank',
  description: 'How HistoryRank combines academic rankings, Wikipedia metrics, and AI assessments to rank historical figures. Learn about the project, data sources, and team.',
  openGraph: {
    title: 'About | HistoryRank',
    description: 'How HistoryRank combines academic rankings, Wikipedia metrics, and AI assessments to rank historical figures.',
  },
};

export default function AboutLayout({ children }: { children: React.ReactNode }) {
  return children;
}
