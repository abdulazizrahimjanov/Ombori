import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

function sanitizePdfText(value: unknown): string {
  return String(value ?? '')
    .replace(/[‘’`ʻ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/—/g, '-');
}

export function exportToPdf(
  title: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
) {
  const doc = new jsPDF({
    orientation: headers.length > 5 ? 'landscape' : 'portrait',
    unit: 'pt',
    format: 'a4',
  });
  doc.setFontSize(14);
  doc.text(sanitizePdfText(title), 40, 38);
  doc.setFontSize(9);
  doc.setTextColor(100);
  doc.text(
    sanitizePdfText(`SHU BREND OMBOR • ${new Date().toLocaleString('uz-UZ')}`),
    40,
    54
  );
  autoTable(doc, {
    startY: 68,
    head: [headers.map((h) => sanitizePdfText(h))],
    body: rows.map((row) => row.map((cell) => sanitizePdfText(cell))),
    styles: { fontSize: 8.5, cellPadding: 5 },
    headStyles: { fillColor: [15, 118, 110], textColor: 255, fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    margin: { left: 40, right: 40 },
  });
  doc.save(filename.endsWith('.pdf') ? filename : `${filename}.pdf`);
}

export function exportToExcel<T extends Record<string, unknown>>(
  rows: T[],
  filename: string,
  sheetName = 'Sheet1'
) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
  XLSX.writeFile(workbook, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

export function exportToCsv<T extends Record<string, unknown>>(rows: T[], filename: string) {
  const worksheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(worksheet);
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export async function parseSpreadsheetFile(file: File): Promise<Record<string, unknown>[]> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array' });
  const firstSheet = workbook.SheetNames[0];
  if (!firstSheet) return [];
  const worksheet = workbook.Sheets[firstSheet];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(worksheet, { defval: '' });
}

