import type { Balance, LeaveStatusValue } from './leave.logic';

export type { Balance, LeaveStatusValue };
export interface LeaveTypeDto { id: string; name: string; yearlyQuota: number | null; paid: boolean; active: boolean }
export interface LeaveTypeInput { name: string; yearlyQuota?: number | null; paid?: boolean }
export interface LeaveTypePatch { name?: string; yearlyQuota?: number | null; paid?: boolean; active?: boolean }
export interface LeaveRequestDto {
  id: string; requestNo: string; staff: { id: string; employeeNo: string; name: string };
  leaveType: { id: string; name: string; paid: boolean }; fromDate: string; toDate: string; days: number; reason: string | null;
  status: LeaveStatusValue; decidedAt: string | null; decisionNote: string | null; createdAt: string;
}
export interface LeaveApplyInput { leaveTypeId: string; fromDate: string; toDate: string; reason?: string | null; staffId?: string }
export interface LeaveFilter { status?: LeaveStatusValue; staffId?: string; from?: string; to?: string }
export interface BalanceRow { leaveType: { id: string; name: string; paid: boolean }; balance: Balance }
export interface BalancesDto { staff: { id: string; employeeNo: string; name: string }; year: number; balances: BalanceRow[] }

/** Who is calling. `canApprove` = leave.approve; `canSeeAll` = leave.read. Both come from the caller's role, never from the request. */
export interface LeaveActor { userId: string; canApprove: boolean; canSeeAll: boolean }

export interface LeaveApi {
  listTypes(schoolId: string, includeInactive: boolean): Promise<LeaveTypeDto[]>;
  createType(schoolId: string, actorId: string, input: LeaveTypeInput): Promise<LeaveTypeDto>;
  updateType(schoolId: string, actorId: string, id: string, patch: LeaveTypePatch): Promise<LeaveTypeDto>;
  addDefaultTypes(schoolId: string, actorId: string): Promise<{ created: number; types: LeaveTypeDto[] }>;
  list(schoolId: string, actor: LeaveActor, filter: LeaveFilter & { mine?: boolean }): Promise<{ requests: LeaveRequestDto[]; truncated: boolean }>;
  apply(schoolId: string, actor: LeaveActor, input: LeaveApplyInput): Promise<LeaveRequestDto>;
  approve(schoolId: string, actor: LeaveActor, id: string, note: string | null): Promise<LeaveRequestDto>;
  reject(schoolId: string, actor: LeaveActor, id: string, note: string | null): Promise<LeaveRequestDto>;
  cancel(schoolId: string, actor: LeaveActor, id: string): Promise<LeaveRequestDto>;
  balances(schoolId: string, actor: LeaveActor, staffId: string | undefined, year: number): Promise<BalancesDto>;
}
