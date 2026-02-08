import { readFile } from 'node:fs/promises';
import path from 'node:path';
import Database from 'better-sqlite3';

type CliArgs = {
  dbPath: string;
  migrationPath: string;
  dryRun: boolean;
};

function parseArgs(argv: string[]): CliArgs {
  const get = (flag: string) => {
    const match = argv.find((arg) => arg.startsWith(`${flag}=`));
    return match ? match.slice(flag.length + 1) : null;
  };

  const dbPath = get('--db') || path.join(process.cwd(), 'historyrank.db');
  const migrationPath =
    get('--migration') || path.join(process.cwd(), 'scripts', 'migrations', '20260206_figure_detail_evidence.sql');
  const dryRun = argv.includes('--dry-run');

  return { dbPath, migrationPath, dryRun };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const sql = await readFile(args.migrationPath, 'utf8');

  if (args.dryRun) {
    console.log(`[dry-run] migration file: ${args.migrationPath}`);
    console.log(`[dry-run] db file: ${args.dbPath}`);
    console.log(`[dry-run] SQL chars: ${sql.length}`);
    return;
  }

  const db = new Database(args.dbPath);
  try {
    db.exec('PRAGMA foreign_keys = ON;');
    db.exec(sql);
    console.log(`Applied figure detail evidence migration to ${args.dbPath}`);
  } finally {
    db.close();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
