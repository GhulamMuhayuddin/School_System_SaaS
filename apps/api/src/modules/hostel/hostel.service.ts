import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { bedState, canMoveIn, firstMisfit, genderAllowed, normalRoomNo, roomIncome, type GenderValue, type HostelKindValue } from './hostel.logic';
import type {
  AllocationDto, HostelApi, HostelDto, HostelInput, HostelPatch, HostelSummary, ResidentDto, ResidentFilter, RoomDto, RoomFilter, RoomInput, RoomPatch, StudentHostel,
} from './hostel.types';

type Tx = Prisma.TransactionClient;
const RESIDENT_LIMIT = 500;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;
const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

const roomInclude = { hostel: { select: { id: true, name: true, kind: true } }, _count: { select: { allocations: true } } } as const;
type RoomRow = Prisma.HostelRoomGetPayload<{ include: typeof roomInclude }>;
const hostelInclude = { rooms: { select: { beds: true, monthlyFee: true, active: true, _count: { select: { allocations: true } } } } } as const;
type HostelRow = Prisma.HostelGetPayload<{ include: typeof hostelInclude }>;

/** Hostels, rooms with beds and who lives where. Every query runs under Row Level Security. */
export class HostelService implements HostelApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'hostel', entityId, metadata } });
  }

  private roomDto(r: RoomRow): RoomDto {
    const residents = r._count.allocations;
    return {
      id: r.id, hostelId: r.hostelId, hostelName: r.hostel.name, hostelKind: r.hostel.kind as HostelKindValue, roomNo: r.roomNo, floor: r.floor, beds: r.beds, monthlyFee: r.monthlyFee,
      notes: r.notes, active: r.active, residents, bedState: bedState(r.beds, residents), income: roomIncome(r.monthlyFee, residents),
    };
  }

  private hostelDto(h: HostelRow): HostelDto {
    const rooms = h.rooms.filter((r) => r.active);
    return {
      id: h.id, name: h.name, kind: h.kind as HostelKindValue, wardenName: h.wardenName, wardenPhone: h.wardenPhone, notes: h.notes, active: h.active,
      rooms: rooms.length, beds: rooms.reduce((n, r) => n + r.beds, 0), residents: h.rooms.reduce((n, r) => n + r._count.allocations, 0),
      income: h.rooms.reduce((n, r) => n + roomIncome(r.monthlyFee, r._count.allocations), 0),
    };
  }

  private async hostelById(tx: Tx, schoolId: string, id: string): Promise<HostelDto> {
    const h = await tx.hostel.findFirst({ where: { id, schoolId }, include: hostelInclude });
    if (!h) throw notFound('Hostel not found');
    return this.hostelDto(h);
  }

  private async roomById(tx: Tx, schoolId: string, id: string): Promise<RoomDto> {
    const r = await tx.hostelRoom.findFirst({ where: { id, schoolId }, include: roomInclude });
    if (!r) throw notFound('Room not found');
    return this.roomDto(r);
  }

  private lockRoom(tx: Tx, id: string): Promise<unknown> {
    return tx.$queryRaw`SELECT id FROM hostel_rooms WHERE id = ${id}::uuid FOR UPDATE`;
  }

  // ---- summary ---------------------------------------------------------------------------------------------------------
  summary(schoolId: string): Promise<HostelSummary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const hostels = await tx.hostel.findMany({ where: { schoolId, active: true }, include: hostelInclude });
      const rooms = hostels.flatMap((h) => h.rooms.filter((r) => r.active));
      const beds = rooms.reduce((n, r) => n + r.beds, 0);
      const residents = await tx.hostelAllocation.count({ where: { schoolId } });
      return {
        hostels: hostels.length, rooms: rooms.length, beds, residents, freeBeds: Math.max(0, beds - residents),
        monthlyIncome: rooms.reduce((n, r) => n + roomIncome(r.monthlyFee, r._count.allocations), 0),
        overCapacity: rooms.filter((r) => r._count.allocations > r.beds).length,
      };
    });
  }

  // ---- hostels ---------------------------------------------------------------------------------------------------------
  listHostels(schoolId: string, includeInactive: boolean): Promise<HostelDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.hostel.findMany({ where: { schoolId, ...(includeInactive ? {} : { active: true }) }, include: hostelInclude, orderBy: { name: 'asc' } });
      return rows.map((h) => this.hostelDto(h));
    });
  }

  createHostel(schoolId: string, actorId: string, input: HostelInput): Promise<HostelDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const name = input.name.trim();
      if (await tx.hostel.findFirst({ where: { schoolId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw conflict('A hostel with this name already exists');
      const h = await tx.hostel.create({ data: { schoolId, name, kind: input.kind, wardenName: blank(input.wardenName), wardenPhone: blank(input.wardenPhone), notes: blank(input.notes) } });
      await this.audit(tx, schoolId, actorId, 'hostel.create', h.id, { name, kind: input.kind });
      return this.hostelById(tx, schoolId, h.id);
    });
  }

  updateHostel(schoolId: string, actorId: string, id: string, patch: HostelPatch): Promise<HostelDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const cur = await tx.hostel.findFirst({ where: { id, schoolId }, select: { id: true, kind: true } });
      if (!cur) throw notFound('Hostel not found');
      const data: Prisma.HostelUpdateInput = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (await tx.hostel.findFirst({ where: { schoolId, id: { not: id }, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw conflict('A hostel with this name already exists');
        data.name = name;
      }
      if (patch.kind !== undefined && patch.kind !== cur.kind) {
        const living = await tx.hostelAllocation.findMany({ where: { schoolId, room: { hostelId: id } }, select: { student: { select: { gender: true } } } });
        if (firstMisfit(patch.kind, living.map((a) => a.student.gender as GenderValue)) !== null) throw conflict('Students of the other gender live here. Move them first.', { code: 'KIND_CONFLICT' });
        data.kind = patch.kind;
      }
      if (patch.wardenName !== undefined) data.wardenName = blank(patch.wardenName);
      if (patch.wardenPhone !== undefined) data.wardenPhone = blank(patch.wardenPhone);
      if (patch.notes !== undefined) data.notes = blank(patch.notes);
      if (patch.active === false && (await tx.hostelAllocation.count({ where: { schoolId, room: { hostelId: id } } })) > 0) throw conflict('Move or remove the students in this hostel before deactivating it');
      if (patch.active !== undefined) data.active = patch.active;
      await tx.hostel.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'hostel.update', id, Object.keys(data) as Prisma.InputJsonValue);
      return this.hostelById(tx, schoolId, id);
    });
  }

  // ---- rooms -----------------------------------------------------------------------------------------------------------
  listRooms(schoolId: string, f: RoomFilter): Promise<RoomDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.hostelRoom.findMany({
        where: { schoolId, ...(f.hostelId ? { hostelId: f.hostelId } : {}), ...(f.includeInactive ? {} : { active: true, hostel: { active: true } }) },
        include: roomInclude, orderBy: [{ hostel: { name: 'asc' } }, { roomNo: 'asc' }],
      });
      return rows.map((r) => this.roomDto(r));
    });
  }

  createRoom(schoolId: string, actorId: string, input: RoomInput): Promise<RoomDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const hostel = await tx.hostel.findFirst({ where: { id: input.hostelId, schoolId }, select: { id: true, active: true } });
      if (!hostel) throw badRequest('Hostel not found');
      if (!hostel.active) throw badRequest('This hostel is not active');
      const roomNo = normalRoomNo(input.roomNo);
      if (await tx.hostelRoom.findFirst({ where: { schoolId, hostelId: hostel.id, roomNo: { equals: roomNo, mode: 'insensitive' } }, select: { id: true } })) throw conflict('This hostel already has a room with this number');
      const r = await tx.hostelRoom.create({ data: { schoolId, hostelId: hostel.id, roomNo, floor: input.floor ?? null, beds: input.beds, monthlyFee: input.monthlyFee ?? 0, notes: blank(input.notes) } });
      await this.audit(tx, schoolId, actorId, 'hostel.room.create', r.id, { roomNo, beds: input.beds });
      return this.roomById(tx, schoolId, r.id);
    });
  }

  updateRoom(schoolId: string, actorId: string, id: string, patch: RoomPatch): Promise<RoomDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockRoom(tx, id);
      const cur = await tx.hostelRoom.findFirst({ where: { id, schoolId }, select: { id: true, hostelId: true, _count: { select: { allocations: true } } } });
      if (!cur) throw notFound('Room not found');
      const residents = cur._count.allocations;
      const data: Prisma.HostelRoomUncheckedUpdateInput = {};
      if (patch.roomNo !== undefined) {
        const roomNo = normalRoomNo(patch.roomNo);
        if (await tx.hostelRoom.findFirst({ where: { schoolId, hostelId: cur.hostelId, id: { not: id }, roomNo: { equals: roomNo, mode: 'insensitive' } }, select: { id: true } })) throw conflict('This hostel already has a room with this number');
        data.roomNo = roomNo;
      }
      if (patch.floor !== undefined) data.floor = patch.floor;
      if (patch.beds !== undefined) {
        if (patch.beds < residents) throw conflict(`${residents} students live in this room, so it needs at least ${residents} beds`, { code: 'CAPACITY' });
        data.beds = patch.beds;
      }
      if (patch.monthlyFee !== undefined) data.monthlyFee = patch.monthlyFee;
      if (patch.notes !== undefined) data.notes = blank(patch.notes);
      if (patch.active === false && residents > 0) throw conflict('Move or remove the students in this room before deactivating it');
      if (patch.active !== undefined) data.active = patch.active;
      await tx.hostelRoom.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'hostel.room.update', id, Object.keys(data) as Prisma.InputJsonValue);
      return this.roomById(tx, schoolId, id);
    });
  }

  // ---- residents -------------------------------------------------------------------------------------------------------
  listResidents(schoolId: string, f: ResidentFilter): Promise<{ residents: ResidentDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.hostelAllocation.findMany({
        where: {
          schoolId, ...(f.roomId ? { roomId: f.roomId } : {}), ...(f.hostelId ? { room: { hostelId: f.hostelId } } : {}),
          ...(f.q ? { student: { OR: [{ admissionNo: { contains: f.q, mode: 'insensitive' as const } }, { firstName: { contains: f.q, mode: 'insensitive' as const } }, { lastName: { contains: f.q, mode: 'insensitive' as const } }] } } : {}),
        },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, class: { select: { name: true } } } }, room: { select: { id: true, roomNo: true, hostel: { select: { id: true, name: true } } } } },
        orderBy: [{ room: { hostel: { name: 'asc' } } }, { room: { roomNo: 'asc' } }, { student: { admissionNo: 'asc' } }], take: RESIDENT_LIMIT + 1,
      });
      return {
        truncated: rows.length > RESIDENT_LIMIT,
        residents: rows.slice(0, RESIDENT_LIMIT).map((a) => ({
          student: { id: a.student.id, name: fullName(a.student), admissionNo: a.student.admissionNo, className: a.student.class?.name ?? null },
          hostel: a.room.hostel, room: { id: a.room.id, roomNo: a.room.roomNo }, assignedOn: dayText(a.assignedOn),
        })),
      };
    });
  }

  private async allocationOf(tx: Tx, schoolId: string, studentId: string): Promise<AllocationDto | null> {
    const a = await tx.hostelAllocation.findFirst({
      where: { schoolId, studentId },
      include: { room: { select: { id: true, roomNo: true, floor: true, monthlyFee: true, hostel: { select: { id: true, name: true, kind: true, wardenName: true, wardenPhone: true } } } } },
    });
    if (!a) return null;
    const { hostel, ...room } = a.room;
    return { hostel: { ...hostel, kind: hostel.kind as HostelKindValue }, room, assignedOn: dayText(a.assignedOn) };
  }

  assign(schoolId: string, actorId: string, studentId: string, roomId: string): Promise<AllocationDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true, status: true, gender: true } });
      if (!student) throw notFound('Student not found');
      if (student.status !== 'ACTIVE') throw badRequest('Only active students can live in the hostel');
      await this.lockRoom(tx, roomId);
      const room = await tx.hostelRoom.findFirst({ where: { id: roomId, schoolId }, select: { id: true, beds: true, active: true, hostel: { select: { kind: true, active: true } } } });
      if (!room) throw notFound('Room not found');
      if (!room.active || !room.hostel.active) throw badRequest('This room is not active');
      if (!genderAllowed(room.hostel.kind as HostelKindValue, student.gender as GenderValue)) throw conflict('This hostel is not for students of this gender', { code: 'GENDER_MISMATCH' });
      const current = await tx.hostelAllocation.findFirst({ where: { schoolId, studentId }, select: { roomId: true } });
      const residents = await tx.hostelAllocation.count({ where: { schoolId, roomId } });
      if (!canMoveIn(room.beds, residents, current?.roomId === roomId)) throw conflict('This room is full', { code: 'ROOM_FULL' });
      await tx.hostelAllocation.upsert({
        where: { schoolId_studentId: { schoolId, studentId } }, update: { roomId, assignedById: actorId },
        create: { schoolId, studentId, roomId, assignedOn: toDate(dayText(this.now())), assignedById: actorId },
      });
      await this.audit(tx, schoolId, actorId, 'hostel.assign', studentId, { roomId });
      return (await this.allocationOf(tx, schoolId, studentId))!;
    });
  }

  unassign(schoolId: string, actorId: string, studentId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const r = await tx.hostelAllocation.deleteMany({ where: { schoolId, studentId } });
      if (r.count === 0) throw notFound('This student does not live in the hostel');
      await this.audit(tx, schoolId, actorId, 'hostel.unassign', studentId);
    });
  }

  studentHostel(schoolId: string, studentId: string): Promise<StudentHostel> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!(await tx.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } }))) throw notFound('Student not found');
      return { allocation: await this.allocationOf(tx, schoolId, studentId) };
    });
  }
}
