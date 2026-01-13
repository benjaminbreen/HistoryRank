const fs = require('fs');
const path = require('path');

const RAW_DIR = path.join(process.cwd(), 'data', 'raw');

function extractJsonObjects(content) {
  const objects = [];
  let depth = 0;
  let inString = false;
  let start = -1;

  for (let i = 0; i < content.length; i++) {
    const char = content[i];
    if (char === '"' && content[i - 1] !== '\\') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (char === '{') {
      if (depth === 0) start = i;
      depth++;
    } else if (char === '}') {
      depth--;
      if (depth === 0 && start !== -1) {
        const objStr = content.slice(start, i + 1);
        try {
          const obj = JSON.parse(objStr);
          objects.push(obj);
        } catch (err) {
          // Skip malformed object; keep going.
        }
        start = -1;
      }
    }
  }

  return objects;
}

function writeNormalized(filePath, objects) {
  const output = JSON.stringify(objects, null, 2);
  fs.writeFileSync(filePath, `${output}\n`, 'utf8');
}

function main() {
  const files = fs.readdirSync(RAW_DIR).filter((file) => file.endsWith('.txt') && file.includes('LIST'));

  for (const file of files) {
    const filePath = path.join(RAW_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');
    const objects = extractJsonObjects(content);
    if (objects.length === 0) {
      console.log(`Skipped ${file} (no JSON objects found)`);
      continue;
    }
    const backupPath = `${filePath}.bak`;
    if (!fs.existsSync(backupPath)) {
      fs.writeFileSync(backupPath, content, 'utf8');
    }
    writeNormalized(filePath, objects);
    console.log(`Normalized ${file} (${objects.length} entries)`);
  }
}

main();
