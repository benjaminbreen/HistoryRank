import { drizzle } from 'drizzle-orm/better-sqlite3';
import Database from 'better-sqlite3';
import * as schema from './schema';
import path from 'path';
import fs from 'fs';

// Database file location
// On Vercel, process.cwd() is /var/task but the DB is bundled relative to source
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
      console.log(`[DB] Vercel: Found database at ${vercelPath}`);
      return vercelPath;
    }
    console.log(`[DB] Vercel: Database not found at ${vercelPath}`);
  }

  // Candidate paths to check (local development)
  const candidates = [
    path.join(process.cwd(), 'historyrank.db'),
    path.join(__dirname, '../../../historyrank.db'),
    path.join(__dirname, '../../../../historyrank.db'),
    '/var/task/historyrank.db',
  ];

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      console.log(`[DB] Found database at: ${candidate}`);
      return candidate;
    }
  }

  console.error('[DB] Could not find database file. Tried:', candidates);
  return path.join(process.cwd(), 'historyrank.db');
}

// Lazy initialization - don't create connection until first use
let _db: ReturnType<typeof drizzle> | null = null;
let _dbPath: string | null = null;

function getDatabase() {
  if (_db) return _db;

  _dbPath = findDatabasePath();

  console.log(`[DB] Opening database:`, {
    path: _dbPath,
    exists: fs.existsSync(_dbPath),
    isVercel,
    cwd: process.cwd(),
  });

  try {
    const sqlite = new Database(_dbPath, isVercel ? { readonly: true, fileMustExist: true } : undefined);

    if (!isVercel) {
      sqlite.pragma('journal_mode = WAL');
    }

    _db = drizzle(sqlite, { schema });
    console.log(`[DB] Successfully opened database`);
    return _db;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[DB] Failed to open SQLite DB:', {
      dbPath: _dbPath,
      exists: fs.existsSync(_dbPath),
      isVercel,
      message,
    });
    throw error;
  }
}

// Export a proxy that lazily initializes the database
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_, prop) {
    const database = getDatabase();
    return (database as Record<string | symbol, unknown>)[prop];
  },
});

// Export for debugging
export const resolvedDbPath = () => _dbPath || findDatabasePath();
export const dbExists = () => fs.existsSync(resolvedDbPath());

// Export schema for convenience
export * from './schema';
