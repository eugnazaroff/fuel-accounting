import type { DailyEntry, Vehicle, VehicleType } from '../types';
import { VEHICLE_TYPE_LABELS } from '../domain';

export type MonthDayPayload = { date: string; entries: Record<string, DailyEntry> };

const RU_MONTHS_SHORT = [
  'янв',
  'фев',
  'мар',
  'апр',
  'май',
  'июн',
  'июл',
  'авг',
  'сен',
  'окт',
  'ноя',
  'дек',
];

const RU_MONTHS_FULL = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

export function dateKeyLabel(dateKey: string): string {
  const parts = dateKey.split('-').map(Number);
  const day = parts[2];
  const mo = parts[1];
  if (!day || !mo) {
    return dateKey;
  }
  return `${day} ${RU_MONTHS_SHORT[mo - 1]}`;
}

export function calendarDateKeysInMonth(year: number, month: number): string[] {
  const last = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  const keys: string[] = [];
  for (let d = 1; d <= last; d++) {
    keys.push(`${year}-${mm}-${String(d).padStart(2, '0')}`);
  }
  return keys;
}

function monthTitle(year: number, month: number): string {
  return `${RU_MONTHS_FULL[month - 1]} ${year}`;
}

export interface MonthStats {
  year: number;
  month: number;
  monthTitle: string;
  daily: Array<{
    date: string;
    label: string;
    liters: number;
    km: number;
    records: number;
  }>;
  cumulative: Array<{ date: string; label: string; liters: number }>;
  perVehicle: Array<{
    vehicleId: string;
    label: string;
    type: VehicleType;
    totalLiters: number;
    totalKm: number;
    daysActive: number;
    tripLiters: number;
    tripCount: number;
    refuelDays: number;
  }>;
  byType: Array<{ type: VehicleType; typeLabel: string; liters: number }>;
  kpis: {
    totalLiters: number;
    totalKm: number;
    completedRecords: number;
    activeCalendarDays: number;
    vehiclesTouched: number;
    refuelEvents: number;
    avgLitersPerBusyDay: number;
    avgKmPerRecord: number;
  };
  pieVehicles: Array<{ name: string; value: number }>;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function buildMonthStats(
  year: number,
  month: number,
  loadedDays: MonthDayPayload[],
  vehicles: Vehicle[],
): MonthStats {
  const byDate = new Map<string, MonthDayPayload>();
  for (const p of loadedDays) {
    byDate.set(p.date, p);
  }
  const vehicleById = new Map(vehicles.map((v) => [v.id, v]));

  const aggVehicle = new Map<
    string,
    {
      totalLiters: number;
      totalKm: number;
      daysActive: number;
      tripLiters: number;
      tripCount: number;
      refuelDays: number;
      type: VehicleType;
    }
  >();

  const typeLiters = new Map<VehicleType, number>();
  for (const t of Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]) {
    typeLiters.set(t, 0);
  }

  let totalLiters = 0;
  let totalKm = 0;
  let completedRecords = 0;
  let refuelEvents = 0;
  let activeCalendarDays = 0;

  const calendarKeys = calendarDateKeysInMonth(year, month);
  const daily: MonthStats['daily'] = [];

  for (const dateKey of calendarKeys) {
    const payload = byDate.get(dateKey);
    let dayLiters = 0;
    let dayKm = 0;
    let records = 0;

    if (payload) {
      for (const [vehicleId, e] of Object.entries(payload.entries)) {
        if (!e.completed) {
          continue;
        }
        records += 1;
        dayLiters += e.actualConsumptionLiters;
        dayKm += e.kmDriven;
        totalLiters += e.actualConsumptionLiters;
        totalKm += e.kmDriven;
        completedRecords += 1;
        if (e.hadRefuel) {
          refuelEvents += 1;
        }

        const type = e.vehicleTypeSnapshot;
        typeLiters.set(type, (typeLiters.get(type) ?? 0) + e.actualConsumptionLiters);

        const tripL = e.cesspoolTripFuelLiters ?? 0;
        const tripC = e.cesspoolTripCount ?? 0;
        const cur =
          aggVehicle.get(vehicleId) ??
          {
            totalLiters: 0,
            totalKm: 0,
            daysActive: 0,
            tripLiters: 0,
            tripCount: 0,
            refuelDays: 0,
            type,
          };
        cur.totalLiters += e.actualConsumptionLiters;
        cur.totalKm += e.kmDriven;
        cur.daysActive += 1;
        cur.tripLiters += tripL;
        cur.tripCount += tripC;
        if (e.hadRefuel) {
          cur.refuelDays += 1;
        }
        cur.type = type;
        aggVehicle.set(vehicleId, cur);
      }
    }
    if (records > 0) {
      activeCalendarDays += 1;
    }
    daily.push({
      date: dateKey,
      label: dateKeyLabel(dateKey),
      liters: round2(dayLiters),
      km: round2(dayKm),
      records,
    });
  }

  let cum = 0;
  const cumulative = daily.map((d) => {
    cum += d.liters;
    return { date: d.date, label: d.label, liters: round2(cum) };
  });

  const perVehicle: MonthStats['perVehicle'] = [];
  for (const [vehicleId, a] of aggVehicle) {
    const vMeta = vehicleById.get(vehicleId);
    const label = vMeta ? `${vMeta.plateNumber} · ${vMeta.name}` : vehicleId;
    perVehicle.push({
      vehicleId,
      label,
      type: a.type,
      totalLiters: round2(a.totalLiters),
      totalKm: round2(a.totalKm),
      daysActive: a.daysActive,
      tripLiters: round2(a.tripLiters),
      tripCount: a.tripCount,
      refuelDays: a.refuelDays,
    });
  }
  perVehicle.sort((a, b) => b.totalLiters - a.totalLiters);

  const byType: MonthStats['byType'] = [];
  for (const type of typeLiters.keys()) {
    const liters = typeLiters.get(type) ?? 0;
    if (liters > 0) {
      byType.push({ type, typeLabel: VEHICLE_TYPE_LABELS[type], liters: round2(liters) });
    }
  }
  byType.sort((a, b) => b.liters - a.liters);

  const vehiclesTouched = perVehicle.length;
  const daysWithFuel = daily.filter((d) => d.liters > 0).length;
  const avgLitersPerBusyDay =
    daysWithFuel > 0 ? round2(totalLiters / daysWithFuel) : 0;
  const avgKmPerRecord =
    completedRecords > 0 ? round2(totalKm / completedRecords) : 0;

  const pieVehicles: Array<{ name: string; value: number }> = [];
  const sortedV = [...perVehicle].sort((a, b) => b.totalLiters - a.totalLiters);
  const top = sortedV.slice(0, 8);
  const restSum = sortedV.slice(8).reduce((s, v2) => s + v2.totalLiters, 0);
  for (const v2 of top) {
    const nm = v2.label.length > 24 ? `${v2.label.slice(0, 22)}…` : v2.label;
    pieVehicles.push({ name: nm, value: v2.totalLiters });
  }
  if (restSum > 0) {
    pieVehicles.push({ name: 'Прочие ТС', value: round2(restSum) });
  }

  return {
    year,
    month,
    monthTitle: monthTitle(year, month),
    daily,
    cumulative,
    perVehicle,
    byType,
    kpis: {
      totalLiters: round2(totalLiters),
      totalKm: round2(totalKm),
      completedRecords,
      activeCalendarDays,
      vehiclesTouched,
      refuelEvents,
      avgLitersPerBusyDay,
      avgKmPerRecord,
    },
    pieVehicles,
  };
}
