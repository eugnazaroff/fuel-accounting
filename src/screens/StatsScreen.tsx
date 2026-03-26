import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Vehicle } from '../types';
import { VEHICLE_TYPE_LABELS } from '../domain';
import { buildMonthStats, type MonthStats } from '../stats/aggregateMonth';
import { useTheme } from '../theme/ThemeProvider';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
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

const CHART_COLORS = [
  '#2563eb',
  '#7c3aed',
  '#059669',
  '#d97706',
  '#dc2626',
  '#0891b2',
  '#4f46e5',
  '#db2777',
  '#64748b',
];

function monthValueNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

export function StatsScreen(props: { vehicles: Vehicle[] }) {
  const { vehicles } = props;
  const { isDark } = useTheme();
  const chartUi = useMemo(
    () => ({
      grid: isDark ? '#2a3548' : '#e2e8f0',
      tick: isDark ? '#94a3b8' : '#64748b',
      faintGrid: isDark ? '#2a3548' : '#eceff4',
    }),
    [isDark],
  );
  const [monthValue, setMonthValue] = useState(monthValueNow);
  const [stats, setStats] = useState<MonthStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [year, month] = useMemo(() => {
    const [y, m] = monthValue.split('-').map(Number);
    return [y, m] as const;
  }, [monthValue]);

  const load = useCallback(async () => {
    if (!window.fuelApi?.loadMonth) {
      setError('Нет API loadMonth (обновите Electron).');
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const days = await window.fuelApi.loadMonth(year, month);
      setStats(buildMonthStats(year, month, days, vehicles));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setStats(null);
    } finally {
      setLoading(false);
    }
  }, [year, month, vehicles]);

  useEffect(() => {
    void load();
  }, [load]);

  const topVehiclesBar = useMemo(() => {
    if (!stats) {
      return [];
    }
    return stats.perVehicle.slice(0, 10).map((v) => ({
      name: v.label.length > 18 ? `${v.label.slice(0, 16)}…` : v.label,
      liters: v.totalLiters,
    }));
  }, [stats]);

  const isEmpty =
    stats &&
    stats.kpis.completedRecords === 0 &&
    stats.kpis.totalLiters === 0;

  return (
    <div>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ alignItems: 'flex-end' }}>
          <div className="field">
            <label htmlFor="st-month">Месяц отчёта</label>
            <input
              id="st-month"
              type="month"
              value={monthValue}
              onChange={(e) => setMonthValue(e.target.value)}
            />
          </div>
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void load()}>
            Обновить
          </button>
        </div>
        {stats ? (
          <p className="hint" style={{ marginBottom: 0, marginTop: 12 }}>
            Сводка за <strong>{stats.monthTitle}</strong> — только завершённые записи ведомостей.
          </p>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading && !stats ? <p className="hint">Загрузка…</p> : null}

      {isEmpty ? (
        <div className="card">
          <p className="hint">
            За этот месяц пока нет завершённых смен с расходом. Заполните ведомости во вкладке «Учёт за
            день».
          </p>
        </div>
      ) : null}

      {stats && !isEmpty ? (
        <>
          <div className="stats-kpi-grid">
            <div className="stat-kpi">
              <div className="stat-kpi-value">{stats.kpis.totalLiters}</div>
              <div className="stat-kpi-label">Всего топлива, л</div>
            </div>
            <div className="stat-kpi">
              <div className="stat-kpi-value">{stats.kpis.totalKm}</div>
              <div className="stat-kpi-label">Сумма км (по ведомостям)</div>
            </div>
            <div className="stat-kpi">
              <div className="stat-kpi-value">{stats.kpis.completedRecords}</div>
              <div className="stat-kpi-label">Завершённых записей</div>
            </div>
            <div className="stat-kpi">
              <div className="stat-kpi-value">{stats.kpis.activeCalendarDays}</div>
              <div className="stat-kpi-label">Рабочих дней с данными</div>
            </div>
            <div className="stat-kpi">
              <div className="stat-kpi-value">{stats.kpis.vehiclesTouched}</div>
              <div className="stat-kpi-label">ТС в движении</div>
            </div>
            <div className="stat-kpi">
              <div className="stat-kpi-value">{stats.kpis.refuelEvents}</div>
              <div className="stat-kpi-label">Смен с заправкой</div>
            </div>
            <div className="stat-kpi">
              <div className="stat-kpi-value">{stats.kpis.avgLitersPerBusyDay}</div>
              <div className="stat-kpi-label">Ср. л / день с расходом</div>
            </div>
            <div className="stat-kpi">
              <div className="stat-kpi-value">{stats.kpis.avgKmPerRecord}</div>
              <div className="stat-kpi-label">Ср. км на запись</div>
            </div>
          </div>

          <div className="stats-charts two-cols">
            <div className="card chart-card">
              <h3>Расход и активность по дням</h3>
              <p className="hint" style={{ marginTop: -6 }}>
                Столбцы — число закрытых ведомостей за день; линия — суммарный расход, л.
              </p>
              <div className="chart-wrap tall">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={stats.daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartUi.tick }} interval="preserveStartEnd" />
                    <YAxis yAxisId="left" tick={{ fontSize: 11, fill: chartUi.tick }} width={36} />
                    <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: chartUi.tick }} width={36} />
                    <Tooltip
                      formatter={(value, name) => [
                        fmtNum(value, 2),
                        name === 'liters' ? 'Расход, л' : 'Записей',
                      ]}
                      labelFormatter={(l) => String(l)}
                    />
                    <Legend
                      formatter={(v) => (v === 'liters' ? 'Расход, л' : 'Записей за день')}
                      wrapperStyle={{ fontSize: 12, color: chartUi.tick }}
                    />
                    <Bar yAxisId="right" dataKey="records" fill="#94a3b8" name="records" radius={[2, 2, 0, 0]} />
                    <Line
                      yAxisId="left"
                      type="monotone"
                      dataKey="liters"
                      stroke="#2563eb"
                      strokeWidth={2}
                      dot={false}
                      name="liters"
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card chart-card">
              <h3>Накопленный расход за месяц</h3>
              <p className="hint" style={{ marginTop: -6 }}>
                Показывает, как к концу месяца нарастал суммарный объём, л.
              </p>
              <div className="chart-wrap tall">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={stats.cumulative} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cumFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartUi.tick }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: chartUi.tick }} width={40} />
                    <Tooltip formatter={(v) => [`${fmtNum(v, 2)} л`, 'Накоплено']} />
                    <Area
                      type="monotone"
                      dataKey="liters"
                      stroke="#1d4ed8"
                      fill="url(#cumFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="stats-charts two-cols" style={{ marginTop: 20 }}>
            <div className="card chart-card">
              <h3>Топ ТС по расходу за месяц</h3>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={topVehiclesBar}
                    layout="vertical"
                    margin={{ top: 8, right: 16, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartUi.faintGrid} />
                    <XAxis type="number" tick={{ fontSize: 11, fill: chartUi.tick }} />
                    <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 10, fill: chartUi.tick }} />
                    <Tooltip formatter={(v) => [`${fmtNum(v, 2)} л`, 'Расход']} />
                    <Bar dataKey="liters" name="Расход, л" radius={[0, 6, 6, 0]}>
                      {topVehiclesBar.map((_, i) => (
                        <Cell key={`_c-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card chart-card">
              <h3>Структура расхода по автомобилям</h3>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={stats.pieVehicles}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      innerRadius={52}
                      outerRadius={88}
                      paddingAngle={2}
                      label={({ name, percent }) =>
                        `${String(name).slice(0, 12)}${String(name).length > 12 ? '…' : ''} ${(
                          (percent ?? 0) * 100
                        ).toFixed(0)}%`
                      }
                    >
                      {stats.pieVehicles.map((_, i) => (
                        <Cell key={`_p-${i}`} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v) => [`${fmtNum(v, 2)} л`, '']} />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="stats-charts two-cols" style={{ marginTop: 20 }}>
            <div className="card chart-card">
              <h3>Расход по типам ТС</h3>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={stats.byType} margin={{ top: 8, right: 12, left: 0, bottom: 40 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                    <XAxis dataKey="typeLabel" tick={{ fontSize: 11, fill: chartUi.tick }} angle={-18} textAnchor="end" height={48} />
                    <YAxis tick={{ fontSize: 11, fill: chartUi.tick }} width={44} />
                    <Tooltip formatter={(v) => [`${fmtNum(v, 2)} л`, 'Расход']} />
                    <Bar dataKey="liters" fill="#4f46e5" radius={[6, 6, 0, 0]}>
                      {stats.byType.map((t, i) => (
                        <Cell key={t.type} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card chart-card">
              <h3>Пробег по дням (сумма км)</h3>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={stats.daily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: chartUi.tick }} interval="preserveStartEnd" />
                    <YAxis tick={{ fontSize: 11, fill: chartUi.tick }} width={40} />
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

          <div className="card" style={{ marginTop: 20 }}>
            <h2 style={{ marginTop: 0 }}>Детализация по автомобилям</h2>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>ТС</th>
                    <th>Тип</th>
                    <th>Дней</th>
                    <th>Км ∑</th>
                    <th>Расход ∑, л</th>
                    <th>Поездок ∑</th>
                    <th>Слив/залив, л</th>
                    <th>Дней с заправкой</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.perVehicle.map((row) => (
                    <tr key={row.vehicleId}>
                      <td>{row.label}</td>
                      <td>{VEHICLE_TYPE_LABELS[row.type]}</td>
                      <td>{row.daysActive}</td>
                      <td>{row.totalKm}</td>
                      <td>{row.totalLiters}</td>
                      <td>{row.tripCount > 0 ? row.tripCount : '—'}</td>
                      <td>{row.tripLiters > 0 ? row.tripLiters : '—'}</td>
                      <td>{row.refuelDays}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
