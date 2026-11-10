export type SchoolStatus = 'ACTIVE' | 'SUSPENDED';
export type SubscriptionStatus = 'TRIAL' | 'ACTIVE' | 'PAST_DUE' | 'CANCELLED' | 'EXPIRED';
export type UserStatus = 'ACTIVE' | 'INACTIVE' | 'LOCKED';

export interface SubscriptionDto {
  id: string;
  planId: string;
  planName: string;
  status: SubscriptionStatus;
  startsAt: string;
  endsAt: string | null;
}

export interface SchoolListItem {
  id: string;
  name: string;
  code: string;
  status: SchoolStatus;
  email: string | null;
  city: string | null;
  createdAt: string;
  userCount: number;
  subscription: SubscriptionDto | null;
}

export interface SchoolAdminDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  lastLoginAt: string | null;
}

export interface SchoolDetail extends SchoolListItem {
  phone: string | null;
  address: string | null;
  country: string;
  timezone: string;
  counts: { users: number; classes: number; sections: number; subjects: number };
  admins: SchoolAdminDto[];
  subscriptions: SubscriptionDto[];
}

export interface PlanDto {
  id: string;
  name: string;
  priceMonthly: number;
  maxStudents: number | null;
  maxStaff: number | null;
  isActive: boolean;
  schoolCount: number;
}

export interface PlatformAdminDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  status: UserStatus;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AuditLogDto {
  id: string;
  action: string;
  createdAt: string;
  ip: string | null;
  metadata: unknown;
  user: { id: string; email: string } | null;
  school: { id: string; name: string } | null;
}

export interface PlatformAnalytics {
  schools: { total: number; active: number; suspended: number };
  users: { schoolUsers: number; platformAdmins: number };
  subscriptions: Record<SubscriptionStatus | 'NONE', number>;
  newSchoolsByMonth: { month: string; count: number }[]; // last 6 months, oldest first, "YYYY-MM"
  logins7d: number;
  failedLogins7d: number;
}

export interface CreateSchoolInput {
  name: string;
  code: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  timezone: string;
  planId: string;
  admin: { firstName: string; lastName: string; email: string; password: string };
}

export type UpdateSchoolInput = Partial<Pick<CreateSchoolInput, 'name' | 'email' | 'phone' | 'address' | 'city' | 'timezone'>>;

export interface SubscriptionInput {
  planId: string;
  status: SubscriptionStatus;
  endsAt?: string | null;
}

export interface PlanInput {
  name: string;
  priceMonthly: number;
  maxStudents?: number | null;
  maxStaff?: number | null;
  isActive: boolean;
}

export interface CreatePlatformAdminInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

/** Operations the HTTP layer needs. Routes depend on this interface so they can be tested with a fake. `actorId` is the signed-in Super Administrator (for the audit log). */
export interface PlatformApi {
  listSchools(filter: { q?: string; status?: SchoolStatus }): Promise<SchoolListItem[]>;
  getSchool(id: string): Promise<SchoolDetail>;
  createSchool(input: CreateSchoolInput, actorId: string): Promise<SchoolDetail>;
  updateSchool(id: string, input: UpdateSchoolInput, actorId: string): Promise<SchoolDetail>;
  setSchoolStatus(id: string, status: SchoolStatus, actorId: string): Promise<SchoolDetail>;
  setSubscription(schoolId: string, input: SubscriptionInput, actorId: string): Promise<SchoolDetail>;

  listPlans(): Promise<PlanDto[]>;
  createPlan(input: PlanInput, actorId: string): Promise<PlanDto>;
  updatePlan(id: string, input: Partial<PlanInput>, actorId: string): Promise<PlanDto>;

  analytics(): Promise<PlatformAnalytics>;
  listAuditLogs(filter: { schoolId?: string; action?: string; limit: number }): Promise<AuditLogDto[]>;

  listPlatformAdmins(): Promise<PlatformAdminDto[]>;
  createPlatformAdmin(input: CreatePlatformAdminInput, actorId: string): Promise<PlatformAdminDto>;
  setPlatformAdminStatus(id: string, status: 'ACTIVE' | 'INACTIVE', actorId: string): Promise<PlatformAdminDto>;
}
