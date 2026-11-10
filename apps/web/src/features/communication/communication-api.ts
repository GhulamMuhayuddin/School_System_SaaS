import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

export type Audience = 'ALL' | 'STAFF' | 'PARENTS' | 'STUDENTS' | 'CLASS';
export const AUDIENCES: Audience[] = ['ALL', 'STAFF', 'PARENTS', 'STUDENTS', 'CLASS'];
export type Priority = 'NORMAL' | 'IMPORTANT';
export type NoticeStatus = 'LIVE' | 'EXPIRED' | 'WITHDRAWN';
export interface Announcement {
  id: string; title: string; body: string; audience: Audience; className: string | null; priority: Priority;
  publishedAt: string; expiresOn: string | null; author: string | null; read: boolean;
}
export interface SentAnnouncement extends Omit<Announcement, 'read'> { status: NoticeStatus; readCount: number }
export interface AnnouncementValues { title: string; body: string; audience: Audience; classId: string | null; priority: Priority; expiresOn: string | null }

export const statusTone = (s: NoticeStatus): 'success' | 'neutral' | 'danger' => (s === 'LIVE' ? 'success' : s === 'EXPIRED' ? 'neutral' : 'danger');
/** The form is complete: a title and message, and a class when the audience is a class (and no class otherwise). */
export function formValid(v: { title: string; body: string; audience: Audience; classId: string }): boolean {
  if (v.title.trim().length < 3 || v.body.trim().length < 3) return false;
  return v.audience === 'CLASS' ? v.classId !== '' : true;
}

export const useInbox = (unreadOnly: boolean) =>
  useQuery({ queryKey: ['communication', 'inbox', unreadOnly], queryFn: () => apiFetch<{ announcements: Announcement[]; unread: number }>(`/communication/announcements${unreadOnly ? '?unreadOnly=true' : ''}`) });
export const useSent = (enabled: boolean) =>
  useQuery({ queryKey: ['communication', 'sent'], enabled, queryFn: () => apiFetch<{ announcements: SentAnnouncement[]; truncated: boolean }>('/communication/sent') });

function useCommMutation<V, R>(fn: (v: V) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({ mutationFn: fn, onSuccess: () => qc.invalidateQueries({ queryKey: ['communication'] }) });
}
export const useMarkRead = () => useCommMutation((id: string) => apiFetch<void>(`/communication/announcements/${id}/read`, { method: 'POST' }));
export const useMarkAllRead = () => useCommMutation(() => apiFetch<{ marked: number }>('/communication/announcements/read-all', { method: 'POST' }));
export const useSend = () => useCommMutation((v: AnnouncementValues) => apiFetch<SentAnnouncement>('/communication/announcements', { method: 'POST', body: v }));
export const useWithdraw = () => useCommMutation((id: string) => apiFetch<SentAnnouncement>(`/communication/announcements/${id}/withdraw`, { method: 'POST' }));
