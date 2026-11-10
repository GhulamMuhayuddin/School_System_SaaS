import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type CertType = 'BONAFIDE' | 'CHARACTER' | 'LEAVING';
export const CERT_TYPES: CertType[] = ['BONAFIDE', 'CHARACTER', 'LEAVING'];
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export interface Certificate {
  id: string; certNo: string; type: CertType; studentId: string; studentName: string; gender: Gender; fatherName: string | null; admissionNo: string; className: string;
  sectionName: string | null; dateOfBirth: string; admissionDate: string; leftAt: string | null; issuedOn: string; purpose: string | null; remarks: string | null;
  status: 'VALID' | 'VOID'; voidReason: string | null; issuedBy: string | null; createdAt: string;
}
export interface SchoolHeader { name: string; address: string | null; city: string | null; phone: string | null; email: string | null }
export interface CertificateDetail { certificate: Certificate; school: SchoolHeader }
export interface IssueValues { studentId: string; type: CertType; issuedOn: string; purpose: string | null; remarks: string | null }

type Translate = (key: string, options?: Record<string, unknown>) => string;

/**
 * The paragraphs of a certificate in the chosen language (`t` is a translator fixed to that language).
 * Gender only changes the words son / daughter and his / her; the Urdu wording is neutral so it reads right for either.
 */
export function certificateText(t: Translate, c: Certificate, fmt: (iso: string) => string): string[] {
  const o = { interpolation: { escapeValue: false } };
  const g = c.gender;
  const child = t(`print.cert.child.${g}`, o);
  const ofFather = c.fatherName ? t('print.cert.ofFather', { ...o, child, father: c.fatherName }) : '';
  const base = {
    ...o, name: c.studentName, ofFather, class: c.sectionName ? `${c.className} (${c.sectionName})` : c.className, admissionNo: c.admissionNo, dob: fmt(c.dateOfBirth), from: fmt(c.admissionDate),
    left: c.leftAt ? fmt(c.leftAt) : '', pos: t(`print.cert.pos.${g}`, o), posCap: t(`print.cert.posCap.${g}`, o),
  };
  if (c.type === 'BONAFIDE') return [t('print.cert.BONAFIDE.body', base), c.purpose ? t('print.cert.BONAFIDE.forPurpose', { ...base, purpose: c.purpose }) : t('print.cert.BONAFIDE.onRequest', o)];
  if (c.type === 'CHARACTER') return [t(c.leftAt ? 'print.cert.CHARACTER.bodyLeft' : 'print.cert.CHARACTER.bodyActive', base), c.remarks ?? t('print.cert.conductDefault', base)];
  return [t('print.cert.LEAVING.body', base), t('print.cert.LEAVING.dob', base), c.purpose ? t('print.cert.LEAVING.reason', { ...base, reason: c.purpose }) : '', c.remarks ?? ''].filter((p) => p !== '');
}

export const certTone = (s: Certificate['status']): 'success' | 'danger' => (s === 'VALID' ? 'success' : 'danger');

export const useCertificates = (f: { type?: CertType; status?: 'VALID' | 'VOID'; q?: string }) =>
  useQuery({
    queryKey: ['certificates', 'list', f],
    queryFn: () => {
      const p = new URLSearchParams();
      for (const [k, v] of Object.entries(f)) if (v) p.set(k, v);
      const s = p.toString();
      return apiFetch<{ certificates: Certificate[]; truncated: boolean }>(`/certificates${s ? `?${s}` : ''}`);
    },
  });
export const useCertificate = (id: string) => useQuery({ queryKey: ['certificates', 'one', id], queryFn: () => apiFetch<CertificateDetail>(`/certificates/${id}`) });

function useCertMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['certificates'] }) });
}
export const useIssueCertificate = () => useCertMutation((v: IssueValues) => apiFetch<CertificateDetail>('/certificates', { method: 'POST', body: v }));
export const useVoidCertificate = () => useCertMutation((v: { id: string; reason: string }) => apiFetch<CertificateDetail>(`/certificates/${v.id}/void`, { method: 'POST', body: { reason: v.reason } }));
