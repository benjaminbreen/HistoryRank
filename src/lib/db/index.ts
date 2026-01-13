import { drizzle, BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
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

  // On Vercel, check both runtime and build paths
  if (isVercel) {
    const taskRoot = process.env.LAMBDA_TASK_ROOT;
    const vercelPaths = [
      taskRoot ? path.join(taskRoot, 'historyrank.db') : null,
      '/var/task/historyrank.db',
      '/vercel/path0/historyrank.db',
      path.join(process.cwd(), 'historyrank.db'),
    ];
    for (const vercelPath of vercelPaths.filter(Boolean) as string[]) {
      if (fs.existsSync(vercelPath)) {
        console.log(`[DB] Vercel: Found database at ${vercelPath}`);
        return vercelPath;
      }
    }
    console.log(`[DB] Vercel: Database not found. Tried:`, vercelPaths);
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
let _db: BetterSQLite3Database<typeof schema> | null = null;
let _dbPath: string | null = null;

function getDatabase(): BetterSQLite3Database<typeof schema> {
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

// Export getter that returns properly typed database
// Use Object.defineProperty to make it act like a direct export
export const db: BetterSQLite3Database<typeof schema> = new Proxy(
  {} as BetterSQLite3Database<typeof schema>,
  {
    get(_, prop) {
      const database = getDatabase();
      const value = database[prop as keyof typeof database];
      // Bind methods to the database instance
      if (typeof value === 'function') {
        return value.bind(database);
      }
      return value;
    },
  }
);

// Export for debugging
export const resolvedDbPath = () => _dbPath || findDatabasePath();
export const dbExists = () => fs.existsSync(resolvedDbPath());

// Export schema for convenience
export * from './schema';
