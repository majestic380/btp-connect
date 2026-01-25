export function toCsvBomSemicolon(headers: string[], rows: Array<Array<string | number | null | undefined>>): string {
  const BOM = "\uFEFF";
  const escape = (v: any) => {
    const s = (v ?? "").toString();
    // escape double quotes
    const q = s.replace(/"/g, '""');
    // always quote if contains ; or newline
    if (q.includes(";") || q.includes("\n") || q.includes("\r")) return `"${q}"`;
    return q;
  };
  const lines = [
    headers.map(escape).join(";"),
    ...rows.map(r => r.map(escape).join(";"))
  ];
  return BOM + lines.join("\n");
}
