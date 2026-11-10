export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'LATE' | 'LEAVE';

/** Who is calling. `canCorrect` = holds attendance.correct (may edit past days and any section). */
export interface Caller { userId: string; canCorrect: boolean }

/** attended = PRESENT + LATE; percentage = attended / marked days (all statuses), rounded, null when nothing is marked. */
export interface Totals { present: number; absent: number; late: number; leave: number; marked: number; percentage: number | null }

export type BlockReason = 'FUTURE_DATE' | 'HOLIDAY' | 'NOT_YOUR_SECTION' | 'PAST_DATE' | 'NO_SESSION';
export interface Access { canMark: boolean; reason: BlockReason | null }

export interface SectionRef { id: string; name: string; classId: string; className: string }
export interface Person { id: string; name: string }

export interface RosterStudent { id: string; admissionNo: string; name: string; status: AttendanceStatus | null; remark: string | null }
export interface SectionRoster {
  date: string;
  /** today in the school's time zone */
  today: string;
  section: SectionRef;
  holiday: { title: string } | null;
  /** true when at least one student already has a record for the date */
  marked: boolean;
  access: Access;
  students: RosterStudent[];
}

export interface StudentEntry { studentId: string; status: AttendanceStatus; remark?: string | null }
export interface StaffEntry { staffId: string; status: AttendanceStatus; remark?: string | null }

export interface MonthlyStudent { id: string; admissionNo: string; name: string; records: Record<string, AttendanceStatus>; totals: Totals }
export interface MonthlySheet { month: string; days: number; holidays: string[]; section: SectionRef; students: MonthlyStudent[] }

export interface StudentHistory {
  student: { id: string; admissionNo: string; name: string };
  from: string;
  to: string;
  records: { date: string; status: AttendanceStatus; remark: string | null }[];
  totals: Totals;
}

export interface ReportFilter { from: string; to: string; classId?: string; sectionId?: string; below?: number; limit: number }
export interface ReportRow { student: { id: string; admissionNo: string; name: string; className: string | null; sectionName: string | null }; totals: Totals }
export interface ReportDto { from: string; to: string; total: number; rows: ReportRow[] }

export interface StaffRosterRow { id: string; employeeNo: string; name: string; designation: string; status: AttendanceStatus | null; remark: string | null }
export interface StaffRoster { date: string; today: string; holiday: { title: string } | null; marked: boolean; staff: StaffRosterRow[] }
export interface MonthlyStaff { id: string; employeeNo: string; name: string; records: Record<string, AttendanceStatus>; totals: Totals }
export interface StaffMonthlySheet { month: string; days: number; holidays: string[]; staff: MonthlyStaff[] }

/** Every method receives the schoolId from the verified token (never from the request). */
export interface AttendanceApi {
  sectionRoster(schoolId: string, sectionId: string, date: string | undefined, caller: Caller): Promise<SectionRoster>;
  markStudents(schoolId: string, sectionId: string, input: { date: string; entries: StudentEntry[] }, caller: Caller): Promise<SectionRoster>;
  sectionMonthly(schoolId: string, sectionId: string, month: string): Promise<MonthlySheet>;
  studentHistory(schoolId: string, studentId: string, from: string, to: string): Promise<StudentHistory>;
  studentReport(schoolId: string, filter: ReportFilter): Promise<ReportDto>;
  staffRoster(schoolId: string, date: string | undefined): Promise<StaffRoster>;
  markStaff(schoolId: string, input: { date: string; entries: StaffEntry[] }, caller: Caller): Promise<StaffRoster>;
  staffMonthly(schoolId: string, month: string): Promise<StaffMonthlySheet>;
}
