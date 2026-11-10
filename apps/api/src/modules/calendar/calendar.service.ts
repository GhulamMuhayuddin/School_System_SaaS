import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, notFound } from '../../utils/errors';
import type { CalendarApi, CalendarEventDto, DateRange, EventInput } from './calendar.types';

type Tx = Prisma.TransactionClient;
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const dto = (e: { id: string; title: string; type: CalendarEventDto['type']; startDate: Date; endDate: Date; description: string | null }): CalendarEventDto => ({
  id: e.id, title: e.title, type: e.type, startDate: dayText(e.startDate), endDate: dayText(e.endDate), description: e.description,
});

/** Academic calendar: holidays, exam periods and events. Every query runs under Row Level Security. */
export class CalendarService implements CalendarApi {
  constructor(private readonly prisma: PrismaClient) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'calendar', entityId, metadata } });
  }

  /** Events that touch the range at all (a holiday that starts before it and ends inside it is included). */
  list(schoolId: string, range: DateRange): Promise<CalendarEventDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.calendarEvent.findMany({
        where: { schoolId, startDate: { lte: toDate(range.to) }, endDate: { gte: toDate(range.from) } },
        orderBy: [{ startDate: 'asc' }, { title: 'asc' }],
      });
      return rows.map(dto);
    });
  }

  create(schoolId: string, input: EventInput, actorId: string): Promise<CalendarEventDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const created = await tx.calendarEvent.create({
        data: { schoolId, title: input.title, type: input.type, startDate: toDate(input.startDate), endDate: toDate(input.endDate ?? input.startDate), description: input.description ?? null },
      });
      await this.audit(tx, schoolId, actorId, 'calendar.event.create', created.id, { title: created.title, type: created.type });
      return dto(created);
    });
  }

  update(schoolId: string, id: string, input: Partial<EventInput>, actorId: string): Promise<CalendarEventDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const current = await tx.calendarEvent.findFirst({ where: { id, schoolId } });
      if (!current) throw notFound('Event not found');
      const start = input.startDate ?? dayText(current.startDate);
      const end = input.endDate ?? dayText(current.endDate);
      if (end < start) throw badRequest('The end date must not be before the start date');
      const updated = await tx.calendarEvent.update({
        where: { id },
        data: {
          ...(input.title ? { title: input.title } : {}),
          ...(input.type ? { type: input.type } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          startDate: toDate(start),
          endDate: toDate(end),
        },
      });
      await this.audit(tx, schoolId, actorId, 'calendar.event.update', id, { fields: Object.keys(input) });
      return dto(updated);
    });
  }

  remove(schoolId: string, id: string, actorId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const current = await tx.calendarEvent.findFirst({ where: { id, schoolId } });
      if (!current) throw notFound('Event not found');
      await tx.calendarEvent.delete({ where: { id } });
      await this.audit(tx, schoolId, actorId, 'calendar.event.delete', id, { title: current.title });
    });
  }
}
