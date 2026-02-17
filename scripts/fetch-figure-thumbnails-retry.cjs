#!/usr/bin/env node
/**
 * fetch-figure-thumbnails-retry.cjs
 *
 * Retry pass for figures still missing thumbnails.
 * Uses longer delays and backoff to handle Wikipedia rate limits.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const Database = require('better-sqlite3');

const DB_PATH = path.join(__dirname, '..', 'historyrank.db');
const THUMB_DIR = path.join(__dirname, '..', 'public', 'thumbnails');
const DELAY_MS = 500; // longer delay
const IMAGE_WIDTH = 400;

const db = new Database(DB_PATH, { readonly: true });

const figures = db.prepare(
  'SELECT id, canonical_name, wikipedia_slug, llm_consensus_rank FROM figures WHERE wikipedia_slug IS NOT NULL ORDER BY llm_consensus_rank ASC'
).all();

const thumbFiles = new Set(fs.readdirSync(THUMB_DIR).map(f => f.replace(/\.[^.]*$/, '')));
const missing = figures.filter(f => !thumbFiles.has(f.id));

console.log(`Still missing thumbnails: ${missing.length}`);

function fetchJSON(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, {
      headers: { 'User-Agent': 'HistoryRank/1.0 (bebreen@ucsc.edu; historical figure thumbnails)' }
    }, res => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return fetchJSON(res.headers.location).then(resolve, reject);
      }
      if (res.statusCode === 429) {
        reject(new Error('RATE_LIMITED'));
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP_${res.statusCode}`));
        return;
      }
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    });
    req.on('error', reject);
    req.setTimeout(10000, () => { req.destroy(); reject(new Error('timeout')); });
  });
}

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const makeRequest = (currentUrl, redirectCount = 0) => {
      if (redirectCount > 5) { reject(new Error('too many redirects')); return; }
      const mod = currentUrl.startsWith('https') ? https : require('http');
      const req = mod.get(currentUrl, {
        headers: { 'User-Agent': 'HistoryRank/1.0 (bebreen@ucsc.edu)' }
      }, res => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return makeRequest(res.headers.location, redirectCount + 1);
        }
        if (res.statusCode === 429) {
          reject(new Error('RATE_LIMITED'));
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP_${res.statusCode}`));
          return;
        }
        const stream = fs.createWriteStream(dest);
        res.pipe(stream);
        stream.on('finish', () => { stream.close(); resolve(); });
        stream.on('error', reject);
      });
      req.on('error', reject);
      req.setTimeout(15000, () => { req.destroy(); reject(new Error('timeout')); });
    };
    makeRequest(url);
  });
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function main() {
  let fetched = 0;
  let noImage = 0;
  let failed = 0;
  let delay = DELAY_MS;

  for (let i = 0; i < missing.length; i++) {
    const fig = missing[i];
    let title;
    try { title = decodeURIComponent(fig.wikipedia_slug); }
    catch { title = fig.wikipedia_slug; }
    const baseTitle = title.split('#')[0];

    try {
      const apiUrl = `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(baseTitle)}`;
      const data = await fetchJSON(apiUrl);

      if (!data || !data.thumbnail || !data.thumbnail.source) {
        noImage++;
        await sleep(delay / 3);
        continue;
      }

      let imageUrl = data.thumbnail.source;
      imageUrl = imageUrl.replace(/\/\d+px-/, `/${IMAGE_WIDTH}px-`);

      let ext = path.extname(new URL(imageUrl).pathname).toLowerCase().split('?')[0];
      if (!ext || ext.length > 5) ext = '.jpg';
      if (ext === '.svg') ext = '.png';

      const destFile = path.join(THUMB_DIR, `${fig.id}${ext}`);
      await downloadFile(imageUrl, destFile);

      const stat = fs.statSync(destFile);
      if (stat.size < 500) {
        fs.unlinkSync(destFile);
        noImage++;
      } else {
        fetched++;
        // Reduce delay on success (working well)
        delay = Math.max(DELAY_MS, delay * 0.95);
      }

      if (fetched % 25 === 0 && fetched > 0) {
        process.stdout.write(`  [${i+1}/${missing.length}] Fetched ${fetched} so far... (delay=${Math.round(delay)}ms)\n`);
      }
    } catch (err) {
      if (err.message === 'RATE_LIMITED') {
        // Exponential backoff
        delay = Math.min(delay * 2, 10000);
        process.stdout.write(`  [${i+1}/${missing.length}] Rate limited, backing off to ${Math.round(delay)}ms\n`);
        await sleep(delay * 3);
        // Retry this one
        i--;
        continue;
      } else {
        failed++;
      }
    }

    await sleep(delay);
  }

  console.log(`\n=== RESULTS ===`);
  console.log(`Fetched: ${fetched}`);
  console.log(`No image: ${noImage}`);
  console.log(`Failed: ${failed}`);

  const newThumbFiles = new Set(fs.readdirSync(THUMB_DIR).map(f => f.replace(/\.[^.]*$/, '')));
  const allFigures = db.prepare('SELECT id FROM figures').all();
  const stillMissing = allFigures.filter(f => !newThumbFiles.has(f.id)).length;
  console.log(`\nCoverage: ${allFigures.length - stillMissing} / ${allFigures.length} (${((allFigures.length - stillMissing) / allFigures.length * 100).toFixed(1)}%)`);
  console.log(`Still missing: ${stillMissing}`);
}

main().catch(console.error).finally(() => db.close());
