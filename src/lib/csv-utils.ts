import { supabase } from '@/integrations/supabase/client';

export interface CsvColumnDef {
  key: string;
  header: string;
  transform?: (value: any) => string;
  importTransform?: (value: string) => any;
}

export function exportToCsv<T extends Record<string, any>>(
  data: T[],
  columns: CsvColumnDef[],
  filename: string
) {
  const BOM = '\uFEFF';
  const headers = columns.map(c => c.header).join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const val = col.transform ? col.transform(row[col.key]) : row[col.key];
      const str = val == null ? '' : String(val);
      return `"${str.replace(/"/g, '""')}"`;
    }).join(',')
  );
  const csv = BOM + [headers, ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${filename}_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function parseCsvFile(file: File): Promise<Record<string, string>[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target?.result as string || '').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { resolve([]); return; }
      
      const headers = parseCsvLine(lines[0]);
      const rows = lines.slice(1).map(line => {
        const values = parseCsvLine(line);
        const obj: Record<string, string> = {};
        headers.forEach((h, i) => { obj[h] = values[i] || ''; });
        return obj;
      });
      resolve(rows);
    };
    reader.onerror = reject;
    reader.readAsText(file, 'UTF-8');
  });
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') { current += '"'; i++; }
      else if (ch === '"') { inQuotes = false; }
      else { current += ch; }
    } else {
      if (ch === '"') { inQuotes = true; }
      else if (ch === ',') { result.push(current.trim()); current = ''; }
      else { current += ch; }
    }
  }
  result.push(current.trim());
  return result;
}

export async function importCsvToTable(
  file: File,
  tableName: string,
  columns: CsvColumnDef[],
  onProgress?: (msg: string) => void,
): Promise<{ success: number; errors: string[] }> {
  const rows = await parseCsvFile(file);
  if (rows.length === 0) return { success: 0, errors: ['الملف فارغ'] };

  const headerMap = new Map(columns.map(c => [c.header, c]));
  const payloads: Record<string, any>[] = [];
  const errors: string[] = [];

  rows.forEach((row, i) => {
    const payload: Record<string, any> = {};
    let hasData = false;
    for (const [csvHeader, value] of Object.entries(row)) {
      const col = headerMap.get(csvHeader);
      if (col) {
        payload[col.key] = col.importTransform ? col.importTransform(value) : (value || null);
        if (value) hasData = true;
      }
    }
    if (hasData) payloads.push(payload);
  });

  if (payloads.length === 0) return { success: 0, errors: ['لا توجد بيانات صالحة للاستيراد'] };

  onProgress?.(`جارٍ استيراد ${payloads.length} سجل...`);

  // Insert in batches of 50
  let success = 0;
  for (let i = 0; i < payloads.length; i += 50) {
    const batch = payloads.slice(i, i + 50);
    const { error } = await (supabase.from(tableName as any) as any).insert(batch);
    if (error) {
      errors.push(`خطأ في الصف ${i + 1}: ${error.message}`);
    } else {
      success += batch.length;
    }
  }

  return { success, errors };
}
