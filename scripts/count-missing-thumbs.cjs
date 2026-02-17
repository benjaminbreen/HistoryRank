const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'historyrank.db');
const THUMB_DIR = path.join(__dirname, '..', 'public', 'thumbnails');

const db = new Database(DB_PATH, { readonly: true });
const figures = db.prepare('SELECT id, canonical_name, wikipedia_slug, llm_consensus_rank FROM figures').all();
const thumbFiles = new Set(fs.readdirSync(THUMB_DIR).map(f => f.replace(/\.[^.]*$/, '')));

const missing = figures.filter(f => !thumbFiles.has(f.id));
const withSlug = missing.filter(f => f.wikipedia_slug);
const withoutSlug = missing.filter(f => !f.wikipedia_slug);

console.log(`Total figures: ${figures.length}`);
console.log(`Have thumbnails: ${figures.length - missing.length}`);
console.log(`Missing thumbnails: ${missing.length}`);
console.log(`  With wikipedia_slug: ${withSlug.length}`);
console.log(`  Without wikipedia_slug: ${withoutSlug.length}`);
console.log(`\nTop-ranked missing (first 20):`);
missing.sort((a, b) => (a.llm_consensus_rank || 9999) - (b.llm_consensus_rank || 9999));
missing.slice(0, 20).forEach(f => {
  console.log(`  #${Math.round(f.llm_consensus_rank || 0)} ${f.canonical_name} | slug=${f.wikipedia_slug || 'NONE'}`);
});

db.close();
