import { describe, expect, it } from 'vitest';
import { fmtNumber, rangeArrow } from './format';

describe('format helpers', () => {
  it('arrow points the reading direction', () => {
    expect(rangeArrow('en')).toBe('→');
    expect(rangeArrow('ur')).toBe('←');
  });
  it('numbers use the chosen language, not the browser', () => {
    expect(fmtNumber(1234567, 'en')).toBe('1,234,567');
    expect(fmtNumber(1234567, 'ur')).toMatch(/^[\d٠-٩۰-۹,٬،]+$/);
  });
});
