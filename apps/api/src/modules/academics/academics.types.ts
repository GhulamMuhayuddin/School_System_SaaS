export interface SectionDto { id: string; classId: string; name: string; capacity: number | null; studentCount: number }
export interface ClassDto { id: string; name: string; level: number; studentCount: number; sections: SectionDto[] }

export interface SessionDto { id: string; name: string; startDate: string; endDate: string; isCurrent: boolean }
export interface SubjectDto { id: string; name: string; code: string | null; classCount: number }
export interface ClassSubjectsDto { classId: string; subjects: { id: string; name: string; code: string | null }[] }

/** Classes, sections (Phase 5), academic sessions, subjects and the subjects taught in each class (Phase 7). */
export interface AcademicsApi {
  listClasses(schoolId: string): Promise<ClassDto[]>;
  createClass(schoolId: string, input: { name: string; level: number }, actorId: string): Promise<ClassDto>;
  updateClass(schoolId: string, id: string, input: { name?: string; level?: number }, actorId: string): Promise<ClassDto>;
  deleteClass(schoolId: string, id: string, actorId: string): Promise<void>;
  createSection(schoolId: string, classId: string, input: { name: string; capacity?: number | null }, actorId: string): Promise<ClassDto>;
  updateSection(schoolId: string, id: string, input: { name?: string; capacity?: number | null }, actorId: string): Promise<ClassDto>;
  deleteSection(schoolId: string, id: string, actorId: string): Promise<void>;
  listSessions(schoolId: string): Promise<SessionDto[]>;
  createSession(schoolId: string, input: { name: string; startDate: string; endDate: string; isCurrent?: boolean }, actorId: string): Promise<SessionDto>;
  updateSession(schoolId: string, id: string, input: { name?: string; startDate?: string; endDate?: string }, actorId: string): Promise<SessionDto>;
  setCurrentSession(schoolId: string, id: string, actorId: string): Promise<SessionDto>;
  deleteSession(schoolId: string, id: string, actorId: string): Promise<void>;
  listSubjects(schoolId: string): Promise<SubjectDto[]>;
  createSubject(schoolId: string, input: { name: string; code?: string | null }, actorId: string): Promise<SubjectDto>;
  updateSubject(schoolId: string, id: string, input: { name?: string; code?: string | null }, actorId: string): Promise<SubjectDto>;
  deleteSubject(schoolId: string, id: string, actorId: string): Promise<void>;
  getClassSubjects(schoolId: string, classId: string): Promise<ClassSubjectsDto>;
  setClassSubjects(schoolId: string, classId: string, subjectIds: string[], actorId: string): Promise<ClassSubjectsDto>;
}
