import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import type { DailyEntry, Vehicle } from './types';
import {
  computeEveningOdometerKm,
  normUnitLabel,
  VEHICLE_TYPE_LABELS,
} from './domain';

function formatNum(n: number | null, digits = 2): string {
  if (n === null || Number.isNaN(n)) {
    return '—';
  }
  return n.toFixed(digits);
}

function formatOdometer(n: number | undefined): string {
  if (n === undefined || Number.isNaN(n)) {
    return '—';
  }
  return String(n);
}

export function buildReportRows(
  vehicles: Vehicle[],
  entries: Record<string, DailyEntry>,
  dateKey: string,
): string[][] {
  const header = [
    'Дата',
    'Номер',
    'Название',
    'Тип',
    'Одометр утром, км',
    'Км за смену',
    'Одометр',
    'Моточасы',
    'Норма',
    'Ед.',
    'Факт. норма',
    'Заправка',
    'Поездок',
    'Расход на поездки, л',
    'Расход л',
    'Вечер л',
  ];
  const rows: string[][] = [header];
  const byId = new Map(vehicles.map((v) => [v.id, v]));

  for (const [vehicleId, e] of Object.entries(entries)) {
    if (!e.completed) {
      continue;
    }
    const v = byId.get(vehicleId);
    const plate = v?.plateNumber ?? vehicleId;
    const name = v?.name ?? '';
    const typeLabel = VEHICLE_TYPE_LABELS[e.vehicleTypeSnapshot];
    const unit = normUnitLabel(e.normUnitSnapshot);
    const ref = e.hadRefuel ? 'да' : 'нет';
    const eveningOd =
      e.eveningOdometerKm ?? computeEveningOdometerKm(e.morningOdometerKm, e.kmDriven);
    const isCesspool = e.vehicleTypeSnapshot === 'cesspool';
    const tripCnt =
      isCesspool && e.cesspoolTripCount !== undefined ? String(e.cesspoolTripCount) : '—';
    const tripFuel =
      isCesspool && e.cesspoolTripFuelLiters !== undefined
        ? formatNum(e.cesspoolTripFuelLiters, 2)
        : '—';
    rows.push([
      dateKey,
      plate,
      name,
      typeLabel,
      formatOdometer(e.morningOdometerKm),
      String(e.kmDriven),
      formatOdometer(eveningOd),
      e.motorHours === null ? '—' : String(e.motorHours),
      formatNum(e.normSnapshot, 2),
      unit,
      formatNum(e.actualNorm, 2),
      ref,
      tripCnt,
      tripFuel,
      formatNum(e.actualConsumptionLiters, 2),
      formatNum(e.eveningRemainderLiters, 2),
    ]);
  }
  return rows;
}

/** Ширины колонок Excel по самой длинной ячейке в столбце. */
function excelColWidths(rows: string[][]): XLSX.ColInfo[] {
  if (rows.length === 0) {
    return [];
  }
  const colCount = rows[0].length;
  const maxW: number[] = Array(colCount).fill(10);
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell).length;
      maxW[i] = Math.max(maxW[i], Math.min(len + 2, 72));
    });
  }
  return maxW.map((wch) => ({ wch }));
}

export function exportExcel(rows: string[][], fileBase: string): void {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = excelColWidths(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Сводка');
  XLSX.writeFile(wb, `${fileBase}.xlsx`);
}

/** Доли ширины таблицы PDF по длине текста в столбце. */
function pdfColumnWidthFractions(rows: string[][]): number[] {
  const colCount = rows[0]?.length ?? 0;
  if (colCount === 0) {
    return [];
  }
  const weights = Array(colCount).fill(1);
  for (const row of rows) {
    row.forEach((cell, i) => {
      const len = String(cell).length;
      weights[i] = Math.max(weights[i], Math.min(len, 48));
    });
  }
  const sum = weights.reduce((a, b) => a + b, 0) || 1;
  return weights.map((w) => w / sum);
}

export function exportPdf(rows: string[][], fileBase: string, title: string): void {
  const doc = new jsPDF({ orientation: 'landscape' });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 10;
  const tableWidth = pageW - marginX * 2;
  const fractions = pdfColumnWidthFractions(rows);
  const columnStyles: Record<number, { cellWidth: number }> = {};
  fractions.forEach((f, i) => {
    columnStyles[i] = { cellWidth: f * tableWidth };
  });

  doc.setFontSize(14);
  doc.text(title, marginX, 16);
  const body = rows.slice(1);
  autoTable(doc, {
    startY: 22,
    head: [rows[0]],
    body,
    tableWidth,
    margin: { left: marginX, right: marginX },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: 'linebreak',
      valign: 'top',
    },
    headStyles: { fillColor: [37, 99, 235], fontSize: 7 },
    columnStyles,
  });
  doc.save(`${fileBase}.pdf`);
}
