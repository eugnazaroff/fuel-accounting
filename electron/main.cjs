const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');
const { setupAutoUpdater } = require('./autoUpdate.cjs');
const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/** Папка справочника ТС: vehicle-library/vehicles.json */
const VEHICLE_LIBRARY_DIR = 'vehicle-library';
/** Помесячные/дневные записи: daily-records/YYYY-MM-DD.json */
const DAILY_RECORDS_DIR = 'daily-records';
/** Старый формат (до реорганизации) */
const LEGACY_VEHICLES_FILE = 'vehicles.json';
const LEGACY_DAILY_DIR = 'daily';
/** Прежняя папка только в dev на macOS/Linux рядом с Application Support */
const LEGACY_APP_DATA_SUBDIR = 'fuel-data';

async function fileExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Корень хранилища: внутри — vehicle-library и daily-records.
 * Windows portable (electron-builder): реальный .exe лежит у пользователя, а приложение
 * распаковывается во временный каталог — process.execPath указывает в TEMP. Лаунчер выставляет
 * PORTABLE_EXECUTABLE_DIR = папка с portable .exe (см. app-builder-lib/templates/nsis/portable.nsi).
 * Установщик NSIS (Program Files): данные в %AppData% (нельзя писать рядом с .exe).
 * Иначе: userData/fuel-accounting-data.
 * Переопределение: FUEL_DATA_DIR (абсолютный путь к этому корню).
 */
function getStorageRoot() {
  if (process.env.FUEL_DATA_DIR) {
    return process.env.FUEL_DATA_DIR;
  }
  if (app.isPackaged && process.platform === 'win32') {
    const portableDir = process.env.PORTABLE_EXECUTABLE_DIR;
    if (typeof portableDir === 'string' && portableDir.trim()) {
      return path.join(portableDir.trim(), 'UserData');
    }
    return path.join(app.getPath('userData'), 'fuel-accounting-data');
  }
  return path.join(app.getPath('userData'), 'fuel-accounting-data');
}

function getLegacyDevFuelDataPath() {
  return path.join(app.getPath('userData'), LEGACY_APP_DATA_SUBDIR);
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function copyDirRecursive(src, dest) {
  await ensureDir(dest);
  const entries = await fs.readdir(src, { withFileTypes: true });
  for (const e of entries) {
    const from = path.join(src, e.name);
    const to = path.join(dest, e.name);
    if (e.isDirectory()) {
      await copyDirRecursive(from, to);
    } else {
      await ensureDir(path.dirname(to));
      await fs.copyFile(from, to);
    }
  }
}

const DEV_BACKUP_DIR = '.fuel-dev-backup';
const DEV_BACKUP_META = '.meta.json';

function getDevBackupRoot() {
  return path.join(getStorageRoot(), DEV_BACKUP_DIR);
}

/** Перенос vehicles.json и daily/ внутри одного root. */
async function migrateLegacyLayoutWithinRoot(root) {
  const vehicleLibraryDir = path.join(root, VEHICLE_LIBRARY_DIR);
  const newVehiclesFile = path.join(vehicleLibraryDir, 'vehicles.json');
  const oldVehiclesFile = path.join(root, LEGACY_VEHICLES_FILE);

  if (!(await fileExists(newVehiclesFile)) && (await fileExists(oldVehiclesFile))) {
    await ensureDir(vehicleLibraryDir);
    await fs.rename(oldVehiclesFile, newVehiclesFile);
  }

  const dailyRecordsDir = path.join(root, DAILY_RECORDS_DIR);
  const oldDailyDir = path.join(root, LEGACY_DAILY_DIR);
  if (!(await fileExists(oldDailyDir))) {
    return;
  }
  await ensureDir(dailyRecordsDir);
  const names = await fs.readdir(oldDailyDir);
  for (const name of names) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const from = path.join(oldDailyDir, name);
    const to = path.join(dailyRecordsDir, name);
    if (!(await fileExists(to))) {
      await fs.rename(from, to);
    }
  }
  try {
    const rest = await fs.readdir(oldDailyDir);
    if (rest.length === 0) {
      await fs.rm(oldDailyDir, { recursive: false });
    }
  } catch {
    /* ignore */
  }
}

/**
 * Если новое хранилище пустое, копируем из ~/.../fuel-data (старый путь в разработке).
 */
async function copyFromLegacyDevFuelDataPath(targetRoot) {
  const legacyRoot = getLegacyDevFuelDataPath();
  if (path.resolve(legacyRoot) === path.resolve(targetRoot)) {
    return;
  }
  const targetVehicles = path.join(targetRoot, VEHICLE_LIBRARY_DIR, 'vehicles.json');
  if (await fileExists(targetVehicles)) {
    return;
  }
  const sourceVehicles = path.join(legacyRoot, LEGACY_VEHICLES_FILE);
  const sourceVl = path.join(legacyRoot, VEHICLE_LIBRARY_DIR, 'vehicles.json');
  await ensureDir(path.join(targetRoot, VEHICLE_LIBRARY_DIR));
  if (await fileExists(sourceVl)) {
    await fs.copyFile(sourceVl, targetVehicles);
  } else if (await fileExists(sourceVehicles)) {
    await fs.copyFile(sourceVehicles, targetVehicles);
  } else {
    return;
  }
  const sourceDailyNew = path.join(legacyRoot, DAILY_RECORDS_DIR);
  const sourceDailyOld = path.join(legacyRoot, LEGACY_DAILY_DIR);
  const destDaily = path.join(targetRoot, DAILY_RECORDS_DIR);
  await ensureDir(destDaily);
  const dailySource = (await fileExists(sourceDailyNew)) ? sourceDailyNew : sourceDailyOld;
  if (!(await fileExists(dailySource))) {
    return;
  }
  for (const name of await fs.readdir(dailySource)) {
    if (!name.endsWith('.json')) {
      continue;
    }
    const to = path.join(destDaily, name);
    if (!(await fileExists(to))) {
      await fs.copyFile(path.join(dailySource, name), to);
    }
  }
}

async function prepareStorage() {
  const root = getStorageRoot();
  await ensureDir(root);
  await migrateLegacyLayoutWithinRoot(root);
  await copyFromLegacyDevFuelDataPath(root);
  await migrateLegacyLayoutWithinRoot(root);
}

/** Путь к корню данных для UI и обратной совместимости IPC. */
function getDataRoot() {
  return getStorageRoot();
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    if (e && e.code === 'ENOENT') {
      return fallback;
    }
    throw e;
  }
}

async function writeJson(filePath, data) {
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (isDev) {
    win.loadURL('http://127.0.0.1:5173');
    win.webContents.openDevTools({ mode: 'detach' });
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.whenReady().then(async () => {
  await prepareStorage();

  ipcMain.handle('fuel:getDataRoot', async () => getDataRoot());

  ipcMain.handle('fuel:getAppVersion', async () => app.getVersion());

  ipcMain.handle('fuel:loadVehicles', async () => {
    const root = getDataRoot();
    const file = path.join(root, VEHICLE_LIBRARY_DIR, 'vehicles.json');
    const data = await readJson(file, { vehicles: [] });
    return Array.isArray(data.vehicles) ? data.vehicles : [];
  });

  ipcMain.handle('fuel:saveVehicles', async (_e, vehicles) => {
    const root = getDataRoot();
    const dir = path.join(root, VEHICLE_LIBRARY_DIR);
    await ensureDir(dir);
    const file = path.join(dir, 'vehicles.json');
    await writeJson(file, { vehicles });
    return true;
  });

  ipcMain.handle('fuel:loadDaily', async (_e, dateKey) => {
    const root = getDataRoot();
    const file = path.join(root, DAILY_RECORDS_DIR, `${dateKey}.json`);
    const data = await readJson(file, { date: dateKey, entries: {} });
    return data;
  });

  ipcMain.handle('fuel:saveDaily', async (_e, dateKey, payload) => {
    const root = getDataRoot();
    const dir = path.join(root, DAILY_RECORDS_DIR);
    await ensureDir(dir);
    const file = path.join(dir, `${dateKey}.json`);
    await writeJson(file, payload);
    return true;
  });

  ipcMain.handle('fuel:loadMonth', async (_e, year, month) => {
    const root = getDataRoot();
    const dir = path.join(root, DAILY_RECORDS_DIR);
    const prefix = `${year}-${String(month).padStart(2, '0')}-`;
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out = [];
    for (const name of files) {
      if (!name.endsWith('.json') || !name.startsWith(prefix)) {
        continue;
      }
      const dateKey = name.slice(0, -5);
      const filePath = path.join(dir, name);
      const data = await readJson(filePath, { date: dateKey, entries: {} });
      const date = data.date ?? dateKey;
      const entries = data.entries && typeof data.entries === 'object' ? data.entries : {};
      out.push({ date, entries });
    }
    out.sort((a, b) => a.date.localeCompare(b.date));
    return out;
  });

  ipcMain.handle('fuel:loadDailyRange', async (_e, startKey, endKey) => {
    const a = typeof startKey === 'string' ? startKey : '';
    const b = typeof endKey === 'string' ? endKey : '';
    if (!a || !b || a > b) {
      return [];
    }
    const root = getDataRoot();
    const dir = path.join(root, DAILY_RECORDS_DIR);
    let files = [];
    try {
      files = await fs.readdir(dir);
    } catch {
      return [];
    }
    const out = [];
    for (const name of files) {
      if (!name.endsWith('.json')) {
        continue;
      }
      const dateKey = name.slice(0, -5);
      if (dateKey.length !== 10 || dateKey < a || dateKey > b) {
        continue;
      }
      const filePath = path.join(dir, name);
      const data = await readJson(filePath, { date: dateKey, entries: {} });
      const date = data.date ?? dateKey;
      const entries = data.entries && typeof data.entries === 'object' ? data.entries : {};
      out.push({ date, entries });
    }
    out.sort((x, y) => x.date.localeCompare(y.date));
    return out;
  });

  if (!app.isPackaged) {
    ipcMain.handle('fuel:devEnsureBackup', async () => {
      try {
        const root = getStorageRoot();
        const backupRoot = getDevBackupRoot();
        const meta = path.join(backupRoot, DEV_BACKUP_META);
        if (await fileExists(meta)) {
          return { ok: true, created: false };
        }
        await ensureDir(backupRoot);
        const vl = path.join(root, VEHICLE_LIBRARY_DIR);
        const daily = path.join(root, DAILY_RECORDS_DIR);
        await ensureDir(vl);
        await ensureDir(daily);
        const bVl = path.join(backupRoot, VEHICLE_LIBRARY_DIR);
        const bDaily = path.join(backupRoot, DAILY_RECORDS_DIR);
        await fs.rm(bVl, { recursive: true, force: true });
        await fs.rm(bDaily, { recursive: true, force: true });
        await copyDirRecursive(vl, bVl);
        await copyDirRecursive(daily, bDaily);
        await writeJson(meta, { createdAt: new Date().toISOString() });
        return { ok: true, created: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
      }
    });

    ipcMain.handle('fuel:devBackupStatus', async () => {
      const meta = path.join(getDevBackupRoot(), DEV_BACKUP_META);
      return { hasBackup: await fileExists(meta) };
    });

    ipcMain.handle('fuel:devRestoreBackup', async () => {
      try {
        const root = getStorageRoot();
        const backupRoot = getDevBackupRoot();
        const meta = path.join(backupRoot, DEV_BACKUP_META);
        if (!(await fileExists(meta))) {
          return {
            ok: false,
            error: 'Сохранённой копии ещё нет — сначала сгенерируйте моковые данные.',
          };
        }
        const bVl = path.join(backupRoot, VEHICLE_LIBRARY_DIR);
        const bDaily = path.join(backupRoot, DAILY_RECORDS_DIR);
        const tVl = path.join(root, VEHICLE_LIBRARY_DIR);
        const tDaily = path.join(root, DAILY_RECORDS_DIR);
        await fs.rm(tVl, { recursive: true, force: true });
        await fs.rm(tDaily, { recursive: true, force: true });
        await copyDirRecursive(bVl, tVl);
        await copyDirRecursive(bDaily, tDaily);
        return { ok: true };
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return { ok: false, error: msg };
      }
    });
  }

  createWindow();

  setupAutoUpdater();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
