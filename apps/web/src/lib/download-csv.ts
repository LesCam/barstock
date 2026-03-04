/** Neutralise CSV formula injection: prefix dangerous leading chars with a tab. */
function sanitizeCell(value: string): string {
  const s = String(value);
  // Characters that trigger formula evaluation in Excel/Sheets/Calc
  if (/^[=+\-@|]/.test(s)) return `\t${s}`;
  return s;
}

export function downloadCsv(headers: string[], rows: string[][], filename: string) {
  const csvContent = [headers, ...rows]
    .map((row) =>
      row.map((cell) => `"${sanitizeCell(cell).replace(/"/g, '""')}"`).join(","),
    )
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
