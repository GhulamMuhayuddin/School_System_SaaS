import { describe, expect, it } from 'vitest';
import { buildAreaPath, scalePoints, smoothPath } from './chart-utils';

describe('chart-utils', () => {
  it('puts the highest value at the top of the box', () => {
    expect(scalePoints([0, 100], 200, 100, 0, 100)).toEqual([
      { x: 0, y: 100 },
      { x: 200, y: 0 },
    ]);
  });

  it('does not produce NaN when all values are equal', () => {
    const points = scalePoints([5, 5], 100, 40, 5, 5);
    expect(points.every((p) => Number.isFinite(p.x) && Number.isFinite(p.y))).toBe(true);
  });

  it('centres a single value', () => {
    expect(scalePoints([50], 100, 50, 0, 100)).toEqual([{ x: 50, y: 25 }]);
  });

  it('draws one curve segment per gap between points', () => {
    const path = smoothPath(scalePoints([1, 3, 2], 100, 50, 0, 4));
    expect(path.startsWith('M')).toBe(true);
    expect((path.match(/C/g) ?? []).length).toBe(2);
  });

  it('handles empty and single-point input without throwing', () => {
    expect(smoothPath([])).toBe('');
    expect(buildAreaPath([], 10)).toBe('');
    expect(smoothPath([{ x: 1, y: 2 }])).toBe('M1,2');
  });

  it('closes the area path on the baseline', () => {
    const path = buildAreaPath(scalePoints([1, 2], 100, 50, 0, 2), 50);
    expect(path.endsWith('L0,50 Z')).toBe(true);
  });
});
