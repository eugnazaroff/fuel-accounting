const { app } = require('electron');
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { autoUpdater } = require('electron-updater');

/**
 * Базовый URL каталога, где лежат latest.yml и установщик (после electron-builder).
 * GitHub Pages (папка docs/updates в репозитории, см. npm run publish:updates-gh-pages):
 *   https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПО/updates/
 */
const HARDCODED_UPDATE_BASE_URL = 'https://eugnazaroff.github.io/fuel-accounting/updates/';

/** Пауза перед запуском NSIS после выхода процесса (сек.), чтобы снять блокировки с .exe. */
const INSTALL_DELAY_SEC = 8;

function normalizeBaseUrl(url) {
  if (!url || typeof url !== 'string') {
    return '';
  }
  const t = url.trim();
  if (!t) {
    return '';
  }
  return t.endsWith('/') ? t : `${t}/`;
}

function logLine(message) {
  const file = path.join(app.getPath('userData'), 'fuel-updater.log');
  const line = `[${new Date().toISOString()}] ${message}\n`;
  void fsPromises.appendFile(file, line, 'utf8').catch(() => {
    /* нет прав / диск */
  });
}

function formatErr(err) {
  if (!err) {
    return 'unknown error';
  }
  if (err instanceof Error) {
    return `${err.message}${err.stack ? `\n${err.stack}` : ''}`;
  }
  return String(err);
}

/**
 * Жёстко извлекаем путь к скачанному установщику (helper.file иногда не строка в рантайме).
 * @returns {string | null}
 */
function resolveInstallerPath(helper) {
  if (!helper) {
    return null;
  }
  const f = helper.file;
  if (typeof f === 'string' && f.length > 0) {
    return f;
  }
  if (f != null && typeof f === 'object' && typeof f.toString === 'function') {
    const s = String(f);
    if (s && s !== '[object Object]' && s.includes(path.sep)) {
      return s;
    }
  }
  return null;
}

/**
 * quitAndInstall стартует NSIS, пока Electron ещё держит файлы. Выходим из приложения,
 * отдельный cmd ждёт timeout и запускает Setup (без PowerShell — политики / парсинг аргументов).
 * @param {string} installerPath
 */
function scheduleDelayedNSISInstall(installerPath) {
  if (!fs.existsSync(installerPath)) {
    logLine(`scheduleDelayedNSISInstall: файла нет: ${installerPath}`);
    return false;
  }

  const quotedExe = `"${installerPath.replace(/"/g, '""')}"`;
  const batchPath = path.join(os.tmpdir(), `fuel-update-${Date.now()}-${process.pid}.bat`);
  const batchBody = [
    '@echo off',
    `timeout /t ${INSTALL_DELAY_SEC} /nobreak 1>nul 2>nul`,
    `${quotedExe} --updated --force-run`,
    '',
  ].join('\r\n');

  try {
    fs.writeFileSync(batchPath, batchBody, 'utf8');
  } catch (e) {
    logLine(`scheduleDelayedNSISInstall: не записать bat: ${formatErr(e)}`);
    return false;
  }

  const comspec = process.env.ComSpec || 'cmd.exe';
  try {
    /* start "" /min — отдельный процесс дерева, чтобы выход Electron не убил ожидание */
    const child = spawn(
      comspec,
      ['/c', 'start', '""', '/min', comspec, '/c', batchPath],
      {
        detached: true,
        windowsHide: true,
        stdio: 'ignore',
      },
    );
    child.on('error', (err) => {
      logLine(`spawn cmd start failed: ${formatErr(err)}`);
    });
    child.unref();
    logLine(`scheduled NSIS via ${batchPath} (wait ${INSTALL_DELAY_SEC}s) exe=${installerPath}`);
    return true;
  } catch (e) {
    logLine(`scheduleDelayedNSISInstall spawn: ${formatErr(e)}`);
    try {
      fs.unlinkSync(batchPath);
    } catch {
      /* ignore */
    }
    return false;
  }
}

/**
 * @param {import('electron').BrowserWindow | null | undefined} mainWindow
 */
function setupAutoUpdater(mainWindow) {
  const base = normalizeBaseUrl(process.env.FUEL_UPDATE_SERVER_URL || HARDCODED_UPDATE_BASE_URL);
  if (!app.isPackaged || process.platform !== 'win32' || !base) {
    logLine(
      `skip: isPackaged=${app.isPackaged} platform=${process.platform} base=${Boolean(base)}`,
    );
    return;
  }
  if (!base.startsWith('https://')) {
    logLine('skip: base URL must be https://');
    return;
  }

  function send(payload) {
    try {
      const w = mainWindow;
      if (w && !w.isDestroyed() && w.webContents && !w.webContents.isDestroyed()) {
        w.webContents.send('fuel:update-event', payload);
      }
    } catch {
      /* окно уже закрыто */
    }
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = false;

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: base,
  });

  logLine(`feed: ${base}`);

  autoUpdater.on('checking-for-update', () => {
    logLine('event: checking-for-update');
    send({ type: 'checking' });
  });

  autoUpdater.on('update-available', (info) => {
    const v = info && info.version ? info.version : '?';
    logLine(`event: update-available ${v}`);
    send({ type: 'available', version: v });
  });

  autoUpdater.on('update-not-available', (info) => {
    const v = info && info.version ? info.version : app.getVersion();
    logLine(`event: update-not-available (current ${v})`);
    send({ type: 'not-available' });
  });

  autoUpdater.on('download-progress', (p) => {
    const pct = typeof p.percent === 'number' ? p.percent : 0;
    if (pct === 0 || pct >= 100 || Math.round(pct) % 10 === 0) {
      logLine(`event: download-progress ${pct.toFixed(1)}%`);
    }
    send({ type: 'progress', percent: pct });
  });

  autoUpdater.on('update-downloaded', (info) => {
    const v = info && info.version ? info.version : '?';
    logLine(`event: update-downloaded ${v} — delayed NSIS (bat) + app.quit`);
    send({ type: 'downloaded', version: v });

    const installerPath = resolveInstallerPath(autoUpdater.downloadedUpdateHelper);
    if (!installerPath) {
      logLine(`no installer path helper=${Boolean(autoUpdater.downloadedUpdateHelper)}`);
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (e) {
        logLine(`quitAndInstall failed: ${formatErr(e)}`);
        send({ type: 'error', message: 'Не удалось запустить установщик обновления.' });
      }
      return;
    }

    if (!scheduleDelayedNSISInstall(installerPath)) {
      try {
        autoUpdater.quitAndInstall(false, true);
      } catch (e) {
        logLine(`quitAndInstall fallback failed: ${formatErr(e)}`);
        send({ type: 'error', message: 'Не удалось запустить установщик обновления.' });
      }
      return;
    }

    setImmediate(() => {
      try {
        app.quit();
      } catch (e) {
        logLine(`app.quit failed: ${formatErr(e)}`);
      }
    });
  });

  autoUpdater.on('error', (err) => {
    logLine(`event: error ${formatErr(err)}`);
    send({
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    });
  });

  const delayMs = 2000;
  setTimeout(() => {
    logLine(`checkForUpdates (after ${delayMs}ms)`);
    void autoUpdater.checkForUpdates().catch((e) => {
      logLine(`checkForUpdates rejected: ${formatErr(e)}`);
      send({
        type: 'error',
        message: e instanceof Error ? e.message : String(e),
      });
    });
  }, delayMs);
}

module.exports = { setupAutoUpdater };
