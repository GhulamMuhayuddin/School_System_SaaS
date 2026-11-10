import type { CertificateTypeValue } from './certificates.logic';

export type { CertificateTypeValue };
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';
export interface CertificateDto {
  id: string; certNo: string; type: CertificateTypeValue; studentId: string; studentName: string; gender: Gender; fatherName: string | null; admissionNo: string;
  className: string; sectionName: string | null; dateOfBirth: string; admissionDate: string; leftAt: string | null; issuedOn: string; purpose: string | null; remarks: string | null;
  status: 'VALID' | 'VOID'; voidReason: string | null; issuedBy: string | null; createdAt: string;
}
export interface SchoolHeader { name: string; address: string | null; city: string | null; phone: string | null; email: string | null }
export interface CertificateDetail { certificate: CertificateDto; school: SchoolHeader }
export interface IssueInput { studentId: string; type: CertificateTypeValue; issuedOn?: string; purpose?: string | null; remarks?: string | null }
export interface CertificateFilter { type?: CertificateTypeValue; status?: 'VALID' | 'VOID'; studentId?: string; q?: string }

/** Every method receives the schoolId from the verified token (never from the request); `actorId` is the signed-in user. */
export interface CertificatesApi {
  list(schoolId: string, filter: CertificateFilter): Promise<{ certificates: CertificateDto[]; truncated: boolean }>;
  get(schoolId: string, id: string): Promise<CertificateDetail>;
  issue(schoolId: string, actorId: string, input: IssueInput): Promise<CertificateDetail>;
  void(schoolId: string, actorId: string, id: string, reason: string): Promise<CertificateDetail>;
}
