const { app } = require('electron');
const { autoUpdater } = require('electron-updater');

/**
 * Базовый URL каталога, где лежат latest.yml и установщик (после electron-builder).
 * Задайте переменную окружения или впишите HTTPS URL ниже (без пробелов, с / на конце или без).
 * GitHub Pages (папка docs/updates в репозитории, см. npm run publish:updates-gh-pages):
 *   https://ВАШ_ЛОГИН.github.io/ИМЯ_РЕПО/updates/
 */
const HARDCODED_UPDATE_BASE_URL = 'https://eugnazaroff.github.io/fuel-accounting/updates/';

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

/**
 * Автообновление (electron-updater + NSIS). Бесшумная проверка при каждом запуске,
 * фоновая загрузка, после готовности — перезапуск и установка новой версии.
 * Работает только в собранном приложении Windows с HTTPS.
 */
function setupAutoUpdater() {
  const base = normalizeBaseUrl(process.env.FUEL_UPDATE_SERVER_URL || HARDCODED_UPDATE_BASE_URL);
  if (!app.isPackaged || process.platform !== 'win32' || !base) {
    return;
  }
  if (!base.startsWith('https://')) {
    return;
  }

  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.setFeedURL({
    provider: 'generic',
    url: base,
  });

  autoUpdater.on('error', () => {
    /* сеть / 404 — не показываем */
  });

  autoUpdater.on('update-downloaded', () => {
    try {
      autoUpdater.quitAndInstall(false, true);
    } catch {
      /* ignore */
    }
  });

  void autoUpdater.checkForUpdates();
}

module.exports = { setupAutoUpdater };
