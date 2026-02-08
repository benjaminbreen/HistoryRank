import Database from 'better-sqlite3';
import path from 'path';
import type { Metadata } from 'next';

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;

  try {
    const dbPath = path.join(process.cwd(), 'historyrank.db');
    const db = new Database(dbPath, { readonly: true });

    const row = db.prepare(
      'SELECT canonical_name, occupation, birth_year FROM figures WHERE id = ?'
    ).get(id) as { canonical_name: string; occupation: string | null; birth_year: number | null } | undefined;

    db.close();

    if (!row) {
      return {
        title: 'Figure Not Found | HistoryRank',
      };
    }

    const birthLabel = row.birth_year
      ? row.birth_year < 0
        ? `${Math.abs(row.birth_year)} BCE`
        : `b. ${row.birth_year}`
      : '';

    const parts = [
      row.canonical_name,
      row.occupation,
      birthLabel ? `(${birthLabel})` : '',
    ].filter(Boolean);

    const description = `${parts.join(', ')} — Rankings, timeline, and research on HistoryRank`;

    return {
      title: `${row.canonical_name} | HistoryRank`,
      description,
      openGraph: {
        title: `${row.canonical_name} | HistoryRank`,
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
