import { useCallback, useEffect, useMemo, useState } from 'react';
import type { Vehicle } from '../types';
import { VEHICLE_TYPE_LABELS } from '../domain';
import { buildMonthStats } from '../stats/aggregateMonth';
import type { MonthStats } from '../stats/aggregateMonth';
import {
  buildDailyAlignedSeries,
  buildFleetBarRows,
  compareByType,
  comparePerVehicleDeltas,
  computeFleetKpiDeltas,
} from '../stats/compareMonths';
import { useTheme } from '../theme/ThemeProvider';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function monthValueNow(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, (m ?? 1) - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtNum(v: unknown, digits: number): string {
  const n = typeof v === 'number' ? v : Number(v);
  if (Number.isNaN(n)) {
    return '—';
  }
  return n.toFixed(digits);
}

function deltaClass(delta: number): string {
  if (delta > 0) {
    return 'compare-delta compare-delta-up';
  }
  if (delta < 0) {
    return 'compare-delta compare-delta-down';
  }
  return 'compare-delta compare-delta-flat';
}

const BAR_COLORS = { first: '#2563eb', second: '#059669' };

export function CompareStatsScreen(props: { vehicles: Vehicle[] }) {
  const { vehicles } = props;
  const { isDark } = useTheme();
  const chartUi = useMemo(
    () => ({
      grid: isDark ? '#2a3548' : '#e2e8f0',
      faintGrid: isDark ? '#2a3548' : '#eceff4',
      tick: isDark ? '#94a3b8' : '#64748b',
    }),
    [isDark],
  );

  const nowMonth = monthValueNow();
  const [monthFirst, setMonthFirst] = useState(() => shiftMonth(nowMonth, -1));
  const [monthSecond, setMonthSecond] = useState(nowMonth);

  const [firstStats, setFirstStats] = useState<MonthStats | null>(null);
  const [secondStats, setSecondStats] = useState<MonthStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const parseYm = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    return [y, m] as const;
  };

  const load = useCallback(async () => {
    if (!window.fuelApi?.loadMonth) {
      setError('Нет API loadMonth.');
      return;
    }
    if (monthFirst === monthSecond) {
      setError('Выберите два разных месяца.');
      setFirstStats(null);
      setSecondStats(null);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [y1, m1] = parseYm(monthFirst);
      const [y2, m2] = parseYm(monthSecond);
      const [days1, days2] = await Promise.all([
        window.fuelApi.loadMonth(y1, m1),
        window.fuelApi.loadMonth(y2, m2),
      ]);
      setFirstStats(buildMonthStats(y1, m1, days1, vehicles));
      setSecondStats(buildMonthStats(y2, m2, days2, vehicles));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка загрузки');
      setFirstStats(null);
      setSecondStats(null);
    } finally {
      setLoading(false);
    }
  }, [monthFirst, monthSecond, vehicles]);

  useEffect(() => {
    void load();
  }, [load]);

  const kpiDeltas = useMemo(
    () =>
      firstStats && secondStats ? computeFleetKpiDeltas(firstStats, secondStats) : [],
    [firstStats, secondStats],
  );

  const barRows = useMemo(
    () =>
      firstStats && secondStats ? buildFleetBarRows(firstStats, secondStats) : [],
    [firstStats, secondStats],
  );

  const dailySeries = useMemo(
    () =>
      firstStats && secondStats ? buildDailyAlignedSeries(firstStats, secondStats) : [],
    [firstStats, secondStats],
  );

  const byTypeRows = useMemo(
    () =>
      firstStats && secondStats ? compareByType(firstStats, secondStats) : [],
    [firstStats, secondStats],
  );

  const vehicleDeltas = useMemo(
    () =>
      firstStats && secondStats ? comparePerVehicleDeltas(firstStats, secondStats) : [],
    [firstStats, secondStats],
  );

  const titleFirst = firstStats?.monthTitle ?? '…';
  const titleSecond = secondStats?.monthTitle ?? '…';

  const bothEmpty =
    firstStats &&
    secondStats &&
    firstStats.kpis.completedRecords === 0 &&
    secondStats.kpis.completedRecords === 0;

  return (
    <div className="compare-stats-page">
      <div className="card compare-stats-header">
        <h1 className="compare-stats-title">Сравнение месяцев</h1>
        <p className="hint compare-stats-lead">
          Сводные показатели по всему парку ТС: выберите два месяца и сравните расход, пробег и активность.
        </p>
        <div className="row compare-stats-controls">
          <div className="field">
            <label htmlFor="cmp-m1">Первый месяц</label>
            <input
              id="cmp-m1"
              type="month"
              value={monthFirst}
              onChange={(e) => setMonthFirst(e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="cmp-m2">Второй месяц</label>
            <input
              id="cmp-m2"
              type="month"
              value={monthSecond}
              onChange={(e) => setMonthSecond(e.target.value)}
            />
          </div>
          <button type="button" className="btn secondary" disabled={loading} onClick={() => void load()}>
            Обновить
          </button>
        </div>
        {firstStats && secondStats ? (
          <p className="compare-stats-legend-inline">
            <span className="compare-legend-swatch" style={{ background: BAR_COLORS.first }} />
            <strong>{titleFirst}</strong>
            <span className="compare-legend-vs"> vs </span>
            <span className="compare-legend-swatch" style={{ background: BAR_COLORS.second }} />
            <strong>{titleSecond}</strong>
          </p>
        ) : null}
      </div>

      {error ? <p className="error">{error}</p> : null}
      {loading && !firstStats ? <p className="hint">Загрузка…</p> : null}

      {bothEmpty ? (
        <div className="card">
          <p className="hint">
            В обоих месяцах нет завершённых записей. Заполните ведомости во вкладке «Учёт за день».
          </p>
        </div>
      ) : null}

      {firstStats && secondStats && !bothEmpty ? (
        <>
          <div className="stats-kpi-grid compare-kpi-grid">
            {kpiDeltas.map((k) => (
              <div key={k.key} className="stat-kpi compare-kpi-card">
                <div className="stat-kpi-label">{k.label}</div>
                <div className="compare-kpi-values">
                  <span className="compare-kpi-a" title={titleFirst}>
                    {fmtNum(k.first, k.key.includes('Records') || k.key.includes('Days') ? 0 : 2)}
                  </span>
                  <span className="compare-kpi-sep">→</span>
                  <span className="compare-kpi-b" title={titleSecond}>
                    {fmtNum(k.second, k.key.includes('Records') || k.key.includes('Days') ? 0 : 2)}
                  </span>
                </div>
                <div className={deltaClass(k.delta)}>
                  {k.delta > 0 ? '+' : ''}
                  {fmtNum(k.delta, 2)}
                  {k.pct != null ? ` (${k.pct > 0 ? '+' : ''}${k.pct}%)` : k.first === 0 && k.second > 0 ? ' (было 0)' : ''}
                </div>
              </div>
            ))}
          </div>

          <div className="stats-charts two-cols">
            <div className="card chart-card">
              <h3>Ключевые метрики: два месяца</h3>
              <p className="hint" style={{ marginTop: -6 }}>
                Синий столбец — первый месяц, зелёный — второй.
              </p>
              <div className="chart-wrap tall">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={barRows}
                    layout="vertical"
                    margin={{ top: 8, right: 24, left: 8, bottom: 8 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={chartUi.faintGrid ?? chartUi.grid} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: chartUi.tick }} />
                    <YAxis
                      type="category"
                      dataKey="metric"
                      width={148}
                      tick={{ fontSize: 10, fill: chartUi.tick }}
                    />
                    <Tooltip
                      formatter={(v, name) => [
                        fmtNum(v, 2),
                        name === 'first' ? titleFirst : titleSecond,
                      ]}
                    />
                    <Legend formatter={(v) => (v === 'first' ? titleFirst : titleSecond)} />
                    <Bar dataKey="first" name="first" fill={BAR_COLORS.first} radius={[0, 4, 4, 0]} />
                    <Bar dataKey="second" name="second" fill={BAR_COLORS.second} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card chart-card">
              <h3>Расход по числам месяца</h3>
              <p className="hint" style={{ marginTop: -6 }}>
                День месяца по оси X; удобно сравнивать форму нагрузки (разная длина месяца — последние дни могут быть пустыми).
              </p>
              <div className="chart-wrap tall">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailySeries} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                    <XAxis dataKey="label" tick={{ fontSize: 9, fill: chartUi.tick }} interval={4} />
                    <YAxis tick={{ fontSize: 11, fill: chartUi.tick }} width={36} />
                    <Tooltip
                      formatter={(v, name) => [
                        `${fmtNum(v, 2)} л`,
                        name === 'litersFirst' ? titleFirst : titleSecond,
                      ]}
                    />
                    <Legend formatter={(v) => (v === 'litersFirst' ? titleFirst : titleSecond)} />
                    <Line
                      type="monotone"
                      dataKey="litersFirst"
                      name="litersFirst"
                      stroke={BAR_COLORS.first}
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="litersSecond"
                      name="litersSecond"
                      stroke={BAR_COLORS.second}
                      strokeWidth={2}
                      dot={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {byTypeRows.length > 0 ? (
            <div className="card chart-card compare-type-chart-wrap">
              <h3>Расход по типам ТС</h3>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={byTypeRows} margin={{ top: 8, right: 12, left: 0, bottom: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartUi.grid} />
                    <XAxis dataKey="typeLabel" tick={{ fontSize: 11, fill: chartUi.tick }} />
                    <YAxis tick={{ fontSize: 11, fill: chartUi.tick }} width={40} />
                    <Tooltip
                      formatter={(v, name) => [
                        `${fmtNum(v, 2)} л`,
                        name === 'litersFirst' ? titleFirst : titleSecond,
                      ]}
                    />
                    <Legend formatter={(v) => (v === 'litersFirst' ? titleFirst : titleSecond)} />
                    <Bar dataKey="litersFirst" name="litersFirst" fill={BAR_COLORS.first} radius={[6, 6, 0, 0]} />
                    <Bar dataKey="litersSecond" name="litersSecond" fill={BAR_COLORS.second} radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          ) : null}

          <div className="card compare-vehicle-table-card">
            <h2 style={{ marginTop: 0 }}>Изменение расхода по ТС (л)</h2>
            <p className="hint">Отсортировано по величине изменения — сначала самые заметные сдвиги.</p>
            <div style={{ overflowX: 'auto' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>ТС</th>
                    <th>Тип</th>
                    <th>{titleFirst}, л</th>
                    <th>{titleSecond}, л</th>
                    <th>Δ, л</th>
                  </tr>
                </thead>
                <tbody>
                  {vehicleDeltas.map((row) => (
                    <tr key={row.vehicleId}>
                      <td>{row.label}</td>
                      <td>{VEHICLE_TYPE_LABELS[row.type]}</td>
                      <td>{fmtNum(row.litersFirst, 2)}</td>
                      <td>{fmtNum(row.litersSecond, 2)}</td>
                      <td className={deltaClass(row.delta)}>
                        {row.delta > 0 ? '+' : ''}
                        {fmtNum(row.delta, 2)}
                      </td>
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
