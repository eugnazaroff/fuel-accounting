import type { VehicleType } from '../types';
import type { MonthStats } from './aggregateMonth';

export type FleetKpiDelta = {
  key: string;
  label: string;
  first: number;
  second: number;
  delta: number;
  pct: number | null;
};

const KPI_DEFS: Array<{ key: keyof MonthStats['kpis']; label: string }> = [
  { key: 'totalLiters', label: 'Расход топлива, л' },
  { key: 'totalKm', label: 'Пробег, км' },
  { key: 'completedRecords', label: 'Завершённых записей' },
  { key: 'activeCalendarDays', label: 'Дней с данными' },
  { key: 'vehiclesTouched', label: 'ТС в движении' },
  { key: 'refuelEvents', label: 'Смен с заправкой' },
  { key: 'avgLitersPerBusyDay', label: 'Ср. л / день с расходом' },
  { key: 'avgKmPerRecord', label: 'Ср. км на запись' },
];

function pctChange(before: number, after: number): number | null {
  if (before === 0) {
    return after === 0 ? 0 : null;
  }
  return Math.round(((after - before) / before) * 1000) / 10;
}

/** Сравнение «первый месяц» → «второй месяц» (delta = second − first). */
export function computeFleetKpiDeltas(first: MonthStats, second: MonthStats): FleetKpiDelta[] {
  return KPI_DEFS.map(({ key, label }) => {
    const a = first.kpis[key];
    const b = second.kpis[key];
    return {
      key,
      label,
      first: a,
      second: b,
      delta: Math.round((b - a) * 100) / 100,
      pct: pctChange(a, b),
    };
  });
}

export type ByTypeCompareRow = {
  type: VehicleType;
  typeLabel: string;
  litersFirst: number;
  litersSecond: number;
  delta: number;
};

export function compareByType(first: MonthStats, second: MonthStats): ByTypeCompareRow[] {
  const map = new Map<VehicleType, { typeLabel: string; litersFirst: number; litersSecond: number }>();
  for (const t of first.byType) {
    map.set(t.type, { typeLabel: t.typeLabel, litersFirst: t.liters, litersSecond: 0 });
  }
  for (const t of second.byType) {
    const cur = map.get(t.type) ?? { typeLabel: t.typeLabel, litersFirst: 0, litersSecond: 0 };
    cur.litersSecond = t.liters;
    map.set(t.type, cur);
  }
  const rows: ByTypeCompareRow[] = [];
  for (const [type, v] of map) {
    rows.push({
      type,
      typeLabel: v.typeLabel,
      litersFirst: v.litersFirst,
      litersSecond: v.litersSecond,
      delta: Math.round((v.litersSecond - v.litersFirst) * 100) / 100,
    });
  }
  rows.sort((x, y) => Math.max(y.litersFirst, y.litersSecond) - Math.max(x.litersFirst, x.litersSecond));
  return rows;
}

export type DailyComparePoint = {
  dayNum: number;
  label: string;
  litersFirst: number;
  litersSecond: number;
  kmFirst: number;
  kmSecond: number;
};

/** Сопоставление по числу месяца (1…31): сравнение формы расхода внутри месяца. */
export function buildDailyAlignedSeries(first: MonthStats, second: MonthStats): DailyComparePoint[] {
  const n = Math.max(first.daily.length, second.daily.length);
  const out: DailyComparePoint[] = [];
  for (let i = 0; i < n; i += 1) {
    const df = first.daily[i];
    const ds = second.daily[i];
    const dayNum = i + 1;
    out.push({
      dayNum,
      label: String(dayNum),
      litersFirst: df?.liters ?? 0,
      litersSecond: ds?.liters ?? 0,
      kmFirst: df?.km ?? 0,
      kmSecond: ds?.km ?? 0,
    });
  }
  return out;
}

export type FleetBarRow = {
  metric: string;
  first: number;
  second: number;
};

export function buildFleetBarRows(first: MonthStats, second: MonthStats): FleetBarRow[] {
  return KPI_DEFS.map(({ key, label }) => ({
    metric: label,
    first: first.kpis[key],
    second: second.kpis[key],
  }));
}

export type VehicleDeltaRow = {
  vehicleId: string;
  label: string;
  litersFirst: number;
  litersSecond: number;
  delta: number;
  type: VehicleType;
};

export function comparePerVehicleDeltas(first: MonthStats, second: MonthStats): VehicleDeltaRow[] {
  const m = new Map<
    string,
    { label: string; type: VehicleType; litersFirst: number; litersSecond: number }
  >();
  for (const row of first.perVehicle) {
    m.set(row.vehicleId, {
      label: row.label,
      type: row.type,
      litersFirst: row.totalLiters,
      litersSecond: 0,
    });
  }
  for (const row of second.perVehicle) {
    const cur =
      m.get(row.vehicleId) ??
      { label: row.label, type: row.type, litersFirst: 0, litersSecond: 0 };
    cur.litersSecond = row.totalLiters;
    cur.label = row.label;
    cur.type = row.type;
    m.set(row.vehicleId, cur);
  }
  const out: VehicleDeltaRow[] = [];
  for (const [vehicleId, v] of m) {
    out.push({
      vehicleId,
      label: v.label,
      litersFirst: v.litersFirst,
      litersSecond: v.litersSecond,
      delta: Math.round((v.litersSecond - v.litersFirst) * 100) / 100,
      type: v.type,
    });
  }
  out.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  return out;
}
