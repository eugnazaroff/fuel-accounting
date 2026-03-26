import type { DailyEntry, Vehicle } from '../types';
import type { MonthDayPayload } from './aggregateMonth';
import { dateKeyLabel } from './aggregateMonth';

const RU_MONTHS = [
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

export type VehiclePeriodStats = {
  hasData: boolean;
  vehicleId: string;
  vehicleTitle: string;
  periodTitle: string;
  startKey: string;
  endKey: string;
  kpis: {
    activeDays: number;
    calendarDaysInRange: number;
    shareBusyPercent: number;
    totalLiters: number;
    totalKm: number;
    totalMotorHours: number;
    totalRefuelLiters: number;
    refuelDays: number;
    totalTrips: number;
    tripLiters: number;
    avgLitersPerActiveDay: number;
    avgKmPerActiveDay: number;
    avgTripsPerCesspoolDay: number;
  };
  extremes: {
    maxFuelDay: { date: string; label: string; liters: number } | null;
    minFuelDay: { date: string; label: string; liters: number } | null;
    maxKmDay: { date: string; label: string; km: number } | null;
    minKmDay: { date: string; label: string; km: number } | null;
    maxFuelMonth: { key: string; label: string; liters: number; days: number } | null;
    minFuelMonth: { key: string; label: string; liters: number; days: number } | null;
    busiestWeek: { startKey: string; label: string; liters: number; km: number; days: number } | null;
    quietestWeek: { startKey: string; label: string; liters: number; km: number; days: number } | null;
  };
  dailySeries: Array<{ date: string; label: string; liters: number; km: number }>;
  monthlySeries: Array<{ monthKey: string; label: string; liters: number; km: number; days: number }>;
};

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseKey(dateKey: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

function toKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Понедельник календарной недели для даты. */
function mondayOfWeek(d: Date): Date {
  const day = d.getDay();
  const back = day === 0 ? 6 : day - 1;
  const x = new Date(d);
  x.setDate(x.getDate() - back);
  return x;
}

function weekStartKey(dateKey: string): string {
  return toKey(mondayOfWeek(parseKey(dateKey)));
}

function monthKeyFromDateKey(dateKey: string): string {
  return dateKey.slice(0, 7);
}

function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${RU_MONTHS[m - 1]} ${y}`;
}

function calendarDaysInclusive(startKey: string, endKey: string): number {
  const a = parseKey(startKey).getTime();
  const b = parseKey(endKey).getTime();
  return Math.max(0, Math.round((b - a) / 86400000) + 1);
}

function pickMinMax<T>(items: T[], getVal: (t: T) => number): { min: T | null; max: T | null } {
  let min: T | null = null;
  let max: T | null = null;
  for (const it of items) {
    const v = getVal(it);
    if (min == null || v < getVal(min)) {
      min = it;
    }
    if (max == null || v > getVal(max)) {
      max = it;
    }
  }
  return { min, max };
}

export function buildVehiclePeriodStats(
  vehicle: Vehicle,
  days: MonthDayPayload[],
  startKey: string,
  endKey: string,
  periodTitle: string,
): VehiclePeriodStats {
  const vehicleTitle = `${vehicle.plateNumber} · ${vehicle.name}`;
  const calendarDaysInRange = calendarDaysInclusive(startKey, endKey);

  type Row = { date: string; entry: DailyEntry };
  const rows: Row[] = [];
  for (const day of days) {
    if (day.date < startKey || day.date > endKey) {
      continue;
    }
    const e = day.entries[vehicle.id];
    if (e?.completed) {
      rows.push({ date: day.date, entry: e });
    }
  }
  rows.sort((x, y) => x.date.localeCompare(y.date));

  if (rows.length === 0) {
    return {
      hasData: false,
      vehicleId: vehicle.id,
      vehicleTitle,
      periodTitle,
      startKey,
      endKey,
      kpis: {
        activeDays: 0,
        calendarDaysInRange,
        shareBusyPercent: 0,
        totalLiters: 0,
        totalKm: 0,
        totalMotorHours: 0,
        totalRefuelLiters: 0,
        refuelDays: 0,
        totalTrips: 0,
        tripLiters: 0,
        avgLitersPerActiveDay: 0,
        avgKmPerActiveDay: 0,
        avgTripsPerCesspoolDay: 0,
      },
      extremes: {
        maxFuelDay: null,
        minFuelDay: null,
        maxKmDay: null,
        minKmDay: null,
        maxFuelMonth: null,
        minFuelMonth: null,
        busiestWeek: null,
        quietestWeek: null,
      },
      dailySeries: [],
      monthlySeries: [],
    };
  }

  let totalLiters = 0;
  let totalKm = 0;
  let totalMotorHours = 0;
  let totalRefuelLiters = 0;
  let refuelDays = 0;
  let totalTrips = 0;
  let tripLiters = 0;
  let cesspoolActiveDays = 0;

  const dailySeries = rows.map((r) => {
    const e = r.entry;
    totalLiters += e.actualConsumptionLiters;
    totalKm += e.kmDriven;
    if (e.motorHours != null && !Number.isNaN(e.motorHours)) {
      totalMotorHours += e.motorHours;
    }
    totalRefuelLiters += e.refueledLiters;
    if (e.refueledLiters > 0) {
      refuelDays += 1;
    }
    if (e.cesspoolTripCount != null && e.cesspoolTripCount > 0) {
      cesspoolActiveDays += 1;
      totalTrips += e.cesspoolTripCount;
    }
    if (e.cesspoolTripFuelLiters != null) {
      tripLiters += e.cesspoolTripFuelLiters;
    }
    return {
      date: r.date,
      label: dateKeyLabel(r.date),
      liters: round2(e.actualConsumptionLiters),
      km: round1(e.kmDriven),
    };
  });

  const activeDays = rows.length;
  const avgLitersPerActiveDay = round2(totalLiters / activeDays);
  const avgKmPerActiveDay = round1(totalKm / activeDays);
  const avgTripsPerCesspoolDay =
    cesspoolActiveDays > 0 ? round1(totalTrips / cesspoolActiveDays) : 0;
  const shareBusyPercent =
    calendarDaysInRange > 0 ? round1((activeDays / calendarDaysInRange) * 100) : 0;

  const byDayFuel = rows.map((r) => ({
    date: r.date,
    label: dateKeyLabel(r.date),
    liters: r.entry.actualConsumptionLiters,
  }));
  const byDayKm = rows.map((r) => ({
    date: r.date,
    label: dateKeyLabel(r.date),
    km: rEntryKm(r.entry),
  }));

  const { min: minF, max: maxF } = pickMinMax(byDayFuel, (x) => x.liters);
  const { min: minKm, max: maxKm } = pickMinMax(byDayKm, (x) => x.km);

  const monthMap = new Map<string, { liters: number; km: number; days: number }>();
  const weekMap = new Map<string, { liters: number; km: number; days: number }>();

  for (const r of rows) {
    const mk = monthKeyFromDateKey(r.date);
    const wk = weekStartKey(r.date);
    const e = r.entry;
    const km = rEntryKm(e);
    const lit = e.actualConsumptionLiters;

    const mo = monthMap.get(mk) ?? { liters: 0, km: 0, days: 0 };
    mo.liters += lit;
    mo.km += km;
    mo.days += 1;
    monthMap.set(mk, mo);

    const wo = weekMap.get(wk) ?? { liters: 0, km: 0, days: 0 };
    wo.liters += lit;
    wo.km += km;
    wo.days += 1;
    weekMap.set(wk, wo);
  }

  const monthlyArr = [...monthMap.entries()].map(([monthKey, v]) => ({
    monthKey,
    label: monthLabel(monthKey),
    liters: round2(v.liters),
    km: round1(v.km),
    days: v.days,
  }));
  monthlyArr.sort((a, b) => a.monthKey.localeCompare(b.monthKey));

  const weekArr = [...weekMap.entries()].map(([startKeyW, v]) => ({
    startKey: startKeyW,
    label: formatWeekLabel(startKeyW),
    liters: round2(v.liters),
    km: round1(v.km),
    days: v.days,
  }));
  weekArr.sort((a, b) => a.startKey.localeCompare(b.startKey));

  const { min: minMo, max: maxMo } = pickMinMax(monthlyArr, (x) => x.liters);
  const weeksPositive = weekArr.filter((w) => w.liters > 0);
  let busiestWeek: VehiclePeriodStats['extremes']['busiestWeek'] = null;
  let quietestWeek: VehiclePeriodStats['extremes']['quietestWeek'] = null;
  if (weeksPositive.length > 0) {
    const maxW = weeksPositive.reduce((a, w) => (w.liters > a.liters ? w : a));
    const minW = weeksPositive.reduce((a, w) => (w.liters < a.liters ? w : a));
    busiestWeek = { ...maxW };
    quietestWeek = { ...minW };
  }

  return {
    hasData: true,
    vehicleId: vehicle.id,
    vehicleTitle,
    periodTitle,
    startKey,
    endKey,
    kpis: {
      activeDays,
      calendarDaysInRange,
      shareBusyPercent,
      totalLiters: round2(totalLiters),
      totalKm: round1(totalKm),
      totalMotorHours: round1(totalMotorHours),
      totalRefuelLiters: round2(totalRefuelLiters),
      refuelDays,
      totalTrips,
      tripLiters: round2(tripLiters),
      avgLitersPerActiveDay,
      avgKmPerActiveDay,
      avgTripsPerCesspoolDay,
    },
    extremes: {
      maxFuelDay: maxF
        ? { date: maxF.date, label: maxF.label, liters: round2(maxF.liters) }
        : null,
      minFuelDay: minF
        ? { date: minF.date, label: minF.label, liters: round2(minF.liters) }
        : null,
      maxKmDay: maxKm
        ? { date: maxKm.date, label: maxKm.label, km: round1(maxKm.km) }
        : null,
      minKmDay: minKm
        ? { date: minKm.date, label: minKm.label, km: round1(minKm.km) }
        : null,
      maxFuelMonth: maxMo
        ? {
            key: maxMo.monthKey,
            label: maxMo.label,
            liters: maxMo.liters,
            days: maxMo.days,
          }
        : null,
      minFuelMonth: minMo
        ? {
            key: minMo.monthKey,
            label: minMo.label,
            liters: minMo.liters,
            days: minMo.days,
          }
        : null,
      busiestWeek,
      quietestWeek,
    },
    dailySeries,
    monthlySeries: monthlyArr,
  };
}

function rEntryKm(e: DailyEntry): number {
  if (typeof e.kmDriven === 'number' && !Number.isNaN(e.kmDriven)) {
    return e.kmDriven;
  }
  return 0;
}

function formatWeekLabel(mondayKey: string): string {
  const mon = parseKey(mondayKey);
  const sun = new Date(mon);
  sun.setDate(sun.getDate() + 6);
  const a = dateKeyLabel(mondayKey);
  const b = dateKeyLabel(toKey(sun));
  return `${a} — ${b}`;
}

export type VehicleStatsPeriodTab = 'week' | 'month' | 'year' | 'range';

export function vehicleStatsMonthValueNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function resolveVehicleStatsBounds(
  tab: VehicleStatsPeriodTab,
  monthValue: string,
  yearValue: number,
  rangeStart: string,
  rangeEnd: string,
): { startKey: string; endKey: string; title: string } {
  const today = new Date();
  const todayKey = toKey(today);

  if (tab === 'week') {
    const mon = mondayOfWeek(today);
    const startKey = toKey(mon);
    return {
      startKey,
      endKey: todayKey,
      title: 'Текущая неделя (пн — сегодня)',
    };
  }

  if (tab === 'month') {
    const parts = monthValue.split('-').map(Number);
    const y = parts[0];
    const m = parts[1];
    if (!y || !m || m < 1 || m > 12) {
      return { startKey: todayKey, endKey: todayKey, title: 'Месяц' };
    }
    const mm = String(m).padStart(2, '0');
    const first = `${y}-${mm}-01`;
    const lastD = new Date(y, m, 0).getDate();
    const last = `${y}-${mm}-${String(lastD).padStart(2, '0')}`;
    let endKey = last;
    if (last > todayKey) {
      endKey = todayKey;
    }
    if (first > todayKey) {
      return {
        startKey: first,
        endKey: first,
        title: `${RU_MONTHS[m - 1]} ${y}`,
      };
    }
    return {
      startKey: first,
      endKey,
      title: `${RU_MONTHS[m - 1]} ${y}`,
    };
  }

  if (tab === 'year') {
    const y = yearValue;
    const first = `${y}-01-01`;
    const last = `${y}-12-31`;
    let endKey = last;
    if (last > todayKey) {
      endKey = todayKey;
    }
    let startKey = first;
    if (first > todayKey) {
      startKey = todayKey;
      endKey = todayKey;
    }
    return {
      startKey,
      endKey,
      title: `Год ${y}`,
    };
  }

  const a = rangeStart || todayKey;
  const b = rangeEnd || todayKey;
  const startKey = a <= b ? a : b;
  const endKey = a <= b ? b : a;
  return {
    startKey,
    endKey,
    title: `Период ${startKey} — ${endKey}`,
  };
}
