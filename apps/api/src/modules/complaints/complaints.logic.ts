/** Pure complaint rules (no database). */
export type ComplaintStatusValue = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED' | 'CLOSED';
export const COMPLAINT_COUNTER = 'complaint_no';
export const complaintNo = (n: number): string => `C-${String(n).padStart(6, '0')}`;

/** Which status may follow which. A resolved or closed complaint can be reopened; closing needs a resolution first. */
const NEXT: Record<ComplaintStatusValue, ComplaintStatusValue[]> = {
  OPEN: ['IN_PROGRESS', 'RESOLVED'],
  IN_PROGRESS: ['OPEN', 'RESOLVED'],
  RESOLVED: ['CLOSED', 'OPEN'],
  CLOSED: ['OPEN'],
};
export const canMove = (from: ComplaintStatusValue, to: ComplaintStatusValue): boolean => NEXT[from].includes(to);
export const nextStatuses = (from: ComplaintStatusValue): ComplaintStatusValue[] => [...NEXT[from]];
/** Marking a complaint resolved needs a written resolution of at least 3 characters. */
export const resolutionOk = (text: string | null | undefined): boolean => (text ?? '').trim().length >= 3;
/** Whole days a complaint has been waiting (or took, when finished); never negative. */
export const ageDays = (from: string, to: string): number => Math.max(0, Math.floor((Date.parse(to) - Date.parse(from)) / 86_400_000));
export const isActive = (s: ComplaintStatusValue): boolean => s === 'OPEN' || s === 'IN_PROGRESS';
