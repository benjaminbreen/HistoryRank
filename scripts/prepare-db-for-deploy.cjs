const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const dbPath = path.join(process.cwd(), 'historyrank.db');

if (!fs.existsSync(dbPath)) {
  console.error('historyrank.db not found in repo root.');
  process.exit(1);
}

try {
  execSync(`sqlite3 "${dbPath}" "PRAGMA wal_checkpoint(FULL); PRAGMA journal_mode=DELETE; VACUUM;"`, {
    stdio: 'inherit',
  });
} catch (error) {
  console.error('Failed to normalize SQLite DB for deploy.');
  process.exit(1);
}

for (const suffix of ['-wal', '-shm']) {
  const file = `${dbPath}${suffix}`;
  if (fs.existsSync(file)) {
    fs.unlinkSync(file);
    console.log(`Removed ${path.basename(file)}`);
  }
}

console.log('✅ historyrank.db normalized for deploy (DELETE journal mode).');
