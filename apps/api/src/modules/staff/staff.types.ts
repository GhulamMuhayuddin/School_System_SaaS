export type StaffCategory = 'TEACHING' | 'ADMINISTRATIVE' | 'SUPPORT';
export type StaffStatus = 'ACTIVE' | 'LEFT';
export type Gender = 'MALE' | 'FEMALE' | 'OTHER';

export interface StaffListItem {
  id: string; employeeNo: string; firstName: string; lastName: string; gender: Gender; category: StaffCategory; designation: string;
  phone: string; status: StaffStatus; hasAccount: boolean;
}
export interface StaffDetail extends StaffListItem {
  email: string | null; cnic: string | null; address: string | null; dateOfBirth: string | null; qualification: string | null;
  joiningDate: string; leftAt: string | null; leftReason: string | null; notes: string | null; createdAt: string;
  account: { id: string; email: string; role: string } | null;
}
export interface StaffInput {
  employeeNo?: string; firstName: string; lastName: string; gender: Gender; dateOfBirth?: string | null; phone: string; email?: string | null;
  cnic?: string | null; address?: string | null; category: StaffCategory; designation: string; qualification?: string | null;
  joiningDate: string; notes?: string | null;
}
export type UpdateStaffInput = Partial<Omit<StaffInput, 'employeeNo'>>;
export interface StaffListResult { staff: StaffListItem[]; total: number }

export interface StaffApi {
  list(schoolId: string, filter: { q?: string; category?: StaffCategory; status?: StaffStatus; limit: number }): Promise<StaffListResult>;
  get(schoolId: string, id: string): Promise<StaffDetail>;
  create(schoolId: string, input: StaffInput, actorId: string): Promise<StaffDetail>;
  update(schoolId: string, id: string, input: UpdateStaffInput, actorId: string): Promise<StaffDetail>;
  leave(schoolId: string, id: string, input: { date: string; reason?: string | null }, actorId: string): Promise<StaffDetail>;
  reinstate(schoolId: string, id: string, actorId: string): Promise<StaffDetail>;
  remove(schoolId: string, id: string, actorId: string): Promise<void>;
}
