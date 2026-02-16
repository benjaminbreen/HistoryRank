import type { MetadataRoute } from 'next';
import Database from 'better-sqlite3';
import path from 'path';

const BASE_URL = 'https://historyrank.org';

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: MetadataRoute.Sitemap = [
    { url: BASE_URL, changeFrequency: 'weekly', priority: 1.0 },
    { url: `${BASE_URL}/about`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/methodology`, changeFrequency: 'monthly', priority: 0.7 },
    { url: `${BASE_URL}/compare`, changeFrequency: 'weekly', priority: 0.8 },
    { url: `${BASE_URL}/influence`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/maps`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/media`, changeFrequency: 'weekly', priority: 0.6 },
    { url: `${BASE_URL}/scatter`, changeFrequency: 'monthly', priority: 0.5 },
    { url: `${BASE_URL}/fulllist`, changeFrequency: 'weekly', priority: 0.7 },
    { url: `${BASE_URL}/scorecard`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/historybench`, changeFrequency: 'monthly', priority: 0.6 },
    { url: `${BASE_URL}/caveats`, changeFrequency: 'monthly', priority: 0.4 },
  ];

  let figurePages: MetadataRoute.Sitemap = [];
  try {
    const dbPath = path.join(process.cwd(), 'historyrank.db');
    const db = new Database(dbPath, { readonly: true });
    const rows = db.prepare('SELECT id FROM figures ORDER BY id').all() as { id: string }[];
    db.close();

    figurePages = rows.map((row) => ({
      url: `${BASE_URL}/figure/${row.id}`,
      changeFrequency: 'monthly' as const,
      priority: 0.6,
    }));
  } catch {
    // If DB is unavailable, return only static pages
  }

  return [...staticPages, ...figurePages];
}
