export interface PeriodDto { id: string; name: string; startTime: string; endTime: string; sortOrder: number; isBreak: boolean }
export interface PersonRef { id: string; name: string }
export interface SectionRef { id: string; name: string; classId: string; className: string }
export interface SessionRef { id: string; name: string }

export interface AssignmentDto {
  id: string;
  sessionId: string;
  staff: PersonRef;
  section: SectionRef;
  subject: { id: string; name: string };
}

export interface EntryDto {
  id: string;
  dayOfWeek: number; // 1 = Monday ... 7 = Sunday
  period: PeriodDto;
  subject: { id: string; name: string };
  staff: PersonRef | null;
  room: string | null;
}
export interface SectionEntryDto extends EntryDto { sectionId: string }
export interface TeacherEntryDto extends EntryDto { section: SectionRef }

export interface SectionTimetable { session: SessionRef; section: SectionRef; periods: PeriodDto[]; entries: SectionEntryDto[] }
export interface TeacherTimetable { session: SessionRef; staff: PersonRef; periods: PeriodDto[]; entries: TeacherEntryDto[] }

export interface PeriodInput { name: string; startTime: string; endTime: string; isBreak?: boolean }
export interface AssignmentInput { sessionId?: string; sectionId: string; subjectId: string; staffId: string }
export interface AssignmentFilter { sessionId?: string; staffId?: string; sectionId?: string }
export interface EntryInput { sessionId?: string; sectionId: string; dayOfWeek: number; periodId: string; subjectId: string; room?: string | null }

export interface TeacherOption { id: string; name: string; employeeNo: string }

/** Every method receives the schoolId from the verified token (never from the request). */
export interface TimetableApi {
  /** Active teaching staff (id and name only) for pickers; needs only academic.read. */
  listTeachers(schoolId: string): Promise<TeacherOption[]>;
  /** The timetable of the staff member whose login is `userId` (404 when the login is not linked to a staff profile). */
  myTimetable(schoolId: string, userId: string, sessionId?: string): Promise<TeacherTimetable>;
  listPeriods(schoolId: string): Promise<PeriodDto[]>;
  createPeriod(schoolId: string, input: PeriodInput, actorId: string): Promise<PeriodDto>;
  updatePeriod(schoolId: string, id: string, input: Partial<PeriodInput>, actorId: string): Promise<PeriodDto>;
  deletePeriod(schoolId: string, id: string, actorId: string): Promise<void>;
  listAssignments(schoolId: string, filter: AssignmentFilter): Promise<AssignmentDto[]>;
  assign(schoolId: string, input: AssignmentInput, actorId: string): Promise<AssignmentDto>;
  unassign(schoolId: string, id: string, actorId: string): Promise<void>;
  sectionTimetable(schoolId: string, sectionId: string, sessionId?: string): Promise<SectionTimetable>;
  teacherTimetable(schoolId: string, staffId: string, sessionId?: string): Promise<TeacherTimetable>;
  setEntry(schoolId: string, input: EntryInput, actorId: string): Promise<SectionEntryDto>;
  deleteEntry(schoolId: string, id: string, actorId: string): Promise<void>;
}
