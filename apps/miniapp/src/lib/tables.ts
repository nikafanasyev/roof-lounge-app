// Номера столов хранятся числом (restaurant_tables.number). Стол "5-1" —
// это 51: первая цифра — основной номер, вторая — подстол.
export function tableLabel(n: number): string {
  return n >= 11 ? `${Math.floor(n / 10)}-${n % 10}` : String(n);
}

/** "7" -> 7, "5-1" -> 51; всё остальное — null. */
export function parseTable(text: string): number | null {
  const m = text.trim().match(/^(\d{1,2})(?:\s*[-–]\s*(\d))?$/);
  if (!m) return null;
  return m[2] !== undefined ? Number(m[1]) * 10 + Number(m[2]) : Number(m[1]);
}
