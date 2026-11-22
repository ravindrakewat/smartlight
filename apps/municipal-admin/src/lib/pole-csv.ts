import { importPoleRowSchema, type ImportPoleRow } from '@smart-light/shared';

/** Columns of the import file, in template order. */
export const POLE_CSV_COLUMNS = [
  'latitude',
  'longitude',
  'zone',
  'address',
  'ward',
  'lamp_type',
  'wattage',
] as const;

export type PoleCsvColumn = (typeof POLE_CSV_COLUMNS)[number];

/** Accepted header spellings (lower-case, spaces and underscores removed). */
const HEADER_ALIASES: Record<string, PoleCsvColumn> = {
  latitude: 'latitude',
  lat: 'latitude',
  longitude: 'longitude',
  lng: 'longitude',
  lon: 'longitude',
  long: 'longitude',
  zone: 'zone',
  zonecode: 'zone',
  address: 'address',
  ward: 'ward',
  lamptype: 'lamp_type',
  lamp: 'lamp_type',
  wattage: 'wattage',
  watt: 'wattage',
  watts: 'wattage',
};

export const POLE_CSV_TEMPLATE = [
  POLE_CSV_COLUMNS.join(','),
  '22.719568,75.857727,Z01,"MG Road, near Regal Square",Ward 12,LED,90',
  '22.720112,75.858301,Z01,MG Road,Ward 12,LED,90',
].join('\r\n');

export interface PoleCsvProblem {
  /** Line in the file as a spreadsheet shows it (header = line 1). */
  line: number;
  column: PoleCsvColumn | 'row';
  kind: 'invalid' | 'duplicateInFile';
  /** For duplicates: the earlier line with the same coordinates. */
  otherLine?: number;
}

export interface ParsedPoleCsv {
  rows: ImportPoleRow[];
  /** rows[i] came from file line lines[i]. */
  lines: number[];
  problems: PoleCsvProblem[];
  missingColumns: PoleCsvColumn[];
}

/** Excel adds a byte-order mark to "CSV UTF-8" files. */
const BYTE_ORDER_MARK = 0xfeff;

/** RFC 4180 CSV: quoted fields, escaped quotes, commas and newlines inside quotes. */
function parseCsv(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let quoted = false;
  const source = text.charCodeAt(0) === BYTE_ORDER_MARK ? text.slice(1) : text;

  for (let index = 0; index < source.length; index++) {
    const char = source[index];
    if (quoted) {
      if (char === '"' && source[index + 1] === '"') {
        field += '"';
        index++;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      record.push(field);
      field = '';
    } else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[index + 1] === '\n') {
        index++;
      }
      record.push(field);
      records.push(record);
      record = [];
      field = '';
    } else {
      field += char;
    }
  }
  if (field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

const COLUMN_BY_FIELD: Record<string, PoleCsvColumn> = {
  latitude: 'latitude',
  longitude: 'longitude',
  zoneCode: 'zone',
  address: 'address',
  ward: 'ward',
  lampType: 'lamp_type',
  wattage: 'wattage',
};

export function columnForField(field: string | undefined): PoleCsvColumn | 'row' {
  return (field && COLUMN_BY_FIELD[field]) || 'row';
}

/** Turns an uploaded CSV into validated import rows plus per-line problems. */
export function parsePoleCsv(text: string): ParsedPoleCsv {
  const [header = [], ...records] = parseCsv(text);
  const columnIndex = new Map<PoleCsvColumn, number>();
  header.forEach((name, index) => {
    const column = HEADER_ALIASES[name.toLowerCase().replace(/[\s_]/g, '')];
    if (column && !columnIndex.has(column)) {
      columnIndex.set(column, index);
    }
  });
  const missingColumns = (['latitude', 'longitude'] as const).filter(
    (column) => !columnIndex.has(column),
  );

  const result: ParsedPoleCsv = { rows: [], lines: [], problems: [], missingColumns };
  if (missingColumns.length > 0) {
    return result;
  }

  const firstLineByCoordinates = new Map<string, number>();
  records.forEach((record, index) => {
    const line = index + 2;
    if (record.every((value) => value.trim() === '')) {
      return;
    }
    const cell = (column: PoleCsvColumn) => {
      const position = columnIndex.get(column);
      const value = position === undefined ? '' : (record[position] ?? '').trim();
      return value === '' ? undefined : value;
    };
    const number = (value: string | undefined) => (value === undefined ? undefined : Number(value));

    const candidate = {
      latitude: number(cell('latitude')),
      longitude: number(cell('longitude')),
      zoneCode: cell('zone')?.toUpperCase(),
      address: cell('address'),
      ward: cell('ward'),
      lampType: cell('lamp_type'),
      wattage: number(cell('wattage')),
    };
    const parsed = importPoleRowSchema.safeParse(candidate);
    if (!parsed.success) {
      const columns = new Set(
        parsed.error.issues.map((issue) => columnForField(String(issue.path[0]))),
      );
      for (const column of columns) {
        result.problems.push({ line, column, kind: 'invalid' });
      }
      return;
    }

    const key = `${parsed.data.latitude.toFixed(6)},${parsed.data.longitude.toFixed(6)}`;
    const earlier = firstLineByCoordinates.get(key);
    if (earlier !== undefined) {
      result.problems.push({
        line,
        column: 'latitude',
        kind: 'duplicateInFile',
        otherLine: earlier,
      });
      return;
    }
    firstLineByCoordinates.set(key, line);
    result.rows.push(parsed.data);
    result.lines.push(line);
  });
  return result;
}
