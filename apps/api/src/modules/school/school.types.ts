export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface SchoolOverview {
  school: { id: string; name: string; code: string; status: 'ACTIVE' | 'SUSPENDED'; city: string | null };
  subscription: { planName: string; status: string; endsAt: string | null } | null;
  currentSession: { id: string; name: string; startDate: string; endDate: string } | null;
  counts: { users: number; activeUsers: number; classes: number; sections: number; subjects: number };
  usersByRole: { roleKey: string; roleName: string; count: number }[];
  logins7d: number;
  failedLogins7d: number;
  recentActivity: SchoolAuditLogDto[];
}

export interface SchoolProfile {
  id: string; name: string; code: string; email: string | null; phone: string | null;
  address: string | null; city: string | null; country: string; timezone: string;
}
export interface UpdateProfileInput {
  name?: string; email?: string | null; phone?: string | null; address?: string | null; city?: string | null; timezone?: string;
}

export interface SchoolUserDto {
  id: string; email: string; firstName: string; lastName: string; phone: string | null; status: UserStatus;
  role: { id: string; key: string; name: string }; lastLoginAt: string | null; createdAt: string;
}
export interface CreateUserInput { firstName: string; lastName: string; email: string; phone?: string | null; roleId: string; password: string }
export interface UpdateUserInput { firstName?: string; lastName?: string; phone?: string | null; roleId?: string }

export interface SchoolAuditLogDto {
  id: string; action: string; createdAt: string; ip: string | null; metadata: unknown; user: { id: string; email: string } | null;
}

/** Every method receives the schoolId from the verified token (never from the request). `actorId` is the signed-in user. */
/** Name and address printed at the top of every printout. Readable by every signed-in member of the school. */
export interface Letterhead { name: string; address: string | null; city: string | null; phone: string | null; email: string | null }

export interface SchoolApi {
  letterhead(schoolId: string): Promise<Letterhead>;
  overview(schoolId: string): Promise<SchoolOverview>;
  getProfile(schoolId: string): Promise<SchoolProfile>;
  updateProfile(schoolId: string, input: UpdateProfileInput, actorId: string): Promise<SchoolProfile>;
  listUsers(schoolId: string, filter: { q?: string; roleId?: string; status?: UserStatus }): Promise<SchoolUserDto[]>;
  createUser(schoolId: string, input: CreateUserInput, actorId: string): Promise<SchoolUserDto>;
  updateUser(schoolId: string, userId: string, input: UpdateUserInput, actorId: string): Promise<SchoolUserDto>;
  setUserStatus(schoolId: string, userId: string, status: 'ACTIVE' | 'INACTIVE', actorId: string): Promise<SchoolUserDto>;
  createStaffAccount(schoolId: string, staffId: string, input: { email: string; password: string; roleId: string }, actorId: string): Promise<SchoolUserDto>;
  createStudentAccount(schoolId: string, studentId: string, input: { email: string; password: string }, actorId: string): Promise<SchoolUserDto>;
  createGuardianAccount(schoolId: string, guardianId: string, input: { email: string; password: string }, actorId: string): Promise<SchoolUserDto>;
  listAuditLogs(schoolId: string, filter: { action?: string; userId?: string; limit: number }): Promise<SchoolAuditLogDto[]>;
}
