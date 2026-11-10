import { z } from 'zod';
import { MAX_STOPS, MAX_VEHICLE_CAPACITY, firstOutOfOrder, validTime } from './transport.logic';

const uuid = z.string().uuid();
const text = (max: number) => z.string().trim().max(max).transform((v) => (v === '' ? null : v)).nullable().optional();
const time = z.string().trim().refine(validTime, 'Use HH:MM (24 hour)').nullable().optional();
const fee = z.number().int().min(0).max(1_000_000);
const phone = z.string().trim().max(30).regex(/^[0-9+\-\s()]*$/, 'Digits, spaces, + and - only').transform((v) => (v === '' ? null : v)).nullable().optional();

export const idParam = z.object({ id: uuid });
export const studentParam = z.object({ studentId: uuid });
export const includeInactiveQuery = z.object({ includeInactive: z.enum(['true', 'false']).optional() });
export const riderQuery = z.object({ routeId: uuid.optional(), q: z.string().trim().max(60).optional() });

const stop = z.object({ id: uuid.optional(), name: z.string().trim().min(1).max(80), pickupTime: time });
const stops = z.array(stop).max(MAX_STOPS).refine((l) => firstOutOfOrder(l.map((s) => s.pickupTime ?? null)) === null, 'Pickup times must not go backwards along the route');

export const vehicleBody = z.object({
  registrationNo: z.string().trim().min(2).max(20), kind: z.string().trim().min(2).max(30).optional(),
  capacity: z.number().int().min(1).max(MAX_VEHICLE_CAPACITY), driverName: text(80), driverPhone: phone, notes: text(300),
});
export const vehiclePatch = vehicleBody.partial().extend({ active: z.boolean().optional() }).refine((v) => Object.keys(v).length > 0, 'Nothing to change');

export const routeBody = z.object({ name: z.string().trim().min(2).max(80), monthlyFee: fee.optional(), vehicleId: uuid.nullable().optional(), notes: text(300), stops: stops.optional() });
export const routePatch = z.object({ name: z.string().trim().min(2).max(80).optional(), monthlyFee: fee.optional(), vehicleId: uuid.nullable().optional(), notes: text(300), active: z.boolean().optional() })
  .refine((v) => Object.keys(v).length > 0, 'Nothing to change');
export const stopsBody = z.object({ stops });
export const assignBody = z.object({ routeId: uuid, stopId: uuid });
