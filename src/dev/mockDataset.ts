import { buildCompletedEntry } from '../domain';
import type { DailyEntry, Vehicle, VehicleType } from '../types';

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randFloat(min: number, max: number, decimals = 1): number {
  const v = Math.random() * (max - min) + min;
  return Math.round(v * 10 ** decimals) / 10 ** decimals;
}

function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Зима (РФ): декабрь, январь, февраль — прогрев, простои, сугробы → заметно выше расход в моках. */
function isWinterDateKey(dateKey: string): boolean {
  const m = Number(dateKey.slice(5, 7));
  return m === 12 || m === 1 || m === 2;
}

/** Полный прошлый календарный год: 1 янв — 31 дек (удобно для статистики и сравнения месяцев). */
export function mockDateRangeKeys(): string[] {
  const keys: string[] = [];
  const today = new Date();
  const y = today.getFullYear() - 1;
  const start = new Date(y, 0, 1, 12, 0, 0, 0);
  const end = new Date(y, 11, 31, 12, 0, 0, 0);
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    keys.push(toDateKey(new Date(d)));
  }
  return keys;
}

export function generateMockVehicles(): Vehicle[] {
  const specs: Array<{
    plate: string;
    name: string;
    type: VehicleType;
    norm: number;
    litersPerTrip?: number;
  }> = [
    { plate: 'А 001 МО', name: 'Мок легковой', type: 'passenger', norm: randFloat(7.5, 13.5, 1) },
    { plate: 'В 102 УР', name: 'Мок трактор', type: 'tractor', norm: randFloat(11, 21, 1) },
    { plate: 'С 303 КХ', name: 'Мок автобус', type: 'bus', norm: randFloat(18, 32, 1) },
    {
      plate: 'Е 404 СС',
      name: 'Мок ассенизатор',
      type: 'cesspool',
      norm: randFloat(22, 38, 1),
      litersPerTrip: randFloat(14, 32, 1),
    },
  ];
  return specs.map((s) => ({
    id: crypto.randomUUID(),
    plateNumber: s.plate,
    name: s.name,
    type: s.type,
    norm: s.norm,
    ...(s.litersPerTrip != null ? { litersPerTrip: s.litersPerTrip } : {}),
  }));
}

function randomDayInputs(v: Vehicle, dateKey: string): {
  kmDriven: number;
  motorHours: number | null;
  tripCount: number;
  morningRemainderLiters: number;
  refueledLiters: number;
} {
  const w = isWinterDateKey(dateKey);
  let kmDriven: number;
  let motorHours: number | null = null;
  let tripCount = 0;

  if (v.type === 'tractor') {
    motorHours = w ? randInt(5, 13) : randInt(2, 9);
    kmDriven = w ? randInt(12, 95) : randInt(5, 65);
  } else if (v.type === 'bus') {
    kmDriven = w ? randInt(72, 360) : randInt(40, 280);
  } else if (v.type === 'cesspool') {
    kmDriven = w ? randInt(28, 165) : randInt(15, 120);
    tripCount = w ? randInt(2, 11) : randInt(0, 7);
  } else {
    kmDriven = w ? randInt(42, 295) : randInt(25, 220);
  }

  const morningRemainderLiters = w ? randFloat(28, 92, 1) : randFloat(18, 88, 1);
  const refuelChance = w ? 0.52 : 0.32;
  const refueledLiters = Math.random() < refuelChance ? (w ? randFloat(22, 72, 1) : randFloat(12, 58, 1)) : 0;

  return {
    kmDriven,
    motorHours,
    tripCount,
    morningRemainderLiters,
    refueledLiters,
  };
}

export function generateDayEntries(
  vehicles: Vehicle[],
  odometerById: Record<string, number>,
  dateKey: string,
): Record<string, DailyEntry> {
  const out: Record<string, DailyEntry> = {};

  for (const v of vehicles) {
    const morningOdometerKm = odometerById[v.id];
    const { kmDriven, motorHours, tripCount, morningRemainderLiters, refueledLiters } =
      randomDayInputs(v, dateKey);

    const entry = buildCompletedEntry(v, {
      vehicleId: v.id,
      morningOdometerKm,
      morningRemainderLiters,
      refueledLiters,
      kmDriven,
      motorHours,
      tripCount,
    });
    out[v.id] = entry;

    const nextOdo =
      entry.eveningOdometerKm !== undefined
        ? entry.eveningOdometerKm
        : morningOdometerKm + kmDriven;
    odometerById[v.id] = nextOdo;
  }

  return out;
}

export function initOdometers(vehicles: Vehicle[]): Record<string, number> {
  return Object.fromEntries(vehicles.map((v) => [v.id, randInt(8000, 140000)]));
}

export async function applyMockDataset(
  api: Pick<typeof window.fuelApi, 'saveVehicles' | 'saveDaily'>,
): Promise<void> {
  const vehicles = generateMockVehicles();
  await api.saveVehicles(vehicles);
  const dates = mockDateRangeKeys();
  const odometerById = initOdometers(vehicles);

  for (const dateKey of dates) {
    const entries = generateDayEntries(vehicles, odometerById, dateKey);
    await api.saveDaily(dateKey, { date: dateKey, entries });
  }
}
