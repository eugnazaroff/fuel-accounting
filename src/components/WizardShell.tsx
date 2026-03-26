import type { ReactNode } from 'react';
import type { Vehicle } from '../types';
import { displayEmoji, VEHICLE_TYPE_LABELS } from '../domain';

export function WizardShell(props: {
  vehicle: Vehicle;
  stepIndex: number;
  totalSteps: number;
  onClose: () => void;
  onBack: (() => void) | null;
  title: string;
  subtitle: string;
  hint?: ReactNode;
  body: ReactNode;
  footer: ReactNode;
}) {
  const {
    vehicle,
    stepIndex,
    totalSteps,
    onClose,
    onBack,
    title,
    subtitle,
    hint,
    body,
    footer,
  } = props;
  const em = displayEmoji(vehicle);

  return (
    <div className="wizard-fs">
      <div className="wizard-fs-decoration" aria-hidden />
      <header className="wizard-fs-header">
        <button type="button" className="wizard-fs-close" onClick={onClose}>
          Закрыть
        </button>
        <div className="wizard-fs-progress" role="progressbar" aria-valuenow={stepIndex} aria-valuemin={1} aria-valuemax={totalSteps}>
          {Array.from({ length: totalSteps }, (_, i) => (
            <span
              key={i}
              className={`wizard-fs-dot ${i < stepIndex ? 'wizard-fs-dot--done' : ''} ${i === stepIndex - 1 ? 'wizard-fs-dot--current' : ''}`}
            />
          ))}
        </div>
        <span className="wizard-fs-step-label">
          Шаг {stepIndex} из {totalSteps}
        </span>
      </header>

      <main className="wizard-fs-main">
        <div className="wizard-fs-card">
          <div className="wizard-fs-vehicle">
            <span className="wizard-fs-vehicle-emoji" aria-hidden>
              {em}
            </span>
            <div>
              <div className="wizard-fs-vehicle-plate">{vehicle.plateNumber}</div>
              <div className="wizard-fs-vehicle-meta">
                {vehicle.name} · {VEHICLE_TYPE_LABELS[vehicle.type]}
              </div>
            </div>
          </div>

          <h1 className="wizard-fs-title">{title}</h1>
          <p className="wizard-fs-subtitle">{subtitle}</p>
          {hint ? <div className="wizard-fs-hint">{hint}</div> : null}
          <div className="wizard-fs-body">{body}</div>
        </div>
      </main>

      <footer className="wizard-fs-footer">
        <div className="wizard-fs-footer-inner">
          {onBack ? (
            <button type="button" className="btn-wizard-back" onClick={onBack}>
              ← Назад
            </button>
          ) : (
            <span className="wizard-fs-footer-spacer" />
          )}
          <div className="wizard-fs-footer-actions">{footer}</div>
        </div>
      </footer>
    </div>
  );
}
