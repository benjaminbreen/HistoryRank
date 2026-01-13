import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Database file location
// On Vercel, process.cwd() is /var/task but the DB is bundled relative to source
// So we try multiple paths and use the first that exists
const isVercel = process.env.VERCEL === '1';

function findDatabasePath(): string {
  // If explicitly set, use that
  if (process.env.DATABASE_URL) {
    return process.env.DATABASE_URL;
  }

  // On Vercel, use the known working path directly
  if (isVercel) {
    const vercelPath = '/var/task/historyrank.db';
    if (fs.existsSync(vercelPath)) {
      console.log(`[DB] Vercel: Using ${vercelPath}`);
      return vercelPath;
    }
  }

  // Candidate paths to check (local development)
  const candidates = [
    // From cwd (works locally)
    path.join(process.cwd(), 'historyrank.db'),
    // Relative to this file (src/lib/db/index.ts -> project root)
    path.join(__dirname, '../../../historyrank.db'),
    path.join(__dirname, '../../../../historyrank.db'),
    // Fallback absolute paths
    '/var/task/historyrank.db',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[DB] Found database at: ${candidate}`);
      return candidate;
    }
  }

  // Fallback to cwd-based path (will fail with clear error)
  console.error('[DB] Could not find database file. Tried:', candidates);
  return path.join(process.cwd(), 'historyrank.db');
}

const dbPath = findDatabasePath();

// Export for debugging
export const resolvedDbPath = dbPath;
export const dbExists = fs.existsSync(dbPath);

type SQLiteDatabase = ReturnType<typeof Database>;

let sqlite: SQLiteDatabase;
try {
  console.log(`[DB] Opening database:`, {
    path: dbPath,
    exists: fs.existsSync(dbPath),
    isVercel,
    cwd: process.cwd(),
  });

  // Use read-only mode on Vercel's read-only filesystem
  sqlite = new Database(dbPath, isVercel ? { readonly: true, fileMustExist: true } : undefined);
  console.log(`[DB] Successfully opened database`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error ? error.stack : '';
  console.error('[DB] Failed to open SQLite DB:', {
    dbPath,
    exists: fs.existsSync(dbPath),
    isVercel,
    message,
    stack,
  });
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
