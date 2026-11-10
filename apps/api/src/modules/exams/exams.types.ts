/** Who is calling. `canManage` = holds exam.manage (may enter marks for any paper, even in other teachers' sections). */
export interface Caller { userId: string; canManage: boolean }

export type ExamStatus = 'DRAFT' | 'PUBLISHED';

export interface GradeBandDto { grade: string; minPercent: number; remark: string | null }

export interface ExamDto {
  id: string; sessionId: string; sessionName: string; name: string;
  startDate: string | null; endDate: string | null; status: ExamStatus; publishedAt: string | null; paperCount: number;
}
export interface PaperDto {
  id: string; classId: string; className: string; subjectId: string; subjectName: string;
  totalMarks: number; passMarks: number; examDate: string | null;
  /** students of the class that already have a mark (or an absent flag) for this paper, and how many students the class has */
  entered: number; students: number;
}
export interface ExamDetail extends ExamDto { papers: PaperDto[] }

export type MarkBlockReason = 'PUBLISHED' | 'NOT_YOUR_SUBJECT';
export interface MarkAccess { canEnter: boolean; reason: MarkBlockReason | null }
export interface MarkRow { studentId: string; admissionNo: string; name: string; sectionName: string | null; marks: number | null; absent: boolean; remark: string | null; entered: boolean }
export interface PaperMarks { exam: { id: string; name: string; status: ExamStatus }; paper: PaperDto; access: MarkAccess; students: MarkRow[] }
export interface MarkEntry { studentId: string; marks?: number | null; absent?: boolean; remark?: string | null }
export interface PaperInput { subjectId: string; totalMarks: number; passMarks: number; examDate?: string | null }

/** One subject of one student. entered=false: nothing recorded yet. absent counts as 0 marks and a fail. */
export interface SubjectResult {
  subjectId: string; subjectName: string; totalMarks: number; passMarks: number;
  entered: boolean; marks: number | null; absent: boolean; percentage: number | null; grade: string | null; passed: boolean | null;
}
export interface StudentResult {
  student: { id: string; admissionNo: string; name: string; sectionName: string | null };
  subjects: SubjectResult[];
  obtained: number; total: number; percentage: number | null; grade: string | null; passed: boolean | null;
  /** every paper of the class has a mark or an absent flag; only complete students get a percentage, grade and position */
  complete: boolean;
  position: number | null;
}
export interface ResultSummary { students: number; complete: number; incomplete: number; passed: number; failed: number; passRate: number | null }
export interface ClassResults {
  exam: ExamDto; class: { id: string; name: string };
  subjects: { subjectId: string; subjectName: string; totalMarks: number; passMarks: number }[];
  students: StudentResult[]; summary: ResultSummary;
}
export interface StudentExamResult { exam: ExamDto; class: { id: string; name: string }; classSize: number; result: StudentResult }

/** Every method receives the schoolId from the verified token (never from the request). */
export interface ExamsApi {
  gradeBands(schoolId: string): Promise<{ bands: GradeBandDto[]; isDefault: boolean }>;
  setGradeBands(schoolId: string, actorId: string, bands: GradeBandDto[]): Promise<{ bands: GradeBandDto[]; isDefault: boolean }>;
  listExams(schoolId: string, sessionId: string | undefined): Promise<ExamDto[]>;
  createExam(schoolId: string, actorId: string, input: { name: string; sessionId?: string; startDate?: string | null; endDate?: string | null }): Promise<ExamDetail>;
  getExam(schoolId: string, examId: string): Promise<ExamDetail>;
  updateExam(schoolId: string, actorId: string, examId: string, patch: { name?: string; startDate?: string | null; endDate?: string | null }): Promise<ExamDetail>;
  deleteExam(schoolId: string, actorId: string, examId: string): Promise<void>;
  setPapers(schoolId: string, actorId: string, examId: string, classId: string, papers: PaperInput[]): Promise<ExamDetail>;
  paperMarks(schoolId: string, paperId: string, caller: Caller): Promise<PaperMarks>;
  saveMarks(schoolId: string, paperId: string, entries: MarkEntry[], caller: Caller): Promise<PaperMarks>;
  classResults(schoolId: string, examId: string, classId: string, sectionId: string | undefined): Promise<ClassResults>;
  studentResult(schoolId: string, examId: string, studentId: string): Promise<StudentExamResult>;
  publish(schoolId: string, actorId: string, examId: string, force: boolean): Promise<ExamDetail>;
  unpublish(schoolId: string, actorId: string, examId: string): Promise<ExamDetail>;
}
