import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Caveats | HistoryRank',
  description: 'Critical examination of ranking historical figures: known biases, philosophical concerns, limitations, and why we built HistoryRank anyway.',
  openGraph: {
    title: 'Caveats | HistoryRank',
    description: 'Critical examination of ranking historical figures: known biases, limitations, and philosophical concerns.',
  },
};

export default function CaveatsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
