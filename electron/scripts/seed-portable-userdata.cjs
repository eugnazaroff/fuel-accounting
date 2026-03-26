/**
 * Собирает portable-seed/UserData из вашей текущей папки данных (например с Mac).
 *
 * По умолчанию источник: ~/Library/Application Support/fuel-accounting/fuel-data
 * Свой путь: FUEL_SEED=/абсолютный/путь npm run seed:portable
 *
 * В seed попадают каталоги vehicle-library и daily-records (старый формат
 * vehicles.json + daily/ конвертируется при копировании).
 */
const fs = require('node:fs/promises');
const path = require('node:path');

const VEHICLE_LIBRARY_DIR = 'vehicle-library';
const DAILY_RECORDS_DIR = 'daily-records';
const LEGACY_VEHICLES_FILE = 'vehicles.json';
const LEGACY_DAILY_DIR = 'daily';

const projectRoot = path.join(__dirname, '..', '..');
const destRoot = path.join(projectRoot, 'portable-seed', 'UserData');

const defaultMacSeed = path.join(
  process.env.HOME || process.env.USERPROFILE || '',
  'Library/Application Support/fuel-accounting/fuel-data',
);

async function exists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(d) {
  await fs.mkdir(d, { recursive: true });
}

async function rmrf(d) {
  await fs.rm(d, { recursive: true, force: true });
}

async function main() {
  const sourceRoot = process.env.FUEL_SEED || defaultMacSeed;
  if (!(await exists(sourceRoot))) {
    console.error('Не найдена папка-источник:', sourceRoot);
    console.error('Задайте FUEL_SEED или создайте данные в приложении.');
    process.exit(1);
  }

  await ensureDir(path.dirname(destRoot));
  if (await exists(destRoot)) {
    await rmrf(destRoot);
  }
  await ensureDir(destRoot);

  const destVl = path.join(destRoot, VEHICLE_LIBRARY_DIR);
  const destDaily = path.join(destRoot, DAILY_RECORDS_DIR);
  await ensureDir(destVl);
  await ensureDir(destDaily);

  const srcVlFile = path.join(sourceRoot, VEHICLE_LIBRARY_DIR, 'vehicles.json');
  const srcLegacyVeh = path.join(sourceRoot, LEGACY_VEHICLES_FILE);
  if (await exists(srcVlFile)) {
    await fs.copyFile(srcVlFile, path.join(destVl, 'vehicles.json'));
  } else if (await exists(srcLegacyVeh)) {
    await fs.copyFile(srcLegacyVeh, path.join(destVl, 'vehicles.json'));
  } else {
    console.warn('Нет vehicles.json в источнике — в seed будет пустой справочник.');
    await fs.writeFile(path.join(destVl, 'vehicles.json'), '{ "vehicles": [] }\n', 'utf8');
  }

  const srcDailyNew = path.join(sourceRoot, DAILY_RECORDS_DIR);
  const srcDailyOld = path.join(sourceRoot, LEGACY_DAILY_DIR);
  const dailySource = (await exists(srcDailyNew)) ? srcDailyNew : srcDailyOld;
  if (await exists(dailySource)) {
    for (const name of await fs.readdir(dailySource)) {
      if (name.endsWith('.json')) {
        await fs.copyFile(path.join(dailySource, name), path.join(destDaily, name));
      }
    }
  }

  console.log('Готово:');
  console.log(' ', destRoot);
  console.log('  ├── vehicle-library/vehicles.json');
  console.log('  └── daily-records/*.json');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
