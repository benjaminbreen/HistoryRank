import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';

// Database file location - in project root
const dbPath = process.env.DATABASE_URL || path.join(process.cwd(), 'historyrank.db');
const isVercel = process.env.VERCEL === '1';

type SQLiteDatabase = ReturnType<typeof Database>;

let sqlite: SQLiteDatabase;
try {
  // Use read-only mode on Vercel's read-only filesystem
  sqlite = new Database(dbPath, isVercel ? { readonly: true, fileMustExist: true } : undefined);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error('Failed to open SQLite DB', { dbPath, isVercel, message });
  throw error;
}

if (!isVercel) {
  // Enable WAL mode for better concurrency in local/dev
  sqlite.pragma('journal_mode = WAL');
}

// Create Drizzle instance with schema
export const db = drizzle(sqlite, { schema });

// Export schema for convenience
export * from './schema';
