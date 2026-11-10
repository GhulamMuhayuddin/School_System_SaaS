/** Pure hostel rules (no database). */
export const MAX_BEDS = 40;
export type HostelKindValue = 'BOYS' | 'GIRLS' | 'MIXED';
export type GenderValue = 'MALE' | 'FEMALE' | 'OTHER';

/** A boys hostel takes boys, a girls hostel takes girls, a mixed hostel takes anyone. */
export function genderAllowed(kind: HostelKindValue, gender: GenderValue): boolean {
  if (kind === 'MIXED') return true;
  return kind === 'BOYS' ? gender === 'MALE' : gender === 'FEMALE';
}

/** Gender of the first resident who would not fit if a hostel changed to `kind`, or null when everyone still fits. */
export function firstMisfit(kind: HostelKindValue, genders: GenderValue[]): GenderValue | null {
  return genders.find((g) => !genderAllowed(kind, g)) ?? null;
}

export type BedState = 'FREE' | 'FULL' | 'OVER';
export function bedState(beds: number, residents: number): BedState {
  return residents > beds ? 'OVER' : residents === beds ? 'FULL' : 'FREE';
}

/** Can one more student move in? `alreadyInRoom` is true when the student is only being saved again in the same room. */
export function canMoveIn(beds: number, residents: number, alreadyInRoom: boolean): boolean {
  return alreadyInRoom || residents < beds;
}

/** Expected monthly income of a room (every resident pays the bed fee). */
export const roomIncome = (monthlyFee: number, residents: number): number => Math.max(0, monthlyFee) * Math.max(0, residents);

/** Room numbers are compared and stored in capitals without spaces at the ends: " a-12 " -> "A-12". */
export const normalRoomNo = (n: string): string => n.trim().toUpperCase();
