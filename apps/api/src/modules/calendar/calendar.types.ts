export type CalendarEventType = 'HOLIDAY' | 'EVENT' | 'EXAM' | 'OTHER';

export interface CalendarEventDto {
  id: string;
  title: string;
  type: CalendarEventType;
  startDate: string; // YYYY-MM-DD, inclusive
  endDate: string; // YYYY-MM-DD, inclusive (same as startDate for a one-day event)
  description: string | null;
}

export interface EventInput { title: string; type: CalendarEventType; startDate: string; endDate?: string; description?: string | null }
export interface DateRange { from: string; to: string }

/** Every method receives the schoolId from the verified token (never from the request). */
export interface CalendarApi {
  list(schoolId: string, range: DateRange): Promise<CalendarEventDto[]>;
  create(schoolId: string, input: EventInput, actorId: string): Promise<CalendarEventDto>;
  update(schoolId: string, id: string, input: Partial<EventInput>, actorId: string): Promise<CalendarEventDto>;
  remove(schoolId: string, id: string, actorId: string): Promise<void>;
}
