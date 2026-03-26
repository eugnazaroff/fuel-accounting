const { app } = require('electron');
const fs = require('node:fs/promises');
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
  void fs.appendFile(file, line, 'utf8').catch(() => {
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
 * Не используем quitAndInstall: он запускает установщик пока процесс Electron ещё жив — файлы
 * остаются заблокированы (NSIS «не удалось закрыть приложение»). Планируем Setup через PowerShell.
 * @param {string} installerPath
 */
function scheduleDelayedNSISInstall(installerPath) {
  const fileJson = JSON.stringify(installerPath);
  const ps = `Start-Sleep -Seconds ${INSTALL_DELAY_SEC}; Start-Process -FilePath ${fileJson} -ArgumentList '--updated','--force-run'`;
  try {
    const child = spawn(
      'powershell.exe',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass', '-Command', ps],
      { detached: true, stdio: 'ignore', windowsHide: true },
    );
    child.unref();
    logLine(`scheduled NSIS install (delay ${INSTALL_DELAY_SEC}s): ${installerPath}`);
    return true;
  } catch (e) {
    logLine(`scheduleDelayedNSISInstall failed: ${formatErr(e)}`);
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
    logLine(`event: update-downloaded ${v} — delayed NSIS + app.quit`);
    send({ type: 'downloaded', version: v });

    const helper = autoUpdater.downloadedUpdateHelper;
    const installerPath = helper && typeof helper.file === 'string' ? helper.file : null;

    if (!installerPath) {
      logLine('no installer path on helper, fallback quitAndInstall');
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
