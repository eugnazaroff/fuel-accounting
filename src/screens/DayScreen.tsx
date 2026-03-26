import { useMemo, useState } from 'react';
import type { DailyEntry, Vehicle } from '../types';
import {
  buildCompletedEntry,
  computeEveningOdometerKm,
  computeTotalConsumptionBreakdown,
  displayEmoji,
  eveningRemainder,
  normUnitForType,
  normUnitLabel,
  VEHICLE_TYPE_LABELS,
} from '../domain';
import { buildReportRows, exportExcel, exportPdf } from '../exportReport';
import { WizardShell } from '../components/WizardShell';
import {
  type WizardStep,
  wizardPreviousStep,
  wizardStepIndex,
  wizardTotalSteps,
} from './dayWizardFlow';

type WizardState = {
  vehicleId: string;
  odometer: string;
  morning: string;
  refuel: string;
  km: string;
  tripCount: string;
  motorHours: string;
};

function emptyWizard(vehicleId: string): WizardState {
  return {
    vehicleId,
    odometer: '',
    morning: '',
    refuel: '',
    km: '',
    tripCount: '',
    motorHours: '',
  };
}

function getReviewFuelPreview(
  w: WizardState,
  v: Vehicle,
): { route: number; trip: number; total: number } | null {
  const morning = parseNum(w.morning);
  const km = parseNum(w.km);
  const mh = v.type === 'tractor' ? parseNum(w.motorHours) : null;
  const tripRaw = v.type === 'cesspool' ? parseNum(w.tripCount) : 0;
  if (Number.isNaN(morning) || Number.isNaN(parseNum(w.refuel))) {
    return null;
  }
  if (v.type === 'tractor') {
    if (Number.isNaN(mh!) || mh! <= 0) {
      return null;
    }
  } else if (Number.isNaN(km) || km < 0) {
    return null;
  }
  if (v.type === 'cesspool' && (Number.isNaN(tripRaw) || tripRaw < 0)) {
    return null;
  }
  const b = computeTotalConsumptionBreakdown(v, km, mh, tripRaw);
  return { route: b.routeLiters, trip: b.tripLiters, total: b.totalLiters };
}

function parseNum(raw: string): number {
  const n = Number(raw.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
}

function formatDateHeadingRu(dateKey: string): string {
  const d = new Date(`${dateKey}T12:00:00`);
  const s = d.toLocaleDateString('ru-RU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function DayScreen(props: {
  dateKey: string;
  onDateChange: (next: string) => void;
  vehicles: Vehicle[];
  entries: Record<string, DailyEntry>;
  onSaveEntries: (next: Record<string, DailyEntry>) => void | Promise<void>;
  completedCount: number;
}) {
  const { dateKey, onDateChange, vehicles, entries, onSaveEntries, completedCount } = props;
  const [wizardOpen, setWizardOpen] = useState(false);
  const [step, setStep] = useState<WizardStep>('odometer');
  const [w, setW] = useState<WizardState | null>(null);

  const byId = useMemo(() => new Map(vehicles.map((v) => [v.id, v])), [vehicles]);

  const daySummary = useMemo(() => {
    const totalVehicles = vehicles.length;
    let done = 0;
    let fuel = 0;
    let refuel = 0;
    let km = 0;
    for (const v of vehicles) {
      const e = entries[v.id];
      if (e?.completed) {
        done += 1;
        fuel += e.actualConsumptionLiters;
        refuel += e.refueledLiters;
        km += e.kmDriven;
      }
    }
    return { totalVehicles, done, fuel, refuel, km };
  }, [vehicles, entries]);

  const openWizardFor = (vehicleId: string, existing?: DailyEntry) => {
    setW({
      ...emptyWizard(vehicleId),
      odometer:
        existing != null && existing.morningOdometerKm !== undefined
          ? String(existing.morningOdometerKm)
          : '',
      morning: existing ? String(existing.morningRemainderLiters) : '',
      refuel: existing ? String(existing.refueledLiters) : '',
      km: existing ? String(existing.kmDriven) : '',
      tripCount:
        existing != null && existing.cesspoolTripCount !== undefined
          ? String(existing.cesspoolTripCount)
          : '',
      motorHours:
        existing && existing.motorHours !== null ? String(existing.motorHours) : '',
    });
    setWizardOpen(true);
    if (existing?.completed) {
      setStep('review');
    } else {
      setStep('odometer');
    }
  };

  const closeWizard = () => {
    setWizardOpen(false);
    setW(null);
    setStep('odometer');
  };

  const startVehicle = (vehicleId: string) => {
    openWizardFor(vehicleId, entries[vehicleId]);
  };

  const nextFromOdometer = () => {
    const o = w ? parseNum(w.odometer) : NaN;
    if (!w || Number.isNaN(o) || o < 0) {
      window.alert('Укажите показание одометра на утро (км), неотрицательное число.');
      return;
    }
    setStep('fuelMorning');
  };

  const nextFromFuelMorning = () => {
    const m = w ? parseNum(w.morning) : NaN;
    if (!w || Number.isNaN(m) || m < 0) {
      window.alert('Укажите утренний остаток (л), неотрицательное число.');
      return;
    }
    setStep('refuel');
  };

  const nextFromRefuel = () => {
    const r = w ? parseNum(w.refuel) : NaN;
    if (!w || Number.isNaN(r) || r < 0) {
      window.alert('Укажите заправку за смену (л), неотрицательное число.');
      return;
    }
    setStep('km');
  };

  const nextFromKm = () => {
    const km = w ? parseNum(w.km) : NaN;
    if (!w || Number.isNaN(km) || km < 0) {
      window.alert('Укажите пробег за смену (км), неотрицательное число.');
      return;
    }
    const v = byId.get(w.vehicleId);
    if (v?.type === 'cesspool') {
      setStep('cesspoolTrips');
      return;
    }
    if (v?.type === 'tractor') {
      setStep('tractorHours');
      return;
    }
    setStep('review');
  };

  const nextFromCesspoolTrips = () => {
    const t = w ? parseNum(w.tripCount) : NaN;
    if (!w || Number.isNaN(t) || t < 0) {
      window.alert('Укажите количество поездок (неотрицательное число).');
      return;
    }
    setStep('review');
  };

  const nextFromTractorHours = () => {
    const h = w ? parseNum(w.motorHours) : NaN;
    if (!w || Number.isNaN(h) || h <= 0) {
      window.alert('Для трактора укажите моточасы за смену (положительное число).');
      return;
    }
    setStep('review');
  };

  const complete = async () => {
    if (!w) {
      return;
    }
    const v = byId.get(w.vehicleId);
    if (!v) {
      window.alert('Автомобиль не найден в справочнике.');
      return;
    }
    const morningOdometerKm = parseNum(w.odometer);
    const morning = parseNum(w.morning);
    const refuel = parseNum(w.refuel);
    const km = parseNum(w.km);
    const motorHoursParsed = parseNum(w.motorHours);
    if ([morningOdometerKm, morning, refuel, km].some((n) => Number.isNaN(n) || n < 0)) {
      window.alert('Проверьте введённые числа.');
      return;
    }
    const motorHours = v.type === 'tractor' ? motorHoursParsed : null;
    if (v.type === 'tractor' && (Number.isNaN(motorHoursParsed) || motorHoursParsed <= 0)) {
      window.alert('Для трактора нужны моточасы за смену.');
      return;
    }
    const tripCountRaw = v.type === 'cesspool' ? parseNum(w.tripCount) : 0;
    if (v.type === 'cesspool') {
      if (v.litersPerTrip === undefined || v.litersPerTrip <= 0) {
        window.alert(
          'Для ассенизатора в справочнике задайте поле «1 поездка (л)».',
        );
        return;
      }
      if (Number.isNaN(tripCountRaw) || tripCountRaw < 0) {
        window.alert('Укажите неотрицательное количество поездок.');
        return;
      }
    }
    const { totalLiters } = computeTotalConsumptionBreakdown(v, km, motorHours, tripCountRaw);
    const ev = eveningRemainder(morning, refuel, totalLiters);
    if (ev < 0) {
      const ok = window.confirm(
        'Вечерний остаток получается отрицательным. Всё равно сохранить как «готово»?',
      );
      if (!ok) {
        return;
      }
    }
    const entry = buildCompletedEntry(v, {
      vehicleId: w.vehicleId,
      morningOdometerKm,
      morningRemainderLiters: morning,
      refueledLiters: refuel,
      kmDriven: km,
      motorHours,
      tripCount: v.type === 'cesspool' ? tripCountRaw : 0,
    });
    const next = { ...entries, [w.vehicleId]: entry };
    await onSaveEntries(next);
    closeWizard();
  };

  const uncomplete = async (vehicleId: string) => {
    const e = entries[vehicleId];
    if (!e) {
      return;
    }
    const next = { ...entries, [vehicleId]: { ...e, completed: false } };
    await onSaveEntries(next);
  };

  const exportReports = () => {
    const rows = buildReportRows(vehicles, entries, dateKey);
    if (rows.length <= 1) {
      window.alert('Нет завершённых записей за эту дату.');
      return;
    }
    const base = `fuel-${dateKey}`;
    const title = `Сводка расхода топлива ${dateKey}`;
    exportExcel(rows, base);
    exportPdf(rows, base, title);
  };

  const vehicleRows = vehicles.map((v) => {
    const e = entries[v.id];
    const done = Boolean(e?.completed);
    const em = displayEmoji(v);
    return (
      <tr key={v.id}>
        <td className="emoji-preview">{em}</td>
        <td>{v.plateNumber}</td>
        <td>{v.name}</td>
        <td>{VEHICLE_TYPE_LABELS[v.type]}</td>
        <td>
          {done ? <span className="badge ok">Готово</span> : <span className="badge">Не готово</span>}
        </td>
        <td>
          <button type="button" className="btn secondary" onClick={() => startVehicle(v.id)}>
            {done ? 'Открыть' : 'Заполнить'}
          </button>
        </td>
      </tr>
    );
  });

  const reviewFuel =
    w && step === 'review'
      ? (() => {
          const v = byId.get(w.vehicleId);
          return v ? getReviewFuelPreview(w, v) : null;
        })()
      : null;

  const previewEvening =
    reviewFuel && w
      ? eveningRemainder(parseNum(w.morning), parseNum(w.refuel), reviewFuel.total)
      : null;

  const previewEveningOdometerKm =
    w && step === 'review'
      ? computeEveningOdometerKm(parseNum(w.odometer), parseNum(w.km))
      : undefined;

  const wizardVehicle = wizardOpen && w ? byId.get(w.vehicleId) : undefined;

  function renderFullscreenWizard() {
    if (!wizardOpen || !w || !wizardVehicle) {
      return null;
    }
    const v = wizardVehicle;
    const stepIdx = wizardStepIndex(step, v);
    const total = wizardTotalSteps(v);
    const prev = wizardPreviousStep(step, v);
    const goBack = prev ? () => setStep(prev) : null;

    if (step === 'odometer') {
      return (
        <WizardShell
          key={step}
          vehicle={v}
          stepIndex={stepIdx}
          totalSteps={total}
          onClose={closeWizard}
          onBack={goBack}
          title="С какого пробега начинаем?"
          subtitle="Укажите показание одометра утром — так мы зафиксируем начало смены."
          hint="Вводите километры так, как на приборной панели: целое число или с десятичными, если у вас принято."
          body={
            <>
              <span className="wizard-fs-legend">Одометр, км</span>
              <input
                id="odometer"
                className="wizard-fs-input"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0"
                value={w.odometer}
                onChange={(e) => setW({ ...w, odometer: e.target.value })}
              />
            </>
          }
          footer={
            <button type="button" className="btn-wizard-primary" onClick={nextFromOdometer}>
              Далее
            </button>
          }
        />
      );
    }

    if (step === 'fuelMorning') {
      return (
        <WizardShell
          key={step}
          vehicle={v}
          stepIndex={stepIdx}
          totalSteps={total}
          onClose={closeWizard}
          onBack={goBack}
          title="Сколько топлива в баке?"
          subtitle="Утренний остаток — сколько литров было в баке до выезда."
          hint="Честная цифра поможет корректно посчитать вечерний остаток."
          body={
            <>
              <span className="wizard-fs-legend">Остаток, литры</span>
              <input
                id="morning"
                className="wizard-fs-input"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0"
                value={w.morning}
                onChange={(e) => setW({ ...w, morning: e.target.value })}
              />
            </>
          }
          footer={
            <button type="button" className="btn-wizard-primary" onClick={nextFromFuelMorning}>
              Далее
            </button>
          }
        />
      );
    }

    if (step === 'refuel') {
      return (
        <WizardShell
          key={step}
          vehicle={v}
          stepIndex={stepIdx}
          totalSteps={total}
          onClose={closeWizard}
          onBack={goBack}
          title="Была заправка?"
          subtitle="Сколько литров залили за смену — одним числом. Если не заправлялись, введите 0."
          body={
            <>
              <span className="wizard-fs-legend">Заправка, л</span>
              <input
                id="refuel"
                className="wizard-fs-input"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0"
                value={w.refuel}
                onChange={(e) => setW({ ...w, refuel: e.target.value })}
              />
            </>
          }
          footer={
            <button type="button" className="btn-wizard-primary" onClick={nextFromRefuel}>
              Далее
            </button>
          }
        />
      );
    }

    if (step === 'km') {
      const kmHint =
        v.type === 'tractor' ? (
          <>
            Километры для отчёта сохраним отдельно. Расход в литрах посчитаем на следующем шаге по
            моточасам и норме (л/ч).
          </>
        ) : v.type === 'cesspool' ? (
          <>
            Расход на движение — по формуле (км ÷ 100) × норма. Дальше спросим поездки слив/залив, если
            они были.
          </>
        ) : (
          <>
            Расход в литрах посчитаем автоматически: (км ÷ 100) × норма (
            {normUnitLabel(normUnitForType(v.type))}
            ).
          </>
        );
      return (
        <WizardShell
          key={step}
          vehicle={v}
          stepIndex={stepIdx}
          totalSteps={total}
          onClose={closeWizard}
          onBack={goBack}
          title="Сколько километров за смену?"
          subtitle="Всё, что проехали за день по этому автомобилю."
          hint={kmHint}
          body={
            <>
              <span className="wizard-fs-legend">Км за смену</span>
              <input
                id="km"
                className="wizard-fs-input"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0"
                value={w.km}
                onChange={(e) => setW({ ...w, km: e.target.value })}
              />
            </>
          }
          footer={
            <button type="button" className="btn-wizard-primary" onClick={nextFromKm}>
              Далее
            </button>
          }
        />
      );
    }

    if (step === 'cesspoolTrips') {
      return (
        <WizardShell
          key={step}
          vehicle={v}
          stepIndex={stepIdx}
          totalSteps={total}
          onClose={closeWizard}
          onBack={goBack}
          title="Поездки слив / залив"
          subtitle="Сколько раз выполняли операцию за смену? От этого добавится расход по норме «1 поездка»."
          hint={
            <>
              Сейчас в справочнике:{' '}
              <strong>
                {v.litersPerTrip != null ? `${v.litersPerTrip} л за одну поездку` : 'задайте «1 поездка» в справочнике'}
              </strong>
              . Ноль поездок — без дополнительного расхода.
            </>
          }
          body={
            <>
              <span className="wizard-fs-legend">Количество поездок</span>
              <input
                id="trips"
                className="wizard-fs-input"
                inputMode="numeric"
                autoComplete="off"
                autoFocus
                placeholder="0"
                value={w.tripCount}
                onChange={(e) => setW({ ...w, tripCount: e.target.value })}
              />
            </>
          }
          footer={
            <button type="button" className="btn-wizard-primary" onClick={nextFromCesspoolTrips}>
              Далее
            </button>
          }
        />
      );
    }

    if (step === 'tractorHours') {
      return (
        <WizardShell
          key={step}
          vehicle={v}
          stepIndex={stepIdx}
          totalSteps={total}
          onClose={closeWizard}
          onBack={goBack}
          title="Моточасы за смену"
          subtitle="Сколько часов отработал двигатель — по норме л/ч посчитаем расход."
          hint="Укажите положительное число моточасов за эту смену."
          body={
            <>
              <span className="wizard-fs-legend">Моточасы</span>
              <input
                id="mh"
                className="wizard-fs-input"
                inputMode="decimal"
                autoComplete="off"
                autoFocus
                placeholder="0"
                value={w.motorHours}
                onChange={(e) => setW({ ...w, motorHours: e.target.value })}
              />
            </>
          }
          footer={
            <button type="button" className="btn-wizard-primary" onClick={nextFromTractorHours}>
              Далее
            </button>
          }
        />
      );
    }

    if (step === 'review') {
      const unit = normUnitLabel(normUnitForType(v.type));
      const f = reviewFuel;
      const totalDisp = f === null ? '—' : f.total.toFixed(2);
      const routeDisp = f === null ? '—' : f.route.toFixed(2);
      const tripDisp = f === null ? '—' : f.trip.toFixed(2);
      const em = displayEmoji(v);
      const entry = entries[w.vehicleId];

      return (
        <WizardShell
          key={step}
          vehicle={v}
          stepIndex={stepIdx}
          totalSteps={total}
          onClose={closeWizard}
          onBack={goBack}
          title="Проверяем и сохраняем"
          subtitle={`${em} Всё верно? После сохранения смена будет отмечена как готова.`}
          hint="Если что-то не так — нажмите «Назад» или закройте мастер без сохранения."
          body={
            <ul className="wizard-fs-summary">
              <li>
                <span className="wizard-fs-summary-label">Одометр утром</span>
                <span className="wizard-fs-summary-value">{w.odometer} км</span>
              </li>
              <li>
                <span className="wizard-fs-summary-label">Одометр вечером (расчёт)</span>
                <span className="wizard-fs-summary-value">
                  {previewEveningOdometerKm === undefined ? '—' : `${previewEveningOdometerKm.toFixed(0)} км`}
                </span>
              </li>
              <li>
                <span className="wizard-fs-summary-label">Остаток утром</span>
                <span className="wizard-fs-summary-value">{w.morning} л</span>
              </li>
              <li>
                <span className="wizard-fs-summary-label">Заправка</span>
                <span className="wizard-fs-summary-value">{w.refuel} л</span>
              </li>
              <li>
                <span className="wizard-fs-summary-label">Км за смену</span>
                <span className="wizard-fs-summary-value">{w.km}</span>
              </li>
              {v.type === 'tractor' ? (
                <li>
                  <span className="wizard-fs-summary-label">Моточасы</span>
                  <span className="wizard-fs-summary-value">{w.motorHours}</span>
                </li>
              ) : null}
              {v.type === 'cesspool' ? (
                <li>
                  <span className="wizard-fs-summary-label">Поездок</span>
                  <span className="wizard-fs-summary-value">{w.tripCount}</span>
                </li>
              ) : null}
              <li>
                <span className="wizard-fs-summary-label">Норма</span>
                <span className="wizard-fs-summary-value">
                  {v.norm} {unit}
                </span>
              </li>
              {v.type === 'cesspool' ? (
                <>
                  <li>
                    <span className="wizard-fs-summary-label">Расход на пробег</span>
                    <span className="wizard-fs-summary-value">{routeDisp} л</span>
                  </li>
                  <li>
                    <span className="wizard-fs-summary-label">Расход на поездки</span>
                    <span className="wizard-fs-summary-value">{tripDisp} л</span>
                  </li>
                  <li>
                    <span className="wizard-fs-summary-label">Всего расход</span>
                    <span className="wizard-fs-summary-value">{totalDisp} л</span>
                  </li>
                </>
              ) : (
                <li>
                  <span className="wizard-fs-summary-label">Расход (расчёт)</span>
                  <span className="wizard-fs-summary-value">{totalDisp} л</span>
                </li>
              )}
              <li>
                <span className="wizard-fs-summary-label">Вечерний остаток</span>
                <span className="wizard-fs-summary-value">
                  {previewEvening === null ? '—' : `${previewEvening.toFixed(2)} л`}
                  {previewEvening !== null && previewEvening < 0 ? (
                    <span className="error" style={{ marginLeft: 8 }}>
                      отрицательный баланс
                    </span>
                  ) : null}
                </span>
              </li>
            </ul>
          }
          footer={
            <>
              {entry?.completed ? (
                <button
                  type="button"
                  className="btn-wizard-ghost"
                  onClick={() => void uncomplete(w.vehicleId)}
                >
                  Снять «готово»
                </button>
              ) : (
                <button type="button" className="btn-wizard-primary" onClick={() => void complete()}>
                  Сохранить ✓
                </button>
              )}
              <button type="button" className="btn-wizard-secondary" onClick={closeWizard}>
                Закрыть без сохранения
              </button>
            </>
          }
        />
      );
    }

    return null;
  }

  return (
    <div>
      <div className="card" style={{ marginBottom: 14 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field">
            <label htmlFor="day">Дата</label>
            <input
              id="day"
              type="date"
              value={dateKey}
              onChange={(e) => onDateChange(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="btn"
            disabled={completedCount === 0}
            onClick={exportReports}
            title={
              completedCount === 0
                ? 'Нужна хотя бы одна завершённая запись'
                : 'Скачать Excel и PDF'
            }
          >
            Сгенерировать таблицу (Excel + PDF)
          </button>
        </div>
        <p className="hint" style={{ marginBottom: 0 }}>
          Путь к файлам JSON с данными указан в шапке приложения.
        </p>
      </div>

      <aside className="day-summary-banner" aria-label="Краткая сводка за выбранный день">
        {vehicles.length === 0 ? (
          <p className="day-summary-banner-note">
            Добавьте автомобили во вкладке «Автомобили» — здесь появится сводка по сменам.
          </p>
        ) : (
          <>
            <div className="day-summary-banner-top">
              <span className="day-summary-banner-date">{formatDateHeadingRu(dateKey)}</span>
              <span className="day-summary-banner-progress">
                Готово записей:{' '}
                <strong>
                  {daySummary.done} из {daySummary.totalVehicles}
                </strong>
                {daySummary.done === daySummary.totalVehicles && daySummary.totalVehicles > 0
                  ? ' · все смены закрыты'
                  : null}
              </span>
            </div>
            {daySummary.done === 0 ? (
              <p className="day-summary-banner-note">
                После сохранения хотя бы одной смены здесь появятся суммарный расход, заправка и пробег.
              </p>
            ) : (
              <div className="day-summary-banner-metrics">
                <span className="day-summary-metric">
                  Расход
                  <span className="day-summary-metric-value">{daySummary.fuel.toFixed(1)} л</span>
                </span>
                <span className="day-summary-metric">
                  Заправка
                  <span className="day-summary-metric-value">{daySummary.refuel.toFixed(1)} л</span>
                </span>
                <span className="day-summary-metric">
                  Пробег
                  <span className="day-summary-metric-value">
                    {daySummary.km.toLocaleString('ru-RU')} км
                  </span>
                </span>
              </div>
            )}
          </>
        )}
      </aside>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>Автомобили на дату</h2>
        {vehicles.length === 0 ? (
          <p className="hint">Добавьте автомобили во вкладке «Автомобили».</p>
        ) : (
          <table className="table">
            <thead>
              <tr>
                <th />
                <th>Номер</th>
                <th>Название</th>
                <th>Тип</th>
                <th>Статус</th>
                <th />
              </tr>
            </thead>
            <tbody>{vehicleRows}</tbody>
          </table>
        )}
      </div>

      {renderFullscreenWizard()}
    </div>
  );
}
