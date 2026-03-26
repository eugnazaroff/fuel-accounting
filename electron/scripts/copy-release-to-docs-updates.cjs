/**
 * Копирует артефакты electron-builder (generic update) в docs/updates для GitHub Pages.
 * Берёт только файлы из release/latest.yml (installer + blockmap), старые версии в docs/updates удаляет.
 * Запуск: node electron/scripts/copy-release-to-docs-updates.cjs
 * Перед этим: npm run dist:win
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..');
const RELEASE = path.join(ROOT, 'release');
const DEST = path.join(ROOT, 'docs', 'updates');
const LATEST = path.join(RELEASE, 'latest.yml');

async function readSetupNameFromLatestYml() {
  const raw = await fs.readFile(LATEST, 'utf8');
  const m = raw.match(/^path:\s*(.+)$/m);
  if (!m) {
    throw new Error('В latest.yml не найдено поле path (имя установщика).');
  }
  return m[1].trim();
}

async function cleanDestExceptNojekyll() {
  let entries;
  try {
    entries = await fs.readdir(DEST);
  } catch {
    return;
  }
  for (const name of entries) {
    if (name === '.nojekyll') {
      continue;
    }
    await fs.rm(path.join(DEST, name), { force: true });
  }
}

async function main() {
  let setupName;
  try {
    setupName = await readSetupNameFromLatestYml();
  } catch (e) {
    console.error(
      '[copy-release-to-docs-updates] Нет или битый release/latest.yml. Сначала: npm run dist:win',
    );
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  }

  const blockmapName = `${setupName}.blockmap`;
  const files = ['latest.yml', setupName, blockmapName];

  for (const name of files) {
    const from = path.join(RELEASE, name);
    try {
      const st = await fs.stat(from);
      if (!st.isFile()) {
        throw new Error(`${name} не файл`);
      }
    } catch (e) {
      console.error(`[copy-release-to-docs-updates] Нет файла в release: ${name}`);
      process.exit(1);
    }
  }

  await fs.mkdir(DEST, { recursive: true });
  await cleanDestExceptNojekyll();
  await fs.writeFile(path.join(DEST, '.nojekyll'), '', 'utf8');

  for (const name of files) {
    await fs.copyFile(path.join(RELEASE, name), path.join(DEST, name));
    console.log(`  + ${name}`);
  }

  console.log(`[copy-release-to-docs-updates] Готово → ${path.relative(ROOT, DEST)}`);
  console.log('  Дальше: git add docs/updates && git commit && git push');
}

void main();
