const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

function analyze(entries) {
  const ranks = new Set();
  const dup = new Set();
  let missing = 0;
  let nonInt = 0;
  let nonNumber = 0;
  let nullName = 0;

  for (const e of entries) {
    if (!e || typeof e !== 'object') {
      missing++;
      continue;
    }
    if (e.rank === undefined || e.name === undefined || e.primary_contribution === undefined) missing++;
    if (typeof e.rank !== 'number') nonNumber++;
    else if (!Number.isInteger(e.rank)) nonInt++;
    if (typeof e.name !== 'string' || e.name.trim() === '') nullName++;
    if (typeof e.rank === 'number') {
      if (ranks.has(e.rank)) dup.add(e.rank);
      ranks.add(e.rank);
    }
  }

  return { count: entries.length, missing, nonNumber, nonInt, nullName, dup: Array.from(dup) };
}

function main() {
  const files = fs.readdirSync(RAW_DIR).filter((file) => file.endsWith('.txt') && file.includes('LIST'));
  let hasErrors = false;

  for (const file of files) {
    const content = fs.readFileSync(path.join(RAW_DIR, file), 'utf8').trim();
    let data;
    try {
      data = JSON.parse(content);
    } catch (err) {
      console.log(`FILE: ${file}`);
      console.log(`  JSON ERROR: ${err.message}`);
      hasErrors = true;
      continue;
    }
    if (!Array.isArray(data)) {
      console.log(`FILE: ${file}`);
      console.log('  JSON root is not an array');
      hasErrors = true;
      continue;
    }
    const stats = analyze(data);
    console.log(`FILE: ${file}`);
    console.log(`  entries: ${stats.count}`);
    if (stats.missing || stats.nonNumber || stats.nonInt || stats.nullName || stats.dup.length) {
      console.log(`  missingFields: ${stats.missing}`);
      console.log(`  nonNumberRank: ${stats.nonNumber}`);
      console.log(`  nonIntRank: ${stats.nonInt}`);
      console.log(`  nullName: ${stats.nullName}`);
      if (stats.dup.length) {
        console.log(`  dupRanks: ${stats.dup.slice(0, 10).join(', ')}`);
      }
    }
  }

  if (hasErrors) {
    process.exit(1);
  }
}

main();
