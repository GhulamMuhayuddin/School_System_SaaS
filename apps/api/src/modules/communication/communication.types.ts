import type { Audience, NoticeStatus } from './communication.logic';

export type { Audience, NoticeStatus };
export type Priority = 'NORMAL' | 'IMPORTANT';
export interface AnnouncementDto {
  id: string; title: string; body: string; audience: Audience; className: string | null; priority: Priority;
  publishedAt: string; expiresOn: string | null; author: string | null; read: boolean;
}
export interface SentDto extends Omit<AnnouncementDto, 'read'> { status: NoticeStatus; readCount: number }
export interface AnnouncementInput { title: string; body: string; audience: Audience; classId?: string | null; priority?: Priority; expiresOn?: string | null }

/** Every method receives the schoolId from the verified token (never from the request); `userId` is the signed-in user. */
export interface CommunicationApi {
  inbox(schoolId: string, userId: string, unreadOnly: boolean): Promise<{ announcements: AnnouncementDto[]; unread: number }>;
  unreadCount(schoolId: string, userId: string): Promise<number>;
  markRead(schoolId: string, userId: string, id: string): Promise<void>;
  markAllRead(schoolId: string, userId: string): Promise<number>;
  create(schoolId: string, actorId: string, input: AnnouncementInput): Promise<SentDto>;
  listSent(schoolId: string): Promise<{ announcements: SentDto[]; truncated: boolean }>;
  withdraw(schoolId: string, actorId: string, id: string): Promise<SentDto>;
}
