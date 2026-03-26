/**
 * Копирует артефакты electron-builder (generic update) в docs/updates для GitHub Pages.
 * Запуск: node electron/scripts/copy-release-to-docs-updates.cjs
 * Перед этим: npm run dist:win
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const RELEASE = path.join(ROOT, 'release');
const DEST = path.join(ROOT, 'docs', 'updates');

function shouldPublishUpdateFile(name) {
  const lower = name.toLowerCase();
  if (lower === 'latest.yml') {
    return true;
  }
  if (lower.endsWith('.blockmap')) {
    return true;
  }
  if (lower.endsWith('.exe') && /setup/i.test(name) && !/blockmap/i.test(name)) {
    return true;
  }
  return false;
}

async function main() {
  let names;
  try {
    names = await fs.readdir(RELEASE);
  } catch (e) {
    console.error('[copy-release-to-docs-updates] Нет папки release. Сначала: npm run dist:win');
    process.exit(1);
  }

  const toCopy = names.filter(shouldPublishUpdateFile);

  if (toCopy.length === 0) {
    console.error('[copy-release-to-docs-updates] В release нет yml/exe/blockmap. Сначала: npm run dist:win');
    process.exit(1);
  }

  await fs.mkdir(DEST, { recursive: true });
  await fs.writeFile(path.join(DEST, '.nojekyll'), '', 'utf8');

  for (const name of toCopy) {
    const from = path.join(RELEASE, name);
    const st = await fs.stat(from);
    if (!st.isFile()) {
      continue;
    }
    await fs.copyFile(from, path.join(DEST, name));
    console.log(`  + ${name}`);
  }

  console.log(`[copy-release-to-docs-updates] Готово → ${path.relative(ROOT, DEST)}`);
  console.log('  Дальше: git add docs/updates && git commit && git push');
}

void main();
