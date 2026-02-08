import { db, figures } from '@/lib/db';
import { eq } from 'drizzle-orm';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const figure = await db.query.figures.findFirst({
      where: eq(figures.id, id),
      columns: {
        canonicalName: true,
        occupation: true,
        birthYear: true,
      },
    });

    if (!figure) {
      return {
        title: 'Figure Not Found | HistoryRank',
      };
    }

    const birthLabel = figure.birthYear
      ? figure.birthYear < 0
        ? `${Math.abs(figure.birthYear)} BCE`
        : `b. ${figure.birthYear}`
      : '';

    const parts = [
      figure.canonicalName,
      figure.occupation,
      birthLabel ? `(${birthLabel})` : '',
    ].filter(Boolean);

    const description = `${parts.join(', ')} — Rankings, timeline, and research on HistoryRank`;

    return {
      title: `${figure.canonicalName} | HistoryRank`,
      description,
      openGraph: {
        title: `${figure.canonicalName} | HistoryRank`,
        description,
        images: [`/thumbnails/${id}.jpg`],
      },
    };
  } catch {
    return {
      title: 'HistoryRank',
    };
  }
}

export default function FigureLayout({ children }: { children: React.ReactNode }) {
  return children;
}
