/** Pure helpers for the hand-made SVG charts (no chart library, so no extra dependency). */

export interface Point {
  x: number;
  y: number;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/** Maps values to x/y positions inside a box. The highest value ends up at the top (small y). */
export function scalePoints(
  values: number[],
  width: number,
  height: number,
  min: number,
  max: number,
  padX = 0,
  padY = 0,
): Point[] {
  const count = values.length;
  const span = max - min || 1;
  const innerW = width - 2 * padX;
  const innerH = height - 2 * padY;
  return values.map((value, i) => ({
    x: round(padX + (count === 1 ? innerW / 2 : (i / (count - 1)) * innerW)),
    y: round(padY + (1 - (value - min) / span) * innerH),
  }));
}

/** Smooth curve through the points (cardinal spline converted to cubic Bezier segments). */
export function smoothPath(points: Point[], tension = 0.18): string {
  if (points.length === 0) return '';
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const c1x = round(p1.x + (p2.x - p0.x) * tension);
    const c1y = round(p1.y + (p2.y - p0.y) * tension);
    const c2x = round(p2.x - (p3.x - p1.x) * tension);
    const c2y = round(p2.y - (p3.y - p1.y) * tension);
    d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2.x},${p2.y}`;
  }
  return d;
}

/** The same curve closed down to the baseline, used for the soft fill under a line. */
export function buildAreaPath(points: Point[], baseY: number): string {
  if (points.length === 0) return '';
  const first = points[0];
  const last = points[points.length - 1];
  return `${smoothPath(points)} L${last.x},${baseY} L${first.x},${baseY} Z`;
}
