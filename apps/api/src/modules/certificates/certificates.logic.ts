/** Pure certificate rules (no database). */
export type CertificateTypeValue = 'BONAFIDE' | 'CHARACTER' | 'LEAVING';
export type StudentStatusValue = 'ACTIVE' | 'WITHDRAWN' | 'TRANSFERRED' | 'GRADUATED';
export const CERT_COUNTER = 'certificate_no';
export const certNo = (n: number): string => `CERT-${String(n).padStart(6, '0')}`;

export type Eligibility = { ok: true } | { ok: false; reason: 'NOT_ACTIVE' | 'STILL_ACTIVE' | 'NO_LEAVING_DATE' | 'BEFORE_LEAVING' };
/**
 * Bonafide (currently studying here) needs an ACTIVE student. A leaving certificate needs a student who has left (not ACTIVE) with a leaving date,
 * and cannot be dated before that day. A character certificate may be issued for any student.
 */
export function eligibility(type: CertificateTypeValue, status: StudentStatusValue, leftAt: string | null, issuedOn: string): Eligibility {
  if (type === 'BONAFIDE') return status === 'ACTIVE' ? { ok: true } : { ok: false, reason: 'NOT_ACTIVE' };
  if (type === 'LEAVING') {
    if (status === 'ACTIVE') return { ok: false, reason: 'STILL_ACTIVE' };
    if (leftAt === null) return { ok: false, reason: 'NO_LEAVING_DATE' };
    return issuedOn >= leftAt ? { ok: true } : { ok: false, reason: 'BEFORE_LEAVING' };
  }
  return { ok: true };
}
/** A student gets only one valid leaving certificate (a copy is a reprint of the same entry); the other kinds may be issued again. */
export const oneAtATime = (type: CertificateTypeValue): boolean => type === 'LEAVING';
export const certStatus = (voidedAt: string | null): 'VALID' | 'VOID' => (voidedAt === null ? 'VALID' : 'VOID');
