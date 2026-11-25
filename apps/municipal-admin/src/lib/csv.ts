/**
 * Builds a CSV file from rows already shown on screen and starts a download.
 * Every field is quoted; a leading =, +, - or @ is neutralised so a spreadsheet
 * never runs it as a formula. A byte-order mark keeps Hindi text readable in Excel.
 */
export function downloadCsv(filename: string, rows: (string | number | null)[][]): void {
  const cell = (value: string | number | null) => {
    const text = value === null ? '' : String(value);
    const safe = /^[=+\-@]/.test(text) && Number.isNaN(Number(text)) ? `'${text}` : text;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const csv = rows.map((row) => row.map(cell).join(',')).join('\r\n');
  const blob = new Blob([`${String.fromCharCode(0xfeff)}${csv}`], {
    type: 'text/csv;charset=utf-8',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
