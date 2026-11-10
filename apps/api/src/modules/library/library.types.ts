import type { CopyStatusKey, FineStatusKey, LoanState } from './library.logic';

export type { CopyStatusKey, FineStatusKey, LoanState };
export interface LibrarySettingsDto { loanDays: number; finePerDay: number; maxBooksStudent: number }
export interface BookCounts { total: number; available: number; issued: number; lost: number; withdrawn: number }
export interface BookDto {
  id: string; title: string; author: string; isbn: string | null; category: string | null; publisher: string | null; language: string | null; location: string | null;
  active: boolean; counts: BookCounts;
}
export interface BorrowerRef { id: string; name: string; admissionNo: string }
export interface CopyDto {
  id: string; accessionNo: string; status: CopyStatusKey;
  loan: { id: string; student: BorrowerRef; dueOn: string; overdue: boolean } | null;
}
export interface BookDetail extends BookDto { copies: CopyDto[] }
export interface LoanDto {
  id: string; copy: { id: string; accessionNo: string }; book: { id: string; title: string; author: string }; student: BorrowerRef & { className: string | null };
  issuedOn: string; dueOn: string; returnedOn: string | null; renewals: number; state: LoanState; overdueDays: number;
  /** Stored fine once returned; for an open overdue loan the fine so far. */
  fine: number; fineStatus: FineStatusKey;
}
export interface LibrarySummary { books: number; copies: number; available: number; issued: number; overdue: number; unpaidFines: { count: number; amount: number } }
export interface StudentLibrary { loans: LoanDto[]; unpaidFine: number }

export interface BookFilter { q?: string; category?: string; availableOnly?: boolean; includeInactive?: boolean }
export interface BookInput { title: string; author: string; isbn?: string | null; category?: string | null; publisher?: string | null; language?: string | null; location?: string | null; copies?: number }
export interface BookPatch { title?: string; author?: string; isbn?: string | null; category?: string | null; publisher?: string | null; language?: string | null; location?: string | null; active?: boolean }
export interface IssueInput { copyId?: string; accessionNo?: string; studentId: string; dueOn?: string }
export interface LoanFilter { status?: 'open' | 'overdue' | 'returned' | 'all'; studentId?: string; q?: string }

/** Every method receives the schoolId from the verified token (never from the request); `actorId` is the signed-in user. */
export interface LibraryApi {
  settings(schoolId: string): Promise<LibrarySettingsDto>;
  saveSettings(schoolId: string, actorId: string, input: LibrarySettingsDto): Promise<LibrarySettingsDto>;
  summary(schoolId: string): Promise<LibrarySummary>;
  listBooks(schoolId: string, filter: BookFilter): Promise<{ books: BookDto[]; categories: string[]; truncated: boolean }>;
  createBook(schoolId: string, actorId: string, input: BookInput): Promise<BookDetail>;
  getBook(schoolId: string, id: string): Promise<BookDetail>;
  updateBook(schoolId: string, actorId: string, id: string, patch: BookPatch): Promise<BookDetail>;
  addCopies(schoolId: string, actorId: string, id: string, count: number): Promise<BookDetail>;
  setCopyStatus(schoolId: string, actorId: string, copyId: string, status: CopyStatusKey): Promise<BookDetail>;
  issue(schoolId: string, actorId: string, input: IssueInput): Promise<LoanDto>;
  returnLoan(schoolId: string, actorId: string, loanId: string): Promise<LoanDto>;
  renew(schoolId: string, actorId: string, loanId: string): Promise<LoanDto>;
  settleFine(schoolId: string, actorId: string, loanId: string, action: 'PAID' | 'WAIVED'): Promise<LoanDto>;
  listLoans(schoolId: string, filter: LoanFilter): Promise<{ loans: LoanDto[]; truncated: boolean }>;
  /** For the parent/student portal: the caller's ownership is checked by the portal before this is called. */
  studentLibrary(schoolId: string, studentId: string): Promise<StudentLibrary>;
}
