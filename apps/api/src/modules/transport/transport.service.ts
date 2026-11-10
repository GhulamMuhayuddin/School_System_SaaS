import type { Prisma, PrismaClient } from '@prisma/client';
import { tenantTransaction } from '../../db/tenant';
import { badRequest, conflict, notFound } from '../../utils/errors';
import { canBoard, routeIncome, seatState } from './transport.logic';
import type {
  AssignmentDto, RiderDto, RiderFilter, RouteDto, RouteInput, RoutePatch, StopInput, StudentTransport, TransportApi, TransportSummary, VehicleDto, VehicleInput, VehiclePatch,
} from './transport.types';

type Tx = Prisma.TransactionClient;
const RIDER_LIMIT = 500;
const dayText = (d: Date): string => d.toISOString().slice(0, 10);
const toDate = (s: string): Date => new Date(`${s}T00:00:00Z`);
const fullName = (p: { firstName: string; lastName: string }): string => `${p.firstName} ${p.lastName}`;
const blank = (v: string | null | undefined): string | null => (v === undefined || v === null || v.trim() === '' ? null : v.trim());

const routeInclude = {
  vehicle: { select: { id: true, registrationNo: true, capacity: true, driverName: true, driverPhone: true } },
  stops: { orderBy: { sequence: 'asc' as const } },
  assignments: { select: { stopId: true } },
} as const;
type RouteRow = Prisma.TransportRouteGetPayload<{ include: typeof routeInclude }>;

const vehicleInclude = { routes: { select: { id: true, name: true, _count: { select: { assignments: true } } }, orderBy: { name: 'asc' as const } } } as const;
type VehicleRow = Prisma.TransportVehicleGetPayload<{ include: typeof vehicleInclude }>;

/** Transport routes, stops, vehicles and who rides where. Every query runs under Row Level Security. */
export class TransportService implements TransportApi {
  constructor(private readonly prisma: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  private audit(tx: Tx, schoolId: string, actorId: string, action: string, entityId: string | null, metadata?: Prisma.InputJsonValue) {
    return tx.auditLog.create({ data: { schoolId, userId: actorId, action, entity: 'transport', entityId, metadata } });
  }

  private routeDto(r: RouteRow): RouteDto {
    const riders = r.assignments.length;
    const perStop = new Map<string, number>();
    for (const a of r.assignments) perStop.set(a.stopId, (perStop.get(a.stopId) ?? 0) + 1);
    return {
      id: r.id, name: r.name, monthlyFee: r.monthlyFee, notes: r.notes, active: r.active, riders, seat: seatState(r.vehicle?.capacity ?? null, riders), income: routeIncome(r.monthlyFee, riders),
      vehicle: r.vehicle, stops: r.stops.map((s) => ({ id: s.id, name: s.name, sequence: s.sequence, pickupTime: s.pickupTime, riders: perStop.get(s.id) ?? 0 })),
    };
  }

  private vehicleDto(v: VehicleRow): VehicleDto {
    return {
      id: v.id, registrationNo: v.registrationNo, kind: v.kind, capacity: v.capacity, driverName: v.driverName, driverPhone: v.driverPhone, notes: v.notes, active: v.active,
      routes: v.routes.map((r) => ({ id: r.id, name: r.name })), riders: v.routes.reduce((n, r) => n + r._count.assignments, 0),
    };
  }

  private async routeById(tx: Tx, schoolId: string, id: string): Promise<RouteDto> {
    const r = await tx.transportRoute.findFirst({ where: { id, schoolId }, include: routeInclude });
    if (!r) throw notFound('Route not found');
    return this.routeDto(r);
  }

  private async vehicleById(tx: Tx, schoolId: string, id: string): Promise<VehicleDto> {
    const v = await tx.transportVehicle.findFirst({ where: { id, schoolId }, include: vehicleInclude });
    if (!v) throw notFound('Vehicle not found');
    return this.vehicleDto(v);
  }

  /** The vehicle must exist, be active, and have a seat for everyone already riding the route. */
  private async checkVehicle(tx: Tx, schoolId: string, vehicleId: string, routeId: string | null): Promise<void> {
    const v = await tx.transportVehicle.findFirst({ where: { id: vehicleId, schoolId }, select: { active: true, capacity: true } });
    if (!v) throw badRequest('Vehicle not found');
    if (!v.active) throw badRequest('This vehicle is not active');
    if (routeId) {
      const riders = await tx.transportAssignment.count({ where: { schoolId, routeId } });
      if (riders > v.capacity) throw conflict(`This vehicle has ${v.capacity} seats but the route already has ${riders} students`, { code: 'CAPACITY' });
    }
  }

  private lockRoute(tx: Tx, id: string): Promise<unknown> {
    return tx.$queryRaw`SELECT id FROM transport_routes WHERE id = ${id}::uuid FOR UPDATE`;
  }

  // ---- summary ---------------------------------------------------------------------------------------------------------
  summary(schoolId: string): Promise<TransportSummary> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const routes = await tx.transportRoute.findMany({ where: { schoolId, active: true }, include: routeInclude });
      const vehicles = await tx.transportVehicle.count({ where: { schoolId, active: true } });
      const dtos = routes.map((r) => this.routeDto(r));
      const riders = await tx.transportAssignment.count({ where: { schoolId } });
      return {
        routes: dtos.length, vehicles, riders, monthlyIncome: dtos.reduce((n, r) => n + r.income, 0),
        routesWithoutVehicle: dtos.filter((r) => r.seat === 'NO_VEHICLE').length, overCapacity: dtos.filter((r) => r.seat === 'OVER').length,
      };
    });
  }

  // ---- vehicles --------------------------------------------------------------------------------------------------------
  listVehicles(schoolId: string): Promise<VehicleDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.transportVehicle.findMany({ where: { schoolId }, include: vehicleInclude, orderBy: [{ active: 'desc' }, { registrationNo: 'asc' }] });
      return rows.map((v) => this.vehicleDto(v));
    });
  }

  createVehicle(schoolId: string, actorId: string, input: VehicleInput): Promise<VehicleDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const registrationNo = input.registrationNo.trim().toUpperCase();
      if (await tx.transportVehicle.findFirst({ where: { schoolId, registrationNo: { equals: registrationNo, mode: 'insensitive' } }, select: { id: true } })) throw conflict('A vehicle with this registration number already exists');
      const v = await tx.transportVehicle.create({
        data: { schoolId, registrationNo, kind: input.kind?.trim() || 'Bus', capacity: input.capacity, driverName: blank(input.driverName), driverPhone: blank(input.driverPhone), notes: blank(input.notes) },
      });
      await this.audit(tx, schoolId, actorId, 'transport.vehicle.create', v.id, { registrationNo, capacity: input.capacity });
      return this.vehicleById(tx, schoolId, v.id);
    });
  }

  updateVehicle(schoolId: string, actorId: string, id: string, patch: VehiclePatch): Promise<VehicleDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const cur = await tx.transportVehicle.findFirst({ where: { id, schoolId }, include: vehicleInclude });
      if (!cur) throw notFound('Vehicle not found');
      const data: Prisma.TransportVehicleUpdateInput = {};
      if (patch.registrationNo !== undefined) {
        const registrationNo = patch.registrationNo.trim().toUpperCase();
        if (await tx.transportVehicle.findFirst({ where: { schoolId, id: { not: id }, registrationNo: { equals: registrationNo, mode: 'insensitive' } }, select: { id: true } })) throw conflict('A vehicle with this registration number already exists');
        data.registrationNo = registrationNo;
      }
      if (patch.kind !== undefined) data.kind = patch.kind.trim() || 'Bus';
      if (patch.capacity !== undefined) {
        const most = Math.max(0, ...cur.routes.map((r) => r._count.assignments));
        if (patch.capacity < most) throw conflict(`A route on this vehicle already carries ${most} students`, { code: 'CAPACITY' });
        data.capacity = patch.capacity;
      }
      if (patch.driverName !== undefined) data.driverName = blank(patch.driverName);
      if (patch.driverPhone !== undefined) data.driverPhone = blank(patch.driverPhone);
      if (patch.notes !== undefined) data.notes = blank(patch.notes);
      if (patch.active === false && cur.routes.length > 0) throw conflict('Take this vehicle off its routes before deactivating it');
      if (patch.active !== undefined) data.active = patch.active;
      await tx.transportVehicle.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'transport.vehicle.update', id, Object.keys(data) as Prisma.InputJsonValue);
      return this.vehicleById(tx, schoolId, id);
    });
  }

  // ---- routes and stops ------------------------------------------------------------------------------------------------
  listRoutes(schoolId: string, includeInactive: boolean): Promise<RouteDto[]> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.transportRoute.findMany({ where: { schoolId, ...(includeInactive ? {} : { active: true }) }, include: routeInclude, orderBy: { name: 'asc' } });
      return rows.map((r) => this.routeDto(r));
    });
  }

  getRoute(schoolId: string, id: string): Promise<RouteDto> {
    return tenantTransaction(this.prisma, schoolId, (tx) => this.routeById(tx, schoolId, id));
  }

  createRoute(schoolId: string, actorId: string, input: RouteInput): Promise<RouteDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const name = input.name.trim();
      if (await tx.transportRoute.findFirst({ where: { schoolId, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw conflict('A route with this name already exists');
      if (input.vehicleId) await this.checkVehicle(tx, schoolId, input.vehicleId, null);
      const r = await tx.transportRoute.create({ data: { schoolId, name, monthlyFee: input.monthlyFee ?? 0, vehicleId: input.vehicleId ?? null, notes: blank(input.notes) } });
      const stops = input.stops ?? [];
      if (stops.length) await tx.transportStop.createMany({ data: stops.map((s, i) => ({ schoolId, routeId: r.id, name: s.name.trim(), sequence: i + 1, pickupTime: s.pickupTime ?? null })) });
      await this.audit(tx, schoolId, actorId, 'transport.route.create', r.id, { name, stops: stops.length });
      return this.routeById(tx, schoolId, r.id);
    });
  }

  updateRoute(schoolId: string, actorId: string, id: string, patch: RoutePatch): Promise<RouteDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockRoute(tx, id);
      const cur = await tx.transportRoute.findFirst({ where: { id, schoolId }, select: { id: true } });
      if (!cur) throw notFound('Route not found');
      const data: Prisma.TransportRouteUncheckedUpdateInput = {};
      if (patch.name !== undefined) {
        const name = patch.name.trim();
        if (await tx.transportRoute.findFirst({ where: { schoolId, id: { not: id }, name: { equals: name, mode: 'insensitive' } }, select: { id: true } })) throw conflict('A route with this name already exists');
        data.name = name;
      }
      if (patch.monthlyFee !== undefined) data.monthlyFee = patch.monthlyFee;
      if (patch.notes !== undefined) data.notes = blank(patch.notes);
      if (patch.vehicleId !== undefined) {
        if (patch.vehicleId) await this.checkVehicle(tx, schoolId, patch.vehicleId, id);
        data.vehicleId = patch.vehicleId;
      }
      if (patch.active === false && (await tx.transportAssignment.count({ where: { schoolId, routeId: id } })) > 0) throw conflict('Move or remove the students on this route before deactivating it');
      if (patch.active !== undefined) data.active = patch.active;
      await tx.transportRoute.update({ where: { id }, data });
      await this.audit(tx, schoolId, actorId, 'transport.route.update', id, Object.keys(data) as Prisma.InputJsonValue);
      return this.routeById(tx, schoolId, id);
    });
  }

  setStops(schoolId: string, actorId: string, id: string, stops: StopInput[]): Promise<RouteDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      await this.lockRoute(tx, id);
      if (!(await tx.transportRoute.findFirst({ where: { id, schoolId }, select: { id: true } }))) throw notFound('Route not found');
      const existing = await tx.transportStop.findMany({ where: { schoolId, routeId: id }, include: { _count: { select: { assignments: true } } } });
      const byId = new Map(existing.map((s) => [s.id, s]));
      const keep = new Set<string>();
      for (const s of stops) {
        if (!s.id) continue;
        if (!byId.has(s.id)) throw badRequest('A stop does not belong to this route');
        if (keep.has(s.id)) throw badRequest('A stop is listed twice');
        keep.add(s.id);
      }
      const dropped = existing.filter((s) => !keep.has(s.id));
      const busy = dropped.find((s) => s._count.assignments > 0);
      if (busy) throw conflict(`The stop "${busy.name}" has students. Move them to another stop first.`, { code: 'STOP_IN_USE' });
      if (dropped.length) await tx.transportStop.deleteMany({ where: { schoolId, routeId: id, id: { in: dropped.map((s) => s.id) } } });
      for (const [i, s] of stops.entries()) {
        if (s.id) await tx.transportStop.update({ where: { id: s.id }, data: { name: s.name.trim(), sequence: i + 1, pickupTime: s.pickupTime ?? null } });
        else await tx.transportStop.create({ data: { schoolId, routeId: id, name: s.name.trim(), sequence: i + 1, pickupTime: s.pickupTime ?? null } });
      }
      await this.audit(tx, schoolId, actorId, 'transport.route.stops', id, { stops: stops.length, removed: dropped.length });
      return this.routeById(tx, schoolId, id);
    });
  }

  // ---- riders ------------------------------------------------------------------------------------------------------------
  listRiders(schoolId: string, f: RiderFilter): Promise<{ riders: RiderDto[]; truncated: boolean }> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const rows = await tx.transportAssignment.findMany({
        where: {
          schoolId, ...(f.routeId ? { routeId: f.routeId } : {}),
          ...(f.q ? { student: { OR: [{ admissionNo: { contains: f.q, mode: 'insensitive' as const } }, { firstName: { contains: f.q, mode: 'insensitive' as const } }, { lastName: { contains: f.q, mode: 'insensitive' as const } }] } } : {}),
        },
        include: { student: { select: { id: true, firstName: true, lastName: true, admissionNo: true, class: { select: { name: true } } } }, route: { select: { id: true, name: true } }, stop: { select: { id: true, name: true, sequence: true } } },
        orderBy: [{ route: { name: 'asc' } }, { stop: { sequence: 'asc' } }], take: RIDER_LIMIT + 1,
      });
      return {
        truncated: rows.length > RIDER_LIMIT,
        riders: rows.slice(0, RIDER_LIMIT).map((a) => ({
          student: { id: a.student.id, name: fullName(a.student), admissionNo: a.student.admissionNo, className: a.student.class?.name ?? null },
          route: a.route, stop: { id: a.stop.id, name: a.stop.name }, assignedOn: dayText(a.assignedOn),
        })),
      };
    });
  }

  private async assignmentOf(tx: Tx, schoolId: string, studentId: string): Promise<AssignmentDto | null> {
    const a = await tx.transportAssignment.findFirst({
      where: { schoolId, studentId },
      include: { route: { select: { id: true, name: true, monthlyFee: true, vehicle: { select: { registrationNo: true, kind: true, driverName: true, driverPhone: true } } } }, stop: { select: { id: true, name: true, pickupTime: true } } },
    });
    return a ? { route: { id: a.route.id, name: a.route.name, monthlyFee: a.route.monthlyFee }, stop: a.stop, vehicle: a.route.vehicle, assignedOn: dayText(a.assignedOn) } : null;
  }

  assign(schoolId: string, actorId: string, studentId: string, routeId: string, stopId: string): Promise<AssignmentDto> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const student = await tx.student.findFirst({ where: { id: studentId, schoolId, deletedAt: null }, select: { id: true, status: true } });
      if (!student) throw notFound('Student not found');
      if (student.status !== 'ACTIVE') throw badRequest('Only active students can use transport');
      await this.lockRoute(tx, routeId);
      const route = await tx.transportRoute.findFirst({ where: { id: routeId, schoolId }, select: { id: true, active: true, vehicle: { select: { capacity: true } } } });
      if (!route) throw notFound('Route not found');
      if (!route.active) throw badRequest('This route is not active');
      if (!(await tx.transportStop.findFirst({ where: { id: stopId, schoolId, routeId }, select: { id: true } }))) throw badRequest('This stop is not on the chosen route');
      const current = await tx.transportAssignment.findFirst({ where: { schoolId, studentId }, select: { routeId: true } });
      const riders = await tx.transportAssignment.count({ where: { schoolId, routeId } });
      if (!canBoard(route.vehicle?.capacity ?? null, riders, current?.routeId === routeId)) throw conflict('This route is full', { code: 'ROUTE_FULL' });
      await tx.transportAssignment.upsert({
        where: { schoolId_studentId: { schoolId, studentId } }, update: { routeId, stopId, assignedById: actorId },
        create: { schoolId, studentId, routeId, stopId, assignedOn: toDate(dayText(this.now())), assignedById: actorId },
      });
      await this.audit(tx, schoolId, actorId, 'transport.assign', studentId, { routeId, stopId });
      return (await this.assignmentOf(tx, schoolId, studentId))!;
    });
  }

  unassign(schoolId: string, actorId: string, studentId: string): Promise<void> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      const r = await tx.transportAssignment.deleteMany({ where: { schoolId, studentId } });
      if (r.count === 0) throw notFound('This student is not on any route');
      await this.audit(tx, schoolId, actorId, 'transport.unassign', studentId);
    });
  }

  studentTransport(schoolId: string, studentId: string): Promise<StudentTransport> {
    return tenantTransaction(this.prisma, schoolId, async (tx) => {
      if (!(await tx.student.findFirst({ where: { id: studentId, schoolId }, select: { id: true } }))) throw notFound('Student not found');
      return { assignment: await this.assignmentOf(tx, schoolId, studentId) };
    });
  }
}
