import { describe, expect, it } from 'vitest';
import { certNo, certStatus, eligibility, oneAtATime } from '../src/modules/certificates/certificates.logic';

describe('certificate rules', () => {
  it('numbers certificates', () => { expect(certNo(12)).toBe('CERT-000012'); });
  it('bonafide only for a student who studies here now', () => {
    expect(eligibility('BONAFIDE', 'ACTIVE', null, '2026-11-04')).toEqual({ ok: true });
    for (const s of ['WITHDRAWN', 'TRANSFERRED', 'GRADUATED'] as const) expect(eligibility('BONAFIDE', s, '2026-10-01', '2026-11-04')).toEqual({ ok: false, reason: 'NOT_ACTIVE' });
  });
  it('character certificate for any student', () => {
    for (const s of ['ACTIVE', 'WITHDRAWN', 'TRANSFERRED', 'GRADUATED'] as const) expect(eligibility('CHARACTER', s, null, '2026-11-04')).toEqual({ ok: true });
  });
  it('leaving certificate needs a student who left, with a date, and not dated before it', () => {
    expect(eligibility('LEAVING', 'ACTIVE', null, '2026-11-04')).toEqual({ ok: false, reason: 'STILL_ACTIVE' });
    expect(eligibility('LEAVING', 'WITHDRAWN', null, '2026-11-04')).toEqual({ ok: false, reason: 'NO_LEAVING_DATE' });
    expect(eligibility('LEAVING', 'WITHDRAWN', '2026-11-05', '2026-11-04')).toEqual({ ok: false, reason: 'BEFORE_LEAVING' });
    expect(eligibility('LEAVING', 'WITHDRAWN', '2026-11-04', '2026-11-04')).toEqual({ ok: true });
    expect(eligibility('LEAVING', 'TRANSFERRED', '2026-10-01', '2026-11-04')).toEqual({ ok: true });
    expect(eligibility('LEAVING', 'GRADUATED', '2026-03-31', '2026-11-04')).toEqual({ ok: true });
  });
  it('only the leaving certificate is one at a time; status follows the void time', () => {
    expect(oneAtATime('LEAVING')).toBe(true);
    expect(oneAtATime('BONAFIDE')).toBe(false);
    expect(oneAtATime('CHARACTER')).toBe(false);
    expect(certStatus(null)).toBe('VALID');
    expect(certStatus('2026-11-04T09:00:00Z')).toBe('VOID');
  });
});
