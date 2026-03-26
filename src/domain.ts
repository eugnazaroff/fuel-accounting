import type { DailyEntry, NormUnit, Vehicle, VehicleType } from './types';

export const VEHICLE_TYPE_LABELS: Record<VehicleType, string> = {
  passenger: 'Легковой',
  tractor: 'Трактор',
  bus: 'Автобус',
  special: 'Спецтехника',
  cesspool: 'Ассенизатор',
};

/** Эмодзи по умолчанию для типа ТС */
export const VEHICLE_TYPE_DEFAULT_EMOJI: Record<VehicleType, string> = {
  passenger: '🚗',
  tractor: '🚜',
  bus: '🚌',
  special: '🏗️',
  cesspool: '🚛',
};

export function normUnitForType(type: VehicleType): NormUnit {
  return type === 'tractor' ? 'lPerHour' : 'lPer100km';
}

export function normUnitLabel(unit: NormUnit): string {
  return unit === 'lPerHour' ? 'л/ч' : 'л/100 км';
}

export function displayEmoji(vehicle: Vehicle): string {
  return vehicle.emoji?.trim() || VEHICLE_TYPE_DEFAULT_EMOJI[vehicle.type];
}

export function eveningRemainder(
  morning: number,
  refueled: number,
  consumption: number,
): number {
  return morning + refueled - consumption;
}

/** Показание одометра вечером: утреннее + пройденные км (если утро не задано — нет значения). */
export function computeEveningOdometerKm(
  morningOdometerKm: number | undefined,
  kmDriven: number,
): number | undefined {
  if (
    morningOdometerKm === undefined ||
    Number.isNaN(morningOdometerKm) ||
    Number.isNaN(kmDriven)
  ) {
    return undefined;
  }
  return morningOdometerKm + kmDriven;
}

/** Расход л за смену по норме из справочника: км×л/100км или моточасы×л/ч (без поездок ассенизатора). */
export function computeConsumptionLitersFromNorm(
  vehicle: Vehicle,
  kmDriven: number,
  motorHours: number | null,
): number {
  if (vehicle.type === 'tractor') {
    const h = motorHours ?? 0;
    return h * vehicle.norm;
  }
  return (kmDriven / 100) * vehicle.norm;
}

/** Доп. расход на поездки слив/залив (только ассенизатор). */
export function computeCesspoolTripFuelLiters(vehicle: Vehicle, tripCount: number): number {
  if (vehicle.type !== 'cesspool' || tripCount <= 0) {
    return 0;
  }
  const per = vehicle.litersPerTrip ?? 0;
  return tripCount * per;
}

export function computeTotalConsumptionBreakdown(
  vehicle: Vehicle,
  kmDriven: number,
  motorHours: number | null,
  tripCount: number,
): { routeLiters: number; tripLiters: number; totalLiters: number } {
  const routeLiters = computeConsumptionLitersFromNorm(vehicle, kmDriven, motorHours);
  const trips = vehicle.type === 'cesspool' ? Math.max(0, Math.floor(tripCount)) : 0;
  const tripLiters = computeCesspoolTripFuelLiters(vehicle, trips);
  return {
    routeLiters,
    tripLiters,
    totalLiters: routeLiters + tripLiters,
  };
}

export function computeActualNorm(
  type: VehicleType,
  consumptionLiters: number,
  km: number,
  motorHours: number | null,
): number | null {
  if (type === 'tractor') {
    const h = motorHours ?? 0;
    if (h <= 0) {
      return null;
    }
    return consumptionLiters / h;
  }
  if (km <= 0) {
    return null;
  }
  return (100 * consumptionLiters) / km;
}

export type CompletedEntryInput = {
  vehicleId: string;
  morningOdometerKm?: number;
  morningRemainderLiters: number;
  refueledLiters: number;
  kmDriven: number;
  motorHours: number | null;
  /** Для ассенизатора — число поездок (для остальных передавать 0) */
  tripCount: number;
};

export function buildCompletedEntry(vehicle: Vehicle, input: CompletedEntryInput): DailyEntry {
  const tripsFloor =
    vehicle.type === 'cesspool' ? Math.max(0, Math.floor(input.tripCount)) : 0;
  const { routeLiters, tripLiters, totalLiters } = computeTotalConsumptionBreakdown(
    vehicle,
    input.kmDriven,
    input.motorHours,
    tripsFloor,
  );
  const ev = eveningRemainder(
    input.morningRemainderLiters,
    input.refueledLiters,
    totalLiters,
  );
  const unit = normUnitForType(vehicle.type);
  const actualNorm = computeActualNorm(
    vehicle.type,
    totalLiters,
    input.kmDriven,
    input.motorHours,
  );
  const eveningOdometerKm = computeEveningOdometerKm(
    input.morningOdometerKm,
    input.kmDriven,
  );
  const base: DailyEntry = {
    vehicleId: input.vehicleId,
    morningOdometerKm: input.morningOdometerKm,
    eveningOdometerKm,
    morningRemainderLiters: input.morningRemainderLiters,
    refueledLiters: input.refueledLiters,
    actualConsumptionLiters: totalLiters,
    routeConsumptionLiters: routeLiters,
    kmDriven: input.kmDriven,
    motorHours: input.motorHours,
    eveningRemainderLiters: ev,
    normSnapshot: vehicle.norm,
    normUnitSnapshot: unit,
    vehicleTypeSnapshot: vehicle.type,
    actualNorm,
    hadRefuel: input.refueledLiters > 0,
    completed: true,
  };
  if (vehicle.type === 'cesspool') {
    base.cesspoolTripCount = tripsFloor;
    base.cesspoolTripFuelLiters = tripLiters;
  }
  return base;
}
