/// <reference types="vite/client" />

declare global {
  interface Window {
    fuelApi: {
      getAppVersion: () => Promise<string>;
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
