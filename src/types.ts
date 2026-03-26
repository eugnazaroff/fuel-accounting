export type VehicleType = 'passenger' | 'tractor' | 'bus' | 'special' | 'cesspool';

export type NormUnit = 'lPer100km' | 'lPerHour';

export interface Vehicle {
  id: string;
  plateNumber: string;
  name: string;
  type: VehicleType;
  /** Норма: л/100 км или л/ч в зависимости от type */
  norm: number;
  /** Только ассенизатор: расход на одну поездку слив/залив, л */
  litersPerTrip?: number;
  /** Переопределение эмодзи; если нет — из типа */
  emoji?: string;
}

export interface DailyEntry {
  vehicleId: string;
  /** Показание одометра на утро, км (в старых записях может отсутствовать) */
  morningOdometerKm?: number;
  /** Одометр в конце смены, км: утро + км за смену (расчёт) */
  eveningOdometerKm?: number;
  morningRemainderLiters: number;
  refueledLiters: number;
  actualConsumptionLiters: number;
  /** Расход на пробег/моточасы по норме, без поездок слив/залив */
  routeConsumptionLiters?: number;
  /** Только ассенизатор: число поездок */
  cesspoolTripCount?: number;
  /** Только ассенизатор: расход на поездки (слив/залив), л */
  cesspoolTripFuelLiters?: number;
  kmDriven: number;
  /** Только для трактора (моточасы за смену) */
  motorHours: number | null;
  eveningRemainderLiters: number;
  normSnapshot: number;
  normUnitSnapshot: NormUnit;
  vehicleTypeSnapshot: VehicleType;
  actualNorm: number | null;
  hadRefuel: boolean;
  completed: boolean;
}
