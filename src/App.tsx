import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DailyEntry, Vehicle } from './types';
import { applyMockDataset } from './dev';
import { VehiclesScreen } from './screens/VehiclesScreen';
import { DayScreen } from './screens/DayScreen';
import { StatsScreen } from './screens/StatsScreen';
import { CompareStatsScreen } from './screens/CompareStatsScreen';
import { useTheme } from './theme/ThemeProvider';

type Tab = 'vehicles' | 'day' | 'stats' | 'compare';

function formatUpdateLine(ev: FuelUpdateEvent): string {
  switch (ev.type) {
    case 'checking':
      return 'Обновления: проверка…';
    case 'available':
      return `Обновления: доступна v${ev.version}, скачивание…`;
    case 'not-available':
      return 'Обновления: у вас последняя версия';
    case 'progress':
      return `Обновления: скачано ${Math.round(ev.percent)}%`;
    case 'downloaded':
      return 'Обновления: приложение закроется, установщик откроется через несколько секунд…';
    case 'error':
      return `Обновления: ошибка — ${ev.message}`;
    default:
      return '';
  }
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export default function App() {
  const { theme, toggleTheme, isDark } = useTheme();
  const [tab, setTab] = useState<Tab>('day');
  const shellClass = tab === 'stats' || tab === 'compare' ? 'app-shell stats-wide' : 'app-shell';
  const [dataRoot, setDataRoot] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [dateKey, setDateKey] = useState(todayKey);
  const [entries, setEntries] = useState<Record<string, DailyEntry>>({});
  const [devHasBackup, setDevHasBackup] = useState(false);
  const [devMockBusy, setDevMockBusy] = useState(false);
  const [updateLine, setUpdateLine] = useState<string | null>(null);

  const hasFuelApi = typeof window !== 'undefined' && Boolean(window.fuelApi);
  const isViteDev = import.meta.env.DEV;

  const reloadVehicles = useCallback(async () => {
    if (!window.fuelApi) {
      return;
    }
    const list = await window.fuelApi.loadVehicles();
    setVehicles(list);
  }, []);

  const reloadDaily = useCallback(async () => {
    if (!window.fuelApi) {
      return;
    }
    const payload = await window.fuelApi.loadDaily(dateKey);
    setEntries(payload.entries ?? {});
  }, [dateKey]);

  useEffect(() => {
    if (!window.fuelApi) {
      return;
    }
    void window.fuelApi.getDataRoot().then(setDataRoot);
    void window.fuelApi.getAppVersion().then(setAppVersion);
  }, []);

  useEffect(() => {
    if (!window.fuelApi?.onUpdateEvent) {
      return;
    }
    const off = window.fuelApi.onUpdateEvent((ev) => {
      setUpdateLine(formatUpdateLine(ev));
    });
    return off;
  }, []);

  const refreshDevBackupStatus = useCallback(async () => {
    if (!isViteDev || !window.fuelApi) {
      return;
    }
    try {
      const s = await window.fuelApi.devBackupStatus();
      setDevHasBackup(s.hasBackup);
    } catch {
      setDevHasBackup(false);
    }
  }, [isViteDev]);

  useEffect(() => {
    void refreshDevBackupStatus();
  }, [refreshDevBackupStatus]);

  useEffect(() => {
    void reloadVehicles();
  }, [reloadVehicles]);

  useEffect(() => {
    void reloadDaily();
  }, [reloadDaily]);

  const saveVehicles = useCallback(
    async (next: Vehicle[]) => {
      if (!window.fuelApi) {
        return;
      }
      await window.fuelApi.saveVehicles(next);
      setVehicles(next);
    },
    [],
  );

  const saveEntries = useCallback(
    async (next: Record<string, DailyEntry>) => {
      if (!window.fuelApi) {
        return;
      }
      await window.fuelApi.saveDaily(dateKey, { date: dateKey, entries: next });
      setEntries(next);
    },
    [dateKey],
  );

  const completedCount = useMemo(
    () => Object.values(entries).filter((e) => e.completed).length,
    [entries],
  );

  const handleDevGenerateMock = useCallback(async () => {
    if (!window.fuelApi || !isViteDev || devMockBusy) {
      return;
    }
    const ok = window.confirm(
      'Сохранить текущие данные в скрытую копию (только при первом запуске) и заменить всё моками: 4 ТС и дневные записи за полный прошлый календарный год?',
    );
    if (!ok) {
      return;
    }
    setDevMockBusy(true);
    try {
      const backup = await window.fuelApi.devEnsureBackup();
      if (!backup.ok) {
        window.alert(backup.error ?? 'Не удалось сохранить копию данных.');
        return;
      }
      await applyMockDataset(window.fuelApi);
      await reloadVehicles();
      await reloadDaily();
      await refreshDevBackupStatus();
      window.alert(
        backup.created
          ? 'Моковые данные записаны. Оригинал сохранён — можно восстановить кнопкой ниже.'
          : 'Моковые данные обновлены. Оригинал по-прежнему как при первой генерации моков.',
      );
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Ошибка при генерации моков.');
    } finally {
      setDevMockBusy(false);
    }
  }, [devMockBusy, isViteDev, refreshDevBackupStatus, reloadDaily, reloadVehicles]);

  const handleDevRestoreOriginal = useCallback(async () => {
    if (!window.fuelApi || !isViteDev || devMockBusy || !devHasBackup) {
      return;
    }
    const ok = window.confirm('Восстановить данные из сохранённой копии (до первой генерации моков)?');
    if (!ok) {
      return;
    }
    setDevMockBusy(true);
    try {
      const r = await window.fuelApi.devRestoreBackup();
      if (!r.ok) {
        window.alert(r.error ?? 'Не удалось восстановить.');
        return;
      }
      await reloadVehicles();
      await reloadDaily();
      window.alert('Данные восстановлены.');
    } catch (e) {
      window.alert(e instanceof Error ? e.message : 'Ошибка восстановления.');
    } finally {
      setDevMockBusy(false);
    }
  }, [devHasBackup, devMockBusy, isViteDev, reloadDaily, reloadVehicles]);

  if (!hasFuelApi) {
    return (
      <div className="app-shell card">
        <h1>Учёт расхода топлива</h1>
        <p className="error">
          Запустите через Electron: <code>npm run start:desktop</code> или два терминала —{' '}
          <code>npm run dev</code> и <code>npm run dev:app</code>.
        </p>
      </div>
    );
  }

  const themeLabel = isDark ? '☀️ Светлая' : '🌙 Тёмная';

  return (
    <div className={shellClass}>
      <div className="app-top">
        <div className="app-top-left">
          {appVersion ? (
            <span className="app-version" title="Версия приложения">
              v{appVersion}
            </span>
          ) : null}
          <div className="tabs">
            <button
              type="button"
              className={`tab ${tab === 'day' ? 'active' : ''}`}
              onClick={() => setTab('day')}
            >
              Учёт за день
            </button>
            <button
              type="button"
              className={`tab ${tab === 'vehicles' ? 'active' : ''}`}
              onClick={() => setTab('vehicles')}
            >
              Автомобили
            </button>
            <button
              type="button"
              className={`tab ${tab === 'stats' ? 'active' : ''}`}
              onClick={() => setTab('stats')}
            >
              Статистика
            </button>
            <button
              type="button"
              className={`tab ${tab === 'compare' ? 'active' : ''}`}
              onClick={() => setTab('compare')}
            >
              Сравнение
            </button>
          </div>
        </div>
        <div className="app-top-left app-top-trailing">
          <button type="button" className="theme-toggle" onClick={toggleTheme} title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}>
            {themeLabel}
          </button>
          {dataRoot ? (
            <span className="data-path" title="vehicle-library — справочник ТС; daily-records — JSON по дням">
              Данные: <code>{dataRoot}</code>
            </span>
          ) : null}
        </div>
      </div>

      {updateLine ? (
        <p
          className={`app-update-hint${updateLine.includes('ошибка') ? ' is-error' : ''}`}
          role="status"
        >
          {updateLine}
        </p>
      ) : null}

      {isViteDev ? (
        <div className="dev-mock-bar" role="region" aria-label="Режим разработки — моковые данные">
          <span className="dev-mock-label">Dev</span>
          <button
            type="button"
            className="btn secondary btn-sm"
            disabled={devMockBusy}
            onClick={handleDevGenerateMock}
          >
            Сгенерировать моковые данные
          </button>
          <button
            type="button"
            className="btn secondary btn-sm"
            disabled={devMockBusy || !devHasBackup}
            onClick={handleDevRestoreOriginal}
            title={!devHasBackup ? 'Сначала один раз сгенерируйте моки — тогда появится копия оригинала' : undefined}
          >
            Загрузить оригинальные данные
          </button>
        </div>
      ) : null}

      {tab === 'vehicles' ? (
        <VehiclesScreen vehicles={vehicles} onSave={saveVehicles} />
      ) : tab === 'stats' ? (
        <StatsScreen vehicles={vehicles} />
      ) : tab === 'compare' ? (
        <CompareStatsScreen vehicles={vehicles} />
      ) : (
        <DayScreen
          dateKey={dateKey}
          onDateChange={setDateKey}
          vehicles={vehicles}
          entries={entries}
          onSaveEntries={saveEntries}
          completedCount={completedCount}
        />
      )}
    </div>
  );
}
