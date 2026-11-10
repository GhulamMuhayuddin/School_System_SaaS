import type { Concession, VoucherStatusKey } from './fees.logic';

export type FeeFrequency = 'MONTHLY' | 'ONE_TIME';
export type PaymentMethod = 'CASH' | 'BANK' | 'ONLINE';

export interface FeeHeadDto { id: string; name: string; isActive: boolean }
export interface StructureItem { feeHeadId: string; feeHeadName: string; amount: number; frequency: FeeFrequency }
export interface ClassStructure { sessionId: string; sessionName: string; classId: string; items: StructureItem[]; monthlyTotal: number; oneTimeTotal: number }
export interface ConcessionDto extends Concession { studentId: string; sessionId: string; reason: string | null }

export interface VoucherDto {
  id: string; voucherNo: string; period: string; dueDate: string; status: VoucherStatusKey; overdue: boolean;
  student: { id: string; admissionNo: string; name: string }; className: string; sectionName: string | null;
  totalAmount: number; discountAmount: number; netAmount: number; paidAmount: number; balance: number;
}
export interface VoucherItemDto { id: string; description: string; amount: number }
export interface PaymentDto {
  id: string; receiptNo: string; voucherId: string; voucherNo: string; amount: number; method: PaymentMethod; reference: string | null;
  paidAt: string; voided: boolean; voidReason: string | null;
  student: { id: string; admissionNo: string; name: string }; period: string;
}
export interface VoucherDetail extends VoucherDto { items: VoucherItemDto[]; payments: PaymentDto[]; cancelReason: string | null }

export interface VoucherFilter { classId?: string; sectionId?: string; status?: VoucherStatusKey; period?: string; studentId?: string; q?: string; overdue?: boolean }
export interface GenerateInput { classId: string; sectionId?: string; period: string; dueDate: string; sessionId?: string; includeOneTime?: boolean; includeTransport?: boolean; includeHostel?: boolean }
export interface GenerateResult { created: number; skippedExisting: number; students: number; totalBilled: number }
export interface PayInput { amount: number; method: PaymentMethod; reference?: string | null; paidAt?: string }

export interface FeeSummary {
  from: string; to: string; collected: number; receipts: number; byMethod: { method: PaymentMethod; amount: number }[];
  billed: number; totalCollected: number; balance: number; overdueBalance: number;
}
export interface DefaulterRow { student: { id: string; admissionNo: string; name: string }; className: string; sectionName: string | null; vouchers: number; balance: number; oldestDueDate: string }

/** Every method receives the schoolId from the verified token (never from the request). */
export interface FeesApi {
  heads(schoolId: string): Promise<FeeHeadDto[]>;
  createHead(schoolId: string, actorId: string, name: string): Promise<FeeHeadDto>;
  updateHead(schoolId: string, actorId: string, id: string, patch: { name?: string; isActive?: boolean }): Promise<FeeHeadDto>;
  structure(schoolId: string, classId: string, sessionId: string | undefined): Promise<ClassStructure>;
  setStructure(schoolId: string, actorId: string, classId: string, sessionId: string | undefined, items: { feeHeadId: string; amount: number; frequency: FeeFrequency }[]): Promise<ClassStructure>;
  concession(schoolId: string, studentId: string, sessionId: string | undefined): Promise<ConcessionDto | null>;
  setConcession(schoolId: string, actorId: string, studentId: string, sessionId: string | undefined, input: Concession & { reason?: string | null }): Promise<ConcessionDto>;
  removeConcession(schoolId: string, actorId: string, studentId: string, sessionId: string | undefined): Promise<void>;
  generate(schoolId: string, actorId: string, input: GenerateInput): Promise<GenerateResult>;
  listVouchers(schoolId: string, filter: VoucherFilter): Promise<VoucherDto[]>;
  getVoucher(schoolId: string, id: string): Promise<VoucherDetail>;
  cancelVoucher(schoolId: string, actorId: string, id: string, reason: string): Promise<VoucherDetail>;
  pay(schoolId: string, actorId: string, voucherId: string, input: PayInput): Promise<PaymentDto>;
  getPayment(schoolId: string, id: string): Promise<PaymentDto>;
  voidPayment(schoolId: string, actorId: string, id: string, reason: string): Promise<PaymentDto>;
  summary(schoolId: string, from: string | undefined, to: string | undefined): Promise<FeeSummary>;
  defaulters(schoolId: string, classId: string | undefined): Promise<DefaulterRow[]>;
}
