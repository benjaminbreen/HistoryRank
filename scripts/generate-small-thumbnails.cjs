/**
 * Generate small (96x96 webp) list-view variants of the figure thumbnails.
 *
 * The originals in public/thumbnails are shown in 30-46px slots but can be
 * hundreds of KB. The rankings table loads these variants instead.
 *
 * Usage:
 *   node scripts/generate-small-thumbnails.cjs           # only missing/outdated
 *   node scripts/generate-small-thumbnails.cjs --force   # regenerate all
 */

const fs = require('node:fs');
const path = require('node:path');
// sharp ships as a dependency of Next.js, so it is normally already installed.
let sharp;
try {
  sharp = require('sharp');
} catch {
  console.error('This script needs the "sharp" package (installed alongside Next.js). Run: npm install');
  process.exit(1);
}


const SRC_DIR = path.join(process.cwd(), 'public', 'thumbnails');
const OUT_DIR = path.join(process.cwd(), 'public', 'thumbnails-sm');
const SOURCE_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];
const SIZE = 96; // 2x the largest list-row thumbnail
const QUALITY = 78;
const BATCH = 16;

const force = process.argv.includes('--force');

async function convert(file) {
  const id = path.basename(file, path.extname(file));
  const src = path.join(SRC_DIR, file);
  const out = path.join(OUT_DIR, `${id}.webp`);

  if (!force && fs.existsSync(out) && fs.statSync(out).mtimeMs >= fs.statSync(src).mtimeMs) {
    return 'skipped';
  }

  // Same centre crop as the CSS `object-fit: cover` used by FigureThumbnail
  await sharp(src)
    .rotate()
    .resize(SIZE, SIZE, { fit: 'cover', position: 'centre' })
    .webp({ quality: QUALITY })
    .toFile(out);
  return 'written';
}

async function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`Missing ${SRC_DIR}`);
    process.exit(1);
  }
  fs.mkdirSync(OUT_DIR, { recursive: true });

  // If a figure has more than one source file, prefer the extension order above
  const byId = new Map();
  for (const file of fs.readdirSync(SRC_DIR)) {
    const ext = path.extname(file).toLowerCase();
    if (!SOURCE_EXTS.includes(ext)) continue;
    const id = path.basename(file, path.extname(file));
    const current = byId.get(id);
    if (!current || SOURCE_EXTS.indexOf(ext) < SOURCE_EXTS.indexOf(path.extname(current).toLowerCase())) {
      byId.set(id, file);
    }
  }

  const files = [...byId.values()];
  const counts = { written: 0, skipped: 0, failed: 0 };

  for (let i = 0; i < files.length; i += BATCH) {
    const results = await Promise.allSettled(files.slice(i, i + BATCH).map(convert));
    results.forEach((result, idx) => {
      if (result.status === 'fulfilled') {
        counts[result.value] += 1;
      } else {
        counts.failed += 1;
        console.warn(`  failed: ${files[i + idx]} (${result.reason?.message ?? result.reason})`);
      }
    });
  }

  console.log(`Small thumbnails: ${counts.written} written, ${counts.skipped} up to date, ${counts.failed} failed (of ${files.length})`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
