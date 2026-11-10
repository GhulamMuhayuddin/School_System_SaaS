/** True only for a real calendar day written YYYY-MM-DD (2026-02-30 and 2026-13-01 are false). Never throws. */
export function isRealDay(v: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const t = Date.parse(`${v}T00:00:00Z`);
  return !Number.isNaN(t) && new Date(t).toISOString().slice(0, 10) === v;
}
