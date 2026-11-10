import type { LedgerKind, LedgerSummary, MonthRow } from './accounts.logic';

export type { LedgerKind, LedgerSummary, MonthRow };
export type PaymentMethod = 'CASH' | 'BANK' | 'ONLINE';

export interface CategoryDto { id: string; kind: LedgerKind; name: string; isActive: boolean }
export interface EntryDto {
  id: string; entryNo: string; kind: LedgerKind; category: { id: string; name: string }; amount: number; method: PaymentMethod;
  entryDate: string; description: string; party: string | null; reference: string | null; voided: boolean; voidReason: string | null; createdAt: string;
}
export interface EntryInput {
  kind: LedgerKind; categoryId: string; amount: number; method: PaymentMethod; entryDate: string;
  description: string; party?: string | null; reference?: string | null;
}
export interface EntryFilter { kind?: LedgerKind; categoryId?: string; from?: string; to?: string; method?: PaymentMethod; q?: string; includeVoided?: boolean }
export interface EntryList { entries: EntryDto[]; income: number; expense: number; truncated: boolean }
export interface AccountSummary extends LedgerSummary { from: string; to: string }

/** Every method receives the schoolId from the verified token (never from the request). */
export interface AccountsApi {
  categories(schoolId: string, kind: LedgerKind | undefined): Promise<CategoryDto[]>;
  createCategory(schoolId: string, actorId: string, input: { kind: LedgerKind; name: string }): Promise<CategoryDto>;
  updateCategory(schoolId: string, actorId: string, id: string, patch: { name?: string; isActive?: boolean }): Promise<CategoryDto>;
  addDefaultCategories(schoolId: string, actorId: string): Promise<{ created: number }>;
  listEntries(schoolId: string, filter: EntryFilter): Promise<EntryList>;
  createEntry(schoolId: string, actorId: string, input: EntryInput): Promise<EntryDto>;
  getEntry(schoolId: string, id: string): Promise<EntryDto>;
  voidEntry(schoolId: string, actorId: string, id: string, reason: string): Promise<EntryDto>;
  summary(schoolId: string, from: string | undefined, to: string | undefined): Promise<AccountSummary>;
  monthly(schoolId: string, year: number | undefined): Promise<{ year: number; months: MonthRow[] }>;
}
