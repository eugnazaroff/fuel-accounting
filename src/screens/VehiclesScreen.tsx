import { useMemo, useState } from 'react';
import type { Vehicle, VehicleType } from '../types';
import {
  displayEmoji,
  normUnitForType,
  normUnitLabel,
  VEHICLE_TYPE_DEFAULT_EMOJI,
  VEHICLE_TYPE_LABELS,
} from '../domain';
import { VehicleStatsModal } from './VehicleStatsModal';

function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `v-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const EMOJI_OPTIONS: Record<VehicleType, string[]> = {
  passenger: ['🚗', '🚙', '🚕'],
  tractor: ['🚜'],
  bus: ['🚌', '🚎'],
  special: ['🏗️', '🚧', '🚛', '🛻'],
  cesspool: ['🚛', '💧'],
};

type FormState = {
  id?: string;
  plateNumber: string;
  name: string;
  type: VehicleType;
  norm: string;
  litersPerTrip: string;
  emoji: string;
};

function emptyForm(): FormState {
  return {
    plateNumber: '',
    name: '',
    type: 'passenger',
    norm: '',
    litersPerTrip: '',
    emoji: VEHICLE_TYPE_DEFAULT_EMOJI.passenger,
  };
}

export function VehiclesScreen(props: {
  vehicles: Vehicle[];
  onSave: (next: Vehicle[]) => void | Promise<void>;
}) {
  const { vehicles, onSave } = props;
  const [form, setForm] = useState<FormState>(emptyForm());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [statsVehicle, setStatsVehicle] = useState<Vehicle | null>(null);

  const sorted = useMemo(
    () => [...vehicles].sort((a, b) => a.plateNumber.localeCompare(b.plateNumber)),
    [vehicles],
  );

  const openCreate = () => {
    setEditingId(null);
    setForm(emptyForm());
    setEditorOpen(true);
  };

  const openEdit = (v: Vehicle) => {
    setEditingId(v.id);
    setForm({
      id: v.id,
      plateNumber: v.plateNumber,
      name: v.name,
      type: v.type,
      norm: String(v.norm),
      litersPerTrip: v.litersPerTrip != null ? String(v.litersPerTrip) : '',
      emoji: v.emoji ?? VEHICLE_TYPE_DEFAULT_EMOJI[v.type],
    });
    setEditorOpen(true);
  };

  const closeEditor = () => {
    setEditorOpen(false);
  };

  const removeCurrent = async () => {
    if (!editingId) {
      return;
    }
    const ok = window.confirm('Удалить этот автомобиль из справочника?');
    if (!ok) {
      return;
    }
    await onSave(vehicles.filter((v) => v.id !== editingId));
    setEditingId(null);
    setForm(emptyForm());
    setEditorOpen(false);
  };

  const submit = async () => {
    const norm = Number(form.norm.replace(',', '.'));
    if (!form.plateNumber.trim() || !form.name.trim() || Number.isNaN(norm) || norm <= 0) {
      window.alert('Заполните номер, название и положительную норму.');
      return;
    }
    let litersPerTrip: number | undefined;
    if (form.type === 'cesspool') {
      const lpt = Number(form.litersPerTrip.replace(',', '.'));
      if (Number.isNaN(lpt) || lpt <= 0) {
        window.alert('Для ассенизатора укажите положительный расход «1 поездка (л)».');
        return;
      }
      litersPerTrip = lpt;
    }
    const defaultEm = VEHICLE_TYPE_DEFAULT_EMOJI[form.type];
    const emojiRaw = form.emoji.trim();
    const base: Vehicle = {
      id: form.id ?? newId(),
      plateNumber: form.plateNumber.trim(),
      name: form.name.trim(),
      type: form.type,
      norm,
      emoji: emojiRaw && emojiRaw !== defaultEm ? emojiRaw : undefined,
    };
    if (form.type === 'cesspool') {
      base.litersPerTrip = litersPerTrip;
    }
    let next: Vehicle[];
    if (editingId) {
      next = vehicles.map((v) => (v.id === editingId ? base : v));
    } else {
      next = [...vehicles, base];
    }
    await onSave(next);
    setEditingId(null);
    setForm(emptyForm());
    setEditorOpen(false);
  };

  const onTypeChange = (type: VehicleType) => {
    setForm((f) => {
      const prevDefault = VEHICLE_TYPE_DEFAULT_EMOJI[f.type];
      const nextEmoji =
        f.emoji === prevDefault || f.emoji === ''
          ? VEHICLE_TYPE_DEFAULT_EMOJI[type]
          : f.emoji;
      return { ...f, type, emoji: nextEmoji };
    });
  };

  const editorTitle = editingId ? 'Редактирование' : 'Новый транспорт';
  const editorSubtitle = editingId
    ? `${form.plateNumber.trim() || '—'} · ${form.name.trim() || 'Без названия'}`
    : 'Добавьте автомобиль в справочник — всё хранится только на этом компьютере.';

  return (
    <>
      <div className="vehicles-page">
        <div className="vehicles-page-head">
          <div>
            <h1 className="vehicles-page-title">Транспорт</h1>
            <p className="vehicles-page-lead">
              Выберите карточку, чтобы изменить данные, или нажмите «добавить», чтобы внести новую
              машину.
            </p>
          </div>
          <button type="button" className="btn" onClick={openCreate}>
            Добавить транспорт
          </button>
        </div>

        <div className="vehicles-grid">
          {sorted.length === 0 ? (
            <p className="vehicles-empty">
              Пока нет ни одной записи. Нажмите «Добавить транспорт» или плюс на карточке ниже.
            </p>
          ) : null}
          {sorted.map((v) => {
            const unit = normUnitLabel(normUnitForType(v.type));
            const em = displayEmoji(v);
            const metaSummary = `${VEHICLE_TYPE_LABELS[v.type]} · ${v.norm} ${unit}`;
            return (
              <div key={v.id} className="vehicle-tile">
                <button type="button" className="vehicle-tile-main" onClick={() => openEdit(v)}>
                  <span className="vehicle-tile-emoji" aria-hidden>
                    {em}
                  </span>
                  <span className="vehicle-tile-name">{v.name}</span>
                  <span className="vehicle-tile-plate">{v.plateNumber}</span>
                  <span className="vehicle-tile-meta" title={metaSummary}>
                    {metaSummary}
                  </span>
                </button>
                <button
                  type="button"
                  className="vehicle-tile-stats-btn"
                  onClick={() => setStatsVehicle(v)}
                >
                  Статистика
                </button>
              </div>
            );
          })}
          <button type="button" className="vehicle-tile vehicle-tile--add" onClick={openCreate}>
            <span className="vehicle-tile-add-icon" aria-hidden>
              +
            </span>
            <span className="vehicle-tile-add-label">Новый транспорт</span>
          </button>
        </div>
      </div>

      {statsVehicle ? (
        <VehicleStatsModal vehicle={statsVehicle} onClose={() => setStatsVehicle(null)} />
      ) : null}

      {editorOpen ? (
        <div className="wizard-fs vehicle-editor-fs">
          <div className="wizard-fs-decoration" aria-hidden />
          <header className="wizard-fs-header wizard-fs-header--editor">
            <button type="button" className="wizard-fs-close" onClick={closeEditor}>
              Закрыть
            </button>
          </header>

          <main className="wizard-fs-main">
            <div className="wizard-fs-card wizard-fs-card--wide">
              <h1 className="wizard-fs-title">{editorTitle}</h1>
              <p className="wizard-fs-subtitle">{editorSubtitle}</p>

              <div className="vehicle-form">
                <div className="field">
                  <label htmlFor="veh-plate">Номер машины</label>
                  <input
                    id="veh-plate"
                    autoComplete="off"
                    autoFocus
                    value={form.plateNumber}
                    onChange={(e) => setForm((f) => ({ ...f, plateNumber: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="veh-name">Название</label>
                  <input
                    id="veh-name"
                    autoComplete="off"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
                <div className="field">
                  <label htmlFor="veh-type">Тип ТС</label>
                  <select
                    id="veh-type"
                    value={form.type}
                    onChange={(e) => onTypeChange(e.target.value as VehicleType)}
                  >
                    {(Object.keys(VEHICLE_TYPE_LABELS) as VehicleType[]).map((t) => (
                      <option key={t} value={t}>
                        {VEHICLE_TYPE_LABELS[t]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="veh-norm">
                    Норма расхода ({normUnitLabel(normUnitForType(form.type))})
                  </label>
                  <input
                    id="veh-norm"
                    inputMode="decimal"
                    value={form.norm}
                    onChange={(e) => setForm((f) => ({ ...f, norm: e.target.value }))}
                  />
                </div>
                {form.type === 'cesspool' ? (
                  <div className="field">
                    <label htmlFor="veh-lpt">1 поездка (л) — слив / залив</label>
                    <input
                      id="veh-lpt"
                      inputMode="decimal"
                      value={form.litersPerTrip}
                      onChange={(e) => setForm((f) => ({ ...f, litersPerTrip: e.target.value }))}
                    />
                    <span className="hint">Только для ассенизатора: расход на одну операцию.</span>
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="veh-emoji">Эмодзи на карточке</label>
                  <input
                    id="veh-emoji"
                    value={form.emoji}
                    onChange={(e) => setForm((f) => ({ ...f, emoji: e.target.value }))}
                    maxLength={8}
                  />
                  <span className="hint">Быстрый выбор:</span>
                  <div className="vehicle-emoji-row">
                    {EMOJI_OPTIONS[form.type].map((ch) => (
                      <button
                        key={ch}
                        type="button"
                        className="vehicle-emoji-pick"
                        onClick={() => setForm((f) => ({ ...f, emoji: ch }))}
                      >
                        {ch}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </main>

          <footer className="wizard-fs-footer">
            <div className="wizard-fs-footer-inner">
              {editingId ? (
                <button type="button" className="btn-wizard-ghost" onClick={() => void removeCurrent()}>
                  Удалить
                </button>
              ) : (
                <span className="wizard-fs-footer-spacer" />
              )}
              <div className="wizard-fs-footer-actions">
                <button type="button" className="btn-wizard-secondary" onClick={closeEditor}>
                  Отмена
                </button>
                <button type="button" className="btn-wizard-primary" onClick={() => void submit()}>
                  Сохранить
                </button>
              </div>
            </div>
          </footer>
        </div>
      ) : null}
    </>
  );
}
