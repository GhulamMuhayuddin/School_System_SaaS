import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type EventType = 'HOLIDAY' | 'EVENT' | 'EXAM' | 'OTHER';
export type TopicStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED';
export const EVENT_TYPES: EventType[] = ['HOLIDAY', 'EVENT', 'EXAM', 'OTHER'];
export const TOPIC_STATUSES: TopicStatus[] = ['PLANNED', 'IN_PROGRESS', 'COMPLETED'];

export interface CalendarEventDto { id: string; title: string; type: EventType; startDate: string; endDate: string; description: string | null }
export interface TopicDto { id: string; title: string; description: string | null; sortOrder: number; status: TopicStatus; completedAt: string | null }
export interface Progress { total: number; completed: number; inProgress: number }
export interface SyllabusDto { session: { id: string; name: string }; classId: string; subject: { id: string; name: string }; topics: TopicDto[]; progress: Progress }
export interface SummaryDto { session: { id: string; name: string }; classId: string; subjects: { subject: { id: string; name: string }; progress: Progress }[] }

// Keys start with 'academics' so any academic change (a subject removed from a class, a new session...) refreshes these too.
export const useCalendarEvents = (from: string, to: string) =>
  useQuery({ queryKey: ['academics', 'calendar', from, to], queryFn: async () => (await apiFetch<{ events: CalendarEventDto[] }>(`/calendar/events?from=${from}&to=${to}`)).events });
export const useSyllabus = (classId: string | undefined, subjectId: string | undefined) =>
  useQuery({ queryKey: ['academics', 'syllabus', classId, subjectId], enabled: Boolean(classId && subjectId), queryFn: () => apiFetch<SyllabusDto>(`/syllabus/topics?classId=${classId}&subjectId=${subjectId}`) });
export const useSyllabusSummary = (classId: string | undefined) =>
  useQuery({ queryKey: ['academics', 'syllabus-summary', classId], enabled: Boolean(classId), queryFn: () => apiFetch<SummaryDto>(`/syllabus/summary?classId=${classId}`) });

function useRefreshing<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['academics'] }) });
}

export interface EventBody { title: string; type: EventType; startDate: string; endDate?: string; description?: string | null }
export const useEventActions = () => ({
  create: useRefreshing((v: EventBody) => apiFetch<{ event: CalendarEventDto }>('/calendar/events', { method: 'POST', body: v })),
  update: useRefreshing((v: Partial<EventBody> & { id: string }) => { const { id, ...body } = v; return apiFetch<{ event: CalendarEventDto }>(`/calendar/events/${id}`, { method: 'PATCH', body }); }),
  remove: useRefreshing((id: string) => apiFetch<void>(`/calendar/events/${id}`, { method: 'DELETE' })),
});
export const useTopicActions = () => ({
  create: useRefreshing((v: { classId: string; subjectId: string; title: string; description?: string | null }) => apiFetch<{ topic: TopicDto }>('/syllabus/topics', { method: 'POST', body: v })),
  update: useRefreshing((v: { id: string; title?: string; description?: string | null }) => { const { id, ...body } = v; return apiFetch<{ topic: TopicDto }>(`/syllabus/topics/${id}`, { method: 'PATCH', body }); }),
  setStatus: useRefreshing((v: { id: string; status: TopicStatus }) => apiFetch<{ topic: TopicDto }>(`/syllabus/topics/${v.id}/status`, { method: 'POST', body: { status: v.status } })),
  move: useRefreshing((v: { id: string; direction: 'up' | 'down' }) => apiFetch<{ topics: TopicDto[] }>(`/syllabus/topics/${v.id}/move`, { method: 'POST', body: { direction: v.direction } })),
  remove: useRefreshing((id: string) => apiFetch<void>(`/syllabus/topics/${id}`, { method: 'DELETE' })),
});
