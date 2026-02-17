#!/usr/bin/env node
/**
 * backfill-media-metadata.cjs
 *
 * Fills in missing `domain` and `wikipedia_slug` fields in the media JSONL.
 */

const fs = require('fs');
const path = require('path');

const JSONL_PATH = path.join(__dirname, '..', 'data', 'raw', 'media', 'ucsc-history-media.jsonl');

// Domain assignments for items missing the field
// Based on era, region, type, and title context
const DOMAIN_FIXES = {
  'Marco Polo': 'Society',
  'The Magnificent Century': 'Politics',
  'Bridgerton': 'Society',
  'The English Game': 'Society',
  'The Plot Against America': 'Politics',
  'Seventeen Moments of Spring': 'Military',
  'Call the Midwife': 'Medicine',
  'My Brilliant Friend': 'Society',
  'Mrs. America': 'Politics',
  'Pose': 'Society',
  'Cleopatra': 'Politics',
  "K'na The Dreamweaver": 'Society',
  'Heneral Luna': 'Military',
  'The Emperor in August': 'Politics',
  'The Founder': 'Economics',
  'The Master': 'Religion',
  'In the Mood for Love': 'Society',
  'Roma': 'Society',
  'The Last King of Scotland': 'Politics',
  'Cidade de Deus (City of God)': 'Society',
  'Children of Heaven': 'Society',
  'LA 92': 'Politics',
  'Even the Rain': 'Politics',
  'Uncivil': 'Military',        // Civil War podcast
  'Unobscured': 'Religion',     // witch trials, occult history
  'Moonrise': 'Science',        // space race
  'Winds of Change': 'Politics', // Cold War / CIA
  'Crimetown': 'Society',       // organized crime
  'Mogul': 'Society',           // hip-hop history
  'Radiolab (selected episodes)': 'Science',
  '99% Invisible (selected episodes)': 'Society',
  'S-Town': 'Society',
  'This American Life': 'Society',
  'StoryCorps': 'Society',
  'Witness Black History': 'Politics',
};

// Wikipedia slug fixes for items missing the field
const WIKI_FIXES = {
  'An Ottoman Odyssey': null,  // No Wikipedia article exists for this podcast
  'Trickster: The Many Lives of Carlos Castaneda': null,  // No dedicated article
  'Betwixt the Sheets': null,  // No Wikipedia article
  'Los Frikis': 'Los_Frikis',
  'Noble Blood': null,  // No Wikipedia article for the podcast
  'Luck of the Titanic': 'Luck_of_the_Titanic',
  "K'na, the Dreamweaver": "K'na,_the_Dreamweaver",
};

// Read and process
const lines = fs.readFileSync(JSONL_PATH, 'utf8').trim().split('\n');
let domainFixed = 0;
let wikiFixed = 0;

const updated = lines.map(line => {
  const item = JSON.parse(line);

  // Fix missing domain
  if (!item.domain && DOMAIN_FIXES[item.title]) {
    item.domain = DOMAIN_FIXES[item.title];
    domainFixed++;
  }

  // Fix missing wikipedia_slug
  if (!item.wikipedia_slug && WIKI_FIXES.hasOwnProperty(item.title)) {
    const slug = WIKI_FIXES[item.title];
    if (slug) {
      item.wikipedia_slug = slug;
      wikiFixed++;
    }
  }

  return JSON.stringify(item);
});

fs.writeFileSync(JSONL_PATH, updated.join('\n') + '\n');

console.log(`Domain fixed: ${domainFixed}`);
console.log(`Wikipedia slug fixed: ${wikiFixed}`);

// Verify
const verify = fs.readFileSync(JSONL_PATH, 'utf8').trim().split('\n').map(l => JSON.parse(l));
const stillNoDomain = verify.filter(i => !i.domain).length;
const stillNoWiki = verify.filter(i => !i.wikipedia_slug).length;
console.log(`\nRemaining without domain: ${stillNoDomain}`);
console.log(`Remaining without wikipedia_slug: ${stillNoWiki}`);
