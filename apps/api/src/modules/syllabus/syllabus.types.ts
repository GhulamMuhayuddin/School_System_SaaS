export type TopicStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';

export interface TopicDto {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  status: TopicStatus;
  completedAt: string | null;
}
export interface Progress { total: number; completed: number; inProgress: number }
export interface SyllabusDto {
  session: { id: string; name: string };
  classId: string;
  subject: { id: string; name: string };
  topics: TopicDto[];
  progress: Progress;
}
export interface SubjectProgress { subject: { id: string; name: string }; progress: Progress }
export interface SummaryDto { session: { id: string; name: string }; classId: string; subjects: SubjectProgress[] }

export interface SyllabusFilter { classId: string; subjectId: string; sessionId?: string }
export interface CreateTopicInput { classId: string; subjectId: string; sessionId?: string; title: string; description?: string | null }
export interface UpdateTopicInput { title?: string; description?: string | null }

/** Every method receives the schoolId from the verified token (never from the request). */
export interface SyllabusApi {
  list(schoolId: string, filter: SyllabusFilter): Promise<SyllabusDto>;
  summary(schoolId: string, classId: string, sessionId?: string): Promise<SummaryDto>;
  create(schoolId: string, input: CreateTopicInput, actorId: string): Promise<TopicDto>;
  update(schoolId: string, id: string, input: UpdateTopicInput, actorId: string): Promise<TopicDto>;
  setStatus(schoolId: string, id: string, status: TopicStatus, actorId: string): Promise<TopicDto>;
  move(schoolId: string, id: string, direction: 'up' | 'down', actorId: string): Promise<TopicDto[]>;
  remove(schoolId: string, id: string, actorId: string): Promise<void>;
}
