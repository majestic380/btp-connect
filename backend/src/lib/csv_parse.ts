// Very small CSV parser for admin import (semicolon or comma).
// Not perfect, but sufficient for simple imports from Excel exports.
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^\uFEFF/, "");
  const lines = t.split(/\r?\n/).filter(l => l.trim().length > 0);
  if (lines.length === 0) return [];
  const delim = lines[0].includes(";") ? ";" : ",";

  const rows: string[][] = [];
  for (const line of lines) {
    rows.push(splitCsvLine(line, delim));
  }
  return rows;
}

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      const next = line[i + 1];
      if (inQuotes && next === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (!inQuotes && ch === delim) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim());
}
