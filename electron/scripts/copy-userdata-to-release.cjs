/**
 * После electron-builder кладёт portable-seed/UserData рядом с .exe в release/.
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const projectRoot = path.join(__dirname, '..', '..');
const seedUserData = path.join(projectRoot, 'portable-seed', 'UserData');
const releaseDir = path.join(projectRoot, 'release');

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyTree(from, to) {
  await fs.cp(from, to, { recursive: true });
}

async function main() {
  if (!(await exists(seedUserData))) {
    console.warn(
      '[copy-userdata-to-release] Нет папки portable-seed/UserData — пропуск (сделайте npm run seed:portable).',
    );
    return;
  }
  if (!(await exists(releaseDir))) {
    console.warn('[copy-userdata-to-release] Нет папки release — пропуск.');
    return;
  }
  const dest = path.join(releaseDir, 'UserData');
  if (await exists(dest)) {
    await fs.rm(dest, { recursive: true, force: true });
  }
  await copyTree(seedUserData, dest);
  console.log('[copy-userdata-to-release] Скопировано в', dest);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
