import type { HomeworkState, SubmissionStatusKey, Tally } from './homework.logic';

export type { HomeworkState, SubmissionStatusKey, Tally };
/** `canManage` = may work with any section (academic.manage); otherwise only sections and subjects the user teaches. */
export interface Caller { userId: string; canManage: boolean }

export interface HomeworkDto {
  id: string; title: string; description: string | null; assignedDate: string; dueDate: string; maxMarks: number | null; state: HomeworkState;
  class: { id: string; name: string }; section: { id: string; name: string }; subject: { id: string; name: string }; counts: Tally;
}
export interface RosterRow { studentId: string; admissionNo: string; name: string; status: SubmissionStatusKey | null; marks: number | null; remark: string | null }
export interface HomeworkDetail extends HomeworkDto { roster: RosterRow[]; access: { canEdit: boolean; reason: 'NOT_YOUR_SUBJECT' | null } }

export interface HomeworkFilter { classId?: string; sectionId?: string; subjectId?: string; from?: string; to?: string; mine?: boolean }
export interface HomeworkInput { sectionId: string; subjectId: string; title: string; description?: string | null; assignedDate?: string; dueDate: string; maxMarks?: number | null }
export interface HomeworkPatch { title?: string; description?: string | null; dueDate?: string; maxMarks?: number | null }
export interface SubmissionEntry { studentId: string; status: SubmissionStatusKey | null; marks?: number | null; remark?: string | null }

export interface ChildHomework {
  id: string; title: string; description: string | null; subject: string; assignedDate: string; dueDate: string; maxMarks: number | null; state: HomeworkState;
  status: SubmissionStatusKey | 'PENDING'; marks: number | null; remark: string | null;
}

/** Every method receives the schoolId from the verified token (never from the request). */
export interface HomeworkApi {
  list(schoolId: string, filter: HomeworkFilter, caller: Caller): Promise<HomeworkDto[]>;
  create(schoolId: string, caller: Caller, input: HomeworkInput): Promise<HomeworkDetail>;
  get(schoolId: string, id: string, caller: Caller): Promise<HomeworkDetail>;
  update(schoolId: string, caller: Caller, id: string, patch: HomeworkPatch): Promise<HomeworkDetail>;
  remove(schoolId: string, caller: Caller, id: string): Promise<void>;
  saveSubmissions(schoolId: string, caller: Caller, id: string, entries: SubmissionEntry[]): Promise<HomeworkDetail>;
}
