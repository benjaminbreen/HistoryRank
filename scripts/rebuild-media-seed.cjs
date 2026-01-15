const fs = require('node:fs');
const path = require('node:path');

const MEDIA_PATH = path.join(process.cwd(), 'data', 'raw', 'media', 'ucsc-history-media.jsonl');

const SEED_LIST = [
  // TV series / miniseries
  { title: 'Rome', type: 'series' },
  { title: 'I, Claudius', type: 'series' },
  { title: 'The Last Kingdom', type: 'series' },
  { title: 'Marco Polo', type: 'series' },
  { title: 'The Tudors', type: 'series' },
  { title: 'The Magnificent Century', type: 'series' },
  { title: 'The Great', type: 'series' },
  { title: 'John Adams', type: 'series' },
  { title: 'Bridgerton', type: 'series' },
  { title: 'Deadwood', type: 'series' },
  { title: 'The English Game', type: 'series' },
  { title: 'The Knick', type: 'series' },
  { title: 'Boardwalk Empire', type: 'series' },
  { title: 'Babylon Berlin', type: 'series' },
  { title: 'The Plot Against America', type: 'series' },
  { title: 'Seventeen Moments of Spring', type: 'series' },
  { title: 'The Crown', type: 'series' },
  { title: 'Mad Men', type: 'series' },
  { title: 'Call the Midwife', type: 'series' },
  { title: 'My Brilliant Friend', type: 'series' },
  { title: 'Mrs. America', type: 'series' },
  { title: 'The Americans', type: 'series' },
  { title: 'Pose', type: 'series' },
  { title: 'Chernobyl', type: 'series' },
  // Films
  { title: 'Troy', type: 'film' },
  { title: 'Cleopatra', type: 'film' },
  { title: "K'na The Dreamweaver", type: 'film' },
  { title: 'The Passion of Joan of Arc', type: 'film' },
  { title: 'Black Robe', type: 'film' },
  { title: 'The Witch', type: 'film' },
  { title: 'The Favourite', type: 'film' },
  { title: 'Barry Lyndon', type: 'film' },
  { title: 'Marie Antoinette', type: 'film' },
  { title: 'The Duellists', type: 'film' },
  { title: 'Master and Commander: The Far Side of the World', type: 'film' },
  { title: '12 Years a Slave', type: 'film' },
  { title: 'Lincoln', type: 'film' },
  { title: 'Heneral Luna', type: 'film' },
  { title: 'Lawrence of Arabia', type: 'film' },
  { title: 'Das Boot', type: 'film' },
  { title: 'The Imitation Game', type: 'film' },
  { title: 'Downfall', type: 'film' },
  { title: 'The Emperor in August', type: 'film' },
  { title: 'The Death of Stalin', type: 'film' },
  { title: 'Dr. Strangelove', type: 'film' },
  { title: 'The Founder', type: 'film' },
  { title: 'The Master', type: 'film' },
  { title: 'In the Mood for Love', type: 'film' },
  { title: 'Malcolm X', type: 'film' },
  { title: 'Roma', type: 'film' },
  { title: 'The Last King of Scotland', type: 'film' },
  { title: 'Cidade de Deus (City of God)', type: 'film' },
  { title: "All the President's Men", type: 'film' },
  { title: 'Children of Heaven', type: 'film' },
  { title: 'LA 92', type: 'documentary' },
  { title: 'Even the Rain', type: 'film' },
  // Podcasts
  { title: 'Revolutions', type: 'podcast' },
  { title: 'Uncivil', type: 'podcast' },
  { title: 'Unobscured', type: 'podcast' },
  { title: 'You Must Remember This', type: 'podcast' },
  { title: 'Moonrise', type: 'podcast' },
  { title: 'Winds of Change', type: 'podcast' },
  { title: 'Crimetown', type: 'podcast' },
  { title: 'Serial', type: 'podcast' },
  { title: 'Mogul', type: 'podcast' },
  { title: 'Radiolab (selected episodes)', type: 'podcast' },
  { title: '99% Invisible (selected episodes)', type: 'podcast' },
  { title: 'Throughline', type: 'podcast' },
  { title: 'S-Town', type: 'podcast' },
  { title: 'This American Life', type: 'podcast' },
  { title: 'StoryCorps', type: 'podcast' },
  { title: 'Witness Black History', type: 'podcast' },
];

const RECOMMENDED = new Set([
  'I, Claudius',
  'The Knick',
  'The Crown',
  'Mad Men',
  'The Americans',
  'Chernobyl',
  'The Passion of Joan of Arc',
  'The Duellists',
  'Master and Commander: The Far Side of the World',
  '12 Years a Slave',
  'Lawrence of Arabia',
  'The Death of Stalin',
  'Dr. Strangelove',
  'Cidade de Deus (City of God)',
  'Children of Heaven',
  'You Must Remember This',
  'Winds of Change',
  'Serial',
  '99% Invisible (selected episodes)',
  'S-Town',
  'This American Life',
]);

function normalizeTitle(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function loadMedia() {
  if (!fs.existsSync(MEDIA_PATH)) return [];
  const raw = fs.readFileSync(MEDIA_PATH, 'utf8');
  return raw
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line));
}

function saveMedia(items) {
  const lines = items.map((item) => JSON.stringify(item));
  fs.writeFileSync(MEDIA_PATH, `${lines.join('\n')}\n`);
}

function main() {
  const existing = loadMedia();
  const index = new Map();
  for (const item of existing) {
    if (!item.title) continue;
    index.set(normalizeTitle(item.title), item);
  }

  const rebuilt = [];
  const missing = [];

  for (const seed of SEED_LIST) {
    const key = normalizeTitle(seed.title);
    const existingItem = index.get(key);
    if (!existingItem) {
      missing.push(seed.title);
      continue;
    }
    const entry = { ...existingItem };
    entry.type = seed.type;
    entry.recommended = RECOMMENDED.has(seed.title);
    rebuilt.push(entry);
  }

  if (missing.length) {
    throw new Error(`Missing ${missing.length} titles in source data: ${missing.join(', ')}`);
  }

  saveMedia(rebuilt);
  console.log(`Rebuilt media seed with ${rebuilt.length} items.`);
}

main();
