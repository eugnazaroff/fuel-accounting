import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Vehicle } from '../types';
import { displayEmoji, normUnitForType, normUnitLabel, VEHICLE_TYPE_LABELS } from '../domain';
import { useTheme } from '../theme/ThemeProvider';
import {
  buildVehiclePeriodStats,
  resolveVehicleStatsBounds,
  vehicleStatsMonthValueNow,
  type VehiclePeriodStats,
  type VehicleStatsPeriodTab,
} from '../stats/vehiclePeriod';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function fmtNum(v: unknown, digits: number): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) {
    return '—';
  }
  return n.toFixed(digits);
}

const PERIOD_TABS: Array<{ id: VehicleStatsPeriodTab; label: string }> = [
  { id: 'week', label: 'Неделя' },
  { id: 'month', label: 'Месяц' },
  { id: 'year', label: 'Год' },
  { id: 'range', label: 'Период' },
];

type Props = {
  vehicle: Vehicle;
  onClose: () => void;
};

export function VehicleStatsModal(props: Props) {
  const { vehicle, onClose } = props;
  const { isDark } = useTheme();
  const chartUi = useMemo(
    () => ({
      grid: isDark ? '#2a3548' : '#e2e8f0',
      tick: isDark ? '#94a3b8' : '#64748b',
    }),
    [isDark],
  );

  const [periodTab, setPeriodTab] = useState<VehicleStatsPeriodTab>('month');
  const [monthValue, setMonthValue] = useState(vehicleStatsMonthValueNow);
  const [yearValue, setYearValue] = useState(() => new Date().getFullYear());
  const [rangeStart, setRangeStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 29);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });
  const [rangeEnd, setRangeEnd] = useState(() => {
    const d = new Date();
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  });

  const bounds = useMemo(
    () => resolveVehicleStatsBounds(periodTab, monthValue, yearValue, rangeStart, rangeEnd),
    [monthValue, periodTab, rangeEnd, rangeStart, yearValue],
  );

  const [stats, setStats] = useState<VehiclePeriodStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!window.fuelApi?.loadDailyRange) {
      setError('Нет API loadDailyRange (обновите Electron).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const days = await window.fuelApi.loadDailyRange(bounds.startKey, bounds.endKey);
      setStats(buildVehiclePeriodStats(vehicle, days, bounds.startKey, bounds.endKey, bounds.title));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [bounds.endKey, bounds.startKey, bounds.title, vehicle]);

  useEffect(() => {
    void load();
  }, [load]);

  const em = displayEmoji(vehicle);
  const normUnit = normUnitLabel(normUnitForType(vehicle.type));
  const subtitle = `${VEHICLE_TYPE_LABELS[vehicle.type]} · норма ${vehicle.norm} ${normUnit}`;

  return (
    <div className="wizard-fs vehicle-stats-fs">
      <div className="wizard-fs-decoration" aria-hidden />
      <header className="wizard-fs-header wizard-fs-header--editor">
        <button type="button" className="wizard-fs-close" onClick={onClose}>
          Закрыть
        </button>
      </header>

      <main className="wizard-fs-main vehicle-stats-main">
        <div className="wizard-fs-card wizard-fs-card--wide vehicle-stats-card">
          <div className="vehicle-stats-head">
            <span className="vehicle-stats-emoji" aria-hidden>
              {em}
            </span>
            <div>
              <h1 className="wizard-fs-title vehicle-stats-title">
                Статистика: {vehicle.plateNumber}
              </h1>
              <p className="wizard-fs-subtitle">
                {vehicle.name} · {subtitle}
              </p>
            </div>
          </div>

          <div className="vehicle-stats-period">
            <span className="vehicle-stats-period-label">Интервал</span>
            <div className="vehicle-stats-tabs" role="tablist">
              {PERIOD_TABS.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={periodTab === t.id}
                  className={`vehicle-stats-tab ${periodTab === t.id ? 'active' : ''}`}
                  onClick={() => setPeriodTab(t.id)}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {periodTab === 'month' ? (
              <div className="field vehicle-stats-field">
                <label htmlFor="vs-month">Месяц</label>
                <input
                  id="vs-month"
                  type="month"
                  value={monthValue}
                  onChange={(e) => setMonthValue(e.target.value)}
                />
              </div>
            ) : null}

            {periodTab === 'year' ? (
              <div className="field vehicle-stats-field">
                <label htmlFor="vs-year">Год</label>
                <input
                  id="vs-year"
                  type="number"
                  inputMode="numeric"
                  min={2000}
                  max={2100}
                  value={yearValue}
                  onChange={(e) => setYearValue(Number(e.target.value) || new Date().getFullYear())}
                />
              </div>
            ) : null}

            {periodTab === 'range' ? (
              <div className="row vehicle-stats-range-row">
                <div className="field vehicle-stats-field">
                  <label htmlFor="vs-from">С</label>
                  <input
                    id="vs-from"
                    type="date"
                    value={rangeStart}
                    onChange={(e) => setRangeStart(e.target.value)}
                  />
                </div>
                <div className="field vehicle-stats-field">
                  <label htmlFor="vs-to">По</label>
                  <input
                    id="vs-to"
                    type="date"
                    value={rangeEnd}
                    onChange={(e) => setRangeEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : null}

            <div className="vehicle-stats-bounds-hint">
              <strong>{bounds.title}</strong>
              <span className="muted">
                {' '}
                · {bounds.startKey} — {bounds.endKey}
              </span>
            </div>

            <button type="button" className="btn secondary" disabled={loading} onClick={() => void load()}>
              Обновить
            </button>
          </div>

          {error ? <p className="error">{error}</p> : null}
          {loading && !stats ? <p className="hint">Загрузка…</p> : null}

          {stats && !stats.hasData ? (
            <p className="hint vehicle-stats-empty">
              За выбранный интервал нет завершённых смен по этому автомобилю.
            </p>
          ) : null}

          {stats?.hasData ? (
            <>
              <div className="stats-kpi-grid vehicle-stats-kpis">
                <div className="stat-kpi">
                  <div className="stat-kpi-value">{stats.kpis.activeDays}</div>
                  <div className="stat-kpi-label">Дней с ведомостью</div>
                </div>
                <div className="stat-kpi">
                  <div className="stat-kpi-value">{stats.kpis.shareBusyPercent}%</div>
                  <div className="stat-kpi-label">Доля дней с данными от интервала</div>
                </div>
                <div className="stat-kpi">
                  <div className="stat-kpi-value">{stats.kpis.totalLiters}</div>
                  <div className="stat-kpi-label">Расход ∑, л</div>
                </div>
                <div className="stat-kpi">
                  <div className="stat-kpi-value">{stats.kpis.totalKm}</div>
                  <div className="stat-kpi-label">Пробег ∑, км</div>
                </div>
                {vehicle.type === 'tractor' ? (
                  <div className="stat-kpi">
                    <div className="stat-kpi-value">{stats.kpis.totalMotorHours}</div>
                    <div className="stat-kpi-label">Моточасы ∑</div>
                  </div>
                ) : null}
                <div className="stat-kpi">
                  <div className="stat-kpi-value">{stats.kpis.refuelDays}</div>
                  <div className="stat-kpi-label">Смен с заправкой</div>
                </div>
                <div className="stat-kpi">
                  <div className="stat-kpi-value">{stats.kpis.totalRefuelLiters}</div>
                  <div className="stat-kpi-label">Заправлено ∑, л</div>
                </div>
                {vehicle.type === 'cesspool' ? (
                  <>
                    <div className="stat-kpi">
                      <div className="stat-kpi-value">{stats.kpis.totalTrips}</div>
                      <div className="stat-kpi-label">Поездок слив/залив ∑</div>
                    </div>
                    <div className="stat-kpi">
                      <div className="stat-kpi-value">{stats.kpis.tripLiters}</div>
                      <div className="stat-kpi-label">На поездки ∑, л</div>
                    </div>
                    <div className="stat-kpi">
                      <div className="stat-kpi-value">{stats.kpis.avgTripsPerCesspoolDay}</div>
                      <div className="stat-kpi-label">Ср. поездок в день (когда были)</div>
                    </div>
                  </>
                ) : null}
                <div className="stat-kpi">
                  <div className="stat-kpi-value">{stats.kpis.avgLitersPerActiveDay}</div>
                  <div className="stat-kpi-label">Ср. расход в «рабочий» день, л</div>
                </div>
                <div className="stat-kpi">
                  <div className="stat-kpi-value">{stats.kpis.avgKmPerActiveDay}</div>
                  <div className="stat-kpi-label">Ср. км в день с данными</div>
                </div>
              </div>

              <div className="vehicle-stats-highlights card">
                <h2 className="vehicle-stats-h2">Сводки и экстремумы</h2>
                <ul className="vehicle-stats-highlight-list">
                  <li>
                    <strong>Самый затратный день по топливу:</strong>{' '}
                    {stats.extremes.maxFuelDay
                      ? `${stats.extremes.maxFuelDay.label} (${stats.extremes.maxFuelDay.liters} л)`
                      : '—'}
                  </li>
                  <li>
                    <strong>Самый экономный день (из дней с данными):</strong>{' '}
                    {stats.extremes.minFuelDay
                      ? `${stats.extremes.minFuelDay.label} (${stats.extremes.minFuelDay.liters} л)`
                      : '—'}
                  </li>
                  <li>
                    <strong>Максимум пробега за день:</strong>{' '}
                    {stats.extremes.maxKmDay
                      ? `${stats.extremes.maxKmDay.label} (${stats.extremes.maxKmDay.km} км)`
                      : '—'}
                  </li>
                  <li>
                    <strong>Минимум пробега за день:</strong>{' '}
                    {stats.extremes.minKmDay
                      ? `${stats.extremes.minKmDay.label} (${stats.extremes.minKmDay.km} км)`
                      : '—'}
                  </li>
                  <li>
                    <strong>Самый загруженный месяц по расходу:</strong>{' '}
                    {stats.extremes.maxFuelMonth
                      ? `${stats.extremes.maxFuelMonth.label} (${stats.extremes.maxFuelMonth.liters} л, ${
                          stats.extremes.maxFuelMonth.days
                        } дн.)`
                      : '—'}
                  </li>
                  <li>
                    <strong>Самый «лёгкий» месяц по расходу:</strong>{' '}
                    {stats.extremes.minFuelMonth
                      ? `${stats.extremes.minFuelMonth.label} (${stats.extremes.minFuelMonth.liters} л, ${
                          stats.extremes.minFuelMonth.days
                        } дн.)`
                      : '—'}
                  </li>
                  <li>
                    <strong>Самая нагруженная неделя (пн–вс):</strong>{' '}
                    {stats.extremes.busiestWeek
                      ? `${stats.extremes.busiestWeek.label} — ${stats.extremes.busiestWeek.liters} л, ${
                          stats.extremes.busiestWeek.km
                        } км (${stats.extremes.busiestWeek.days} дн.)`
                      : '—'}
                  </li>
                  <li>
                    <strong>Самая спокойная неделя (с данными):</strong>{' '}
                    {stats.extremes.quietestWeek
                      ? `${stats.extremes.quietestWeek.label} — ${stats.extremes.quietestWeek.liters} л, ${
                          stats.extremes.quietestWeek.km
                        } км (${stats.extremes.quietestWeek.days} дн.)`
                      : '—'}
                  </li>
                </ul>
              </div>

              <div className="stats-charts two-cols vehicle-stats-charts">
                <div className="card chart-card">
                  <h3>Расход по дням</h3>
                  <div className="chart-wrap tall">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.dailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: chartUi.tick }}
                          interval={stats.dailySeries.length > 31 ? 6 : 2}
                        />
                        <YAxis tick={{ fontSize: 11, fill: chartUi.tick }} width={36} />
                        <Tooltip formatter={(v) => [`${fmtNum(v, 2)} л`, 'Расход']} />
                        <Bar dataKey="liters" fill="#2563eb" name="Расход" radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
                <div className="card chart-card">
                  <h3>Пробег по дням</h3>
                  <div className="chart-wrap tall">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={stats.dailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 9, fill: chartUi.tick }}
                          interval={stats.dailySeries.length > 31 ? 6 : 2}
                        />
                        <YAxis tick={{ fontSize: 11, fill: chartUi.tick }} width={36} />
                        <Tooltip formatter={(v) => [`${fmtNum(v, 1)} км`, 'Пробег']} />
                        <Line
                          type="monotone"
                          dataKey="km"
                          stroke="#059669"
                          strokeWidth={2}
                          dot={{ r: 2 }}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>

              {stats.monthlySeries.length > 1 ? (
                <div className="card chart-card vehicle-stats-month-chart">
                  <h3>Сводка по месяцам (расход, л)</h3>
                  <div className="chart-wrap">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={stats.monthlySeries} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                        <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartUi.tick }} />
                        <YAxis tick={{ fontSize: 11, fill: chartUi.tick }} width={40} />
                        <Tooltip
                          formatter={(v, name) =>
                            name === 'liters' ? [`${fmtNum(v, 2)} л`, 'Расход'] : [String(v), String(name)]
                          }
                          labelFormatter={(label) => String(label)}
                        />
                        <Bar dataKey="liters" fill="#7c3aed" name="Расход, л" radius={[6, 6, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : null}
            </>
          ) : null}
        </div>
      </main>
    </div>
  );
}
