import type { Vehicle } from '../types';

export type WizardStep =
  | 'odometer'
  | 'fuelMorning'
  | 'refuel'
  | 'km'
  | 'cesspoolTrips'
  | 'tractorHours'
  | 'review';

export function getWizardFlow(vehicle: Vehicle): WizardStep[] {
  const flow: WizardStep[] = ['odometer', 'fuelMorning', 'refuel', 'km'];
  if (vehicle.type === 'cesspool') {
    flow.push('cesspoolTrips');
  } else if (vehicle.type === 'tractor') {
    flow.push('tractorHours');
  }
  flow.push('review');
  return flow;
}

export function wizardStepIndex(step: WizardStep, vehicle: Vehicle): number {
  const flow = getWizardFlow(vehicle);
  const i = flow.indexOf(step);
  return i >= 0 ? i + 1 : 1;
}

export function wizardTotalSteps(vehicle: Vehicle): number {
  return getWizardFlow(vehicle).length;
}

export function wizardPreviousStep(
  step: WizardStep,
  vehicle: Vehicle,
): WizardStep | null {
  const flow = getWizardFlow(vehicle);
  const i = flow.indexOf(step);
  if (i <= 0) {
    return null;
  }
  return flow[i - 1] ?? null;
}
