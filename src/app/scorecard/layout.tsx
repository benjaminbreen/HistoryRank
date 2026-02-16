import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'LLM Scorecard | HistoryRank',
  description: 'Grading AI models on historical knowledge. See how Claude, GPT, Gemini, Grok, and other frontier models perform on factual accuracy and depth.',
  openGraph: {
    title: 'LLM Scorecard | HistoryRank',
    description: 'Grading AI models on historical knowledge across factual accuracy, depth, and coverage.',
  },
};

export default function ScorecardLayout({ children }: { children: React.ReactNode }) {
  return children;
}
