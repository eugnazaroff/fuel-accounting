/// <reference types="vite/client" />

declare global {
  type FuelUpdateEvent =
    | { type: 'checking' }
    | { type: 'available'; version: string }
    | { type: 'not-available' }
    | { type: 'progress'; percent: number }
    | { type: 'downloaded'; version: string }
    | { type: 'error'; message: string };

  interface Window {
    fuelApi: {
      getAppVersion: () => Promise<string>;
      getRuntimeInfo: () => Promise<{
        isPackaged: boolean;
        platform: string;
        userData: string;
        updaterLogFile: string;
      }>;
      onUpdateEvent: (callback: (event: FuelUpdateEvent) => void) => () => void;
      getDataRoot: () => Promise<string>;
      loadVehicles: () => Promise<import('./types').Vehicle[]>;
      saveVehicles: (vehicles: import('./types').Vehicle[]) => Promise<boolean>;
      loadDaily: (dateKey: string) => Promise<{
        date: string;
        entries: Record<string, import('./types').DailyEntry>;
      }>;
      saveDaily: (
        dateKey: string,
        payload: {
          date: string;
          entries: Record<string, import('./types').DailyEntry>;
        },
      ) => Promise<boolean>;
      loadMonth: (
        year: number,
        month: number,
      ) => Promise<Array<{ date: string; entries: Record<string, import('./types').DailyEntry> }>>;
      loadDailyRange: (
        startKey: string,
        endKey: string,
      ) => Promise<Array<{ date: string; entries: Record<string, import('./types').DailyEntry> }>>;
      devEnsureBackup: () => Promise<{ ok: boolean; created?: boolean; error?: string }>;
      devBackupStatus: () => Promise<{ hasBackup: boolean }>;
      devRestoreBackup: () => Promise<{ ok: boolean; error?: string }>;
    };
  }
}

export {};
