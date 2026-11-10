import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { platformError } from '@/features/platform/common';
import { useStudents } from '@/features/students/students-api';
import {
  firstOutOfOrder, parseFee, useAssign, useCreateRoute, useCreateVehicle, useRoutes, useSetStops, useUpdateRoute, useUpdateVehicle, useVehicles, validTime,
  type Route, type StopValue, type Vehicle,
} from './transport-api';

interface StopRow { id?: string; name: string; time: string }

export function RouteFormModal({ route, onClose }: { route?: Route; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const vehicles = useVehicles();
  const create = useCreateRoute();
  const update = useUpdateRoute();
  const setStops = useSetStops();
  const [name, setName] = useState(route?.name ?? '');
  const [fee, setFee] = useState(route ? String(route.monthlyFee) : '');
  const [vehicleId, setVehicleId] = useState(route?.vehicle?.id ?? '');
  const [notes, setNotes] = useState(route?.notes ?? '');
  const [rows, setRows] = useState<StopRow[]>(route ? route.stops.map((s) => ({ id: s.id, name: s.name, time: s.pickupTime ?? '' })) : [{ name: '', time: '' }]);
  const monthly = parseFee(fee);
  const stops: StopValue[] = rows.map((r) => ({ ...(r.id ? { id: r.id } : {}), name: r.name.trim(), pickupTime: r.time.trim() || null }));
  const badTime = rows.some((r) => r.time.trim() !== '' && !validTime(r.time.trim()));
  const backwards = !badTime && firstOutOfOrder(stops.map((s) => s.pickupTime)) !== null;
  const valid = name.trim().length >= 2 && monthly !== null && stops.every((s) => s.name.length > 0) && !badTime && !backwards;
  const busy = create.isPending || update.isPending || setStops.isPending;
  const patchRow = (i: number, p: Partial<StopRow>) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...p } : r)));
  const move = (i: number, by: -1 | 1) => setRows((rs) => { const j = i + by; if (j < 0 || j >= rs.length) return rs; const c = [...rs]; [c[i], c[j]] = [c[j]!, c[i]!]; return c; });
  const submit = async () => {
    if (!valid || monthly === null) return;
    try {
      if (route) {
        await update.mutateAsync({ id: route.id, patch: { name: name.trim(), monthlyFee: monthly, vehicleId: vehicleId || null, notes: notes.trim() || null } });
        await setStops.mutateAsync({ id: route.id, stops });
      } else {
        await create.mutateAsync({ name: name.trim(), monthlyFee: monthly, vehicleId: vehicleId || null, notes: notes.trim() || null, stops });
      }
      toast.success(t('transport.routeSaved'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={route ? t('transport.editRoute') : t('transport.addRoute')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={busy} disabled={!valid}>{t('transport.save')}</Button></>}>
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="rt-name" label={t('transport.routeName')}><Input id="rt-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
          <Field id="rt-fee" label={t('transport.monthlyFee')} error={fee !== '' && monthly === null ? t('transport.feeInvalid') : undefined}>
            <Input id="rt-fee" inputMode="numeric" dir="ltr" value={fee} onChange={(e) => setFee(e.target.value)} />
          </Field>
        </div>
        <Field id="rt-vehicle" label={t('transport.vehicle')}>
          <Select id="rt-vehicle" value={vehicleId} onChange={(e) => setVehicleId(e.target.value)}>
            <option value="">{t('transport.noVehicle')}</option>
            {(vehicles.data ?? []).filter((v) => v.active || v.id === route?.vehicle?.id).map((v) => <option key={v.id} value={v.id}>{v.registrationNo} ({v.capacity})</option>)}
          </Select>
        </Field>
        <Field id="rt-notes" label={t('transport.notes')}><Input id="rt-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field>
        <div>
          <h3 className="mb-2 text-sm font-semibold text-navy-900">{t('transport.stops')}</h3>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="grid grid-cols-[1fr_6.5rem_auto] items-center gap-2">
                <Input aria-label={t('transport.stopName')} placeholder={t('transport.stopName')} value={r.name} maxLength={80} onChange={(e) => patchRow(i, { name: e.target.value })} />
                <Input aria-label={t('transport.pickupTime')} placeholder="07:15" dir="ltr" value={r.time} maxLength={5} onChange={(e) => patchRow(i, { time: e.target.value })} />
                <span className="flex gap-1">
                  <Button size="sm" variant="ghost" aria-label={t('transport.moveUp')} disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                  <Button size="sm" variant="ghost" aria-label={t('transport.moveDown')} disabled={i === rows.length - 1} onClick={() => move(i, 1)}>↓</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>{t('transport.remove')}</Button>
                </span>
              </div>
            ))}
          </div>
          {badTime ? <p className="mt-2 text-sm text-rose-700">{t('transport.timeInvalid')}</p> : null}
          {backwards ? <p className="mt-2 text-sm text-rose-700">{t('transport.timeBackwards')}</p> : null}
          <Button className="mt-2" size="sm" variant="secondary" disabled={rows.length >= 40} onClick={() => setRows((rs) => [...rs, { name: '', time: '' }])}>{t('transport.addStop')}</Button>
        </div>
      </div>
    </Modal>
  );
}

export function VehicleFormModal({ vehicle, onClose }: { vehicle?: Vehicle; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateVehicle();
  const update = useUpdateVehicle();
  const [reg, setReg] = useState(vehicle?.registrationNo ?? '');
  const [kind, setKind] = useState(vehicle?.kind ?? 'Bus');
  const [capacity, setCapacity] = useState(vehicle ? String(vehicle.capacity) : '');
  const [driver, setDriver] = useState(vehicle?.driverName ?? '');
  const [phone, setPhone] = useState(vehicle?.driverPhone ?? '');
  const seats = /^\d{1,3}$/.test(capacity.trim()) && Number(capacity) >= 1 && Number(capacity) <= 200 ? Number(capacity) : null;
  const phoneOk = /^[0-9+\-\s()]*$/.test(phone);
  const valid = reg.trim().length >= 2 && kind.trim().length >= 2 && seats !== null && phoneOk;
  const values = () => ({ registrationNo: reg.trim(), kind: kind.trim(), capacity: seats as number, driverName: driver.trim() || null, driverPhone: phone.trim() || null, notes: vehicle?.notes ?? null });
  const submit = async () => {
    if (!valid) return;
    try {
      if (vehicle) await update.mutateAsync({ id: vehicle.id, patch: values() }); else await create.mutateAsync(values());
      toast.success(t('transport.vehicleSaved'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={vehicle ? t('transport.editVehicle') : t('transport.addVehicle')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending || update.isPending} disabled={!valid}>{t('transport.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="vh-reg" label={t('transport.registration')}><Input id="vh-reg" dir="ltr" value={reg} maxLength={20} onChange={(e) => setReg(e.target.value)} /></Field>
        <Field id="vh-kind" label={t('transport.kind')}><Input id="vh-kind" value={kind} maxLength={30} onChange={(e) => setKind(e.target.value)} /></Field>
        <Field id="vh-cap" label={t('transport.seats')} error={capacity !== '' && seats === null ? t('transport.seatsInvalid') : undefined}><Input id="vh-cap" inputMode="numeric" dir="ltr" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></Field>
        <Field id="vh-driver" label={t('transport.driver')}><Input id="vh-driver" value={driver} maxLength={80} onChange={(e) => setDriver(e.target.value)} /></Field>
        <Field id="vh-phone" label={t('transport.driverPhone')} error={phoneOk ? undefined : t('transport.phoneInvalid')}><Input id="vh-phone" dir="ltr" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Put a student on a route and stop. The student is fixed (from the student page) or searched (from the Riders tab). */
export function AssignModal({ studentId, studentName, currentRouteId, onClose }: { studentId?: string; studentName?: string; currentRouteId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const routes = useRoutes();
  const assign = useAssign();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState('');
  const [routeId, setRouteId] = useState(currentRouteId ?? '');
  const [stopId, setStopId] = useState('');
  const students = useStudents({ q: !studentId && search.trim().length >= 2 ? search.trim() : undefined, status: 'ACTIVE' });
  const options = !studentId && search.trim().length >= 2 ? (students.data?.students ?? []).slice(0, 30) : [];
  const route = (routes.data ?? []).find((r) => r.id === routeId);
  const stop = route?.stops.some((s) => s.id === stopId) ? stopId : '';
  const who = studentId ?? picked;
  const submit = async () => {
    try {
      await assign.mutateAsync({ studentId: who, routeId, stopId: stop });
      toast.success(t('transport.assigned'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('transport.assign')} description={studentName}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={assign.isPending} disabled={!who || !routeId || !stop}>{t('transport.assign')}</Button></>}>
      <div className="space-y-4">
        {!studentId ? (
          <>
            <Field id="as-search" label={t('transport.findStudent')} hint={t('transport.findStudentHint')}><Input id="as-search" value={search} onChange={(e) => { setSearch(e.target.value); setPicked(''); }} /></Field>
            {options.length > 0 ? (
              <Field id="as-student" label={t('transport.student')}>
                <Select id="as-student" value={picked} onChange={(e) => setPicked(e.target.value)}>
                  <option value="">{t('transport.chooseStudent')}</option>
                  {options.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.admissionNo})</option>)}
                </Select>
              </Field>
            ) : null}
          </>
        ) : null}
        <Field id="as-route" label={t('transport.route')}>
          <Select id="as-route" value={routeId} onChange={(e) => { setRouteId(e.target.value); setStopId(''); }}>
            <option value="">{t('transport.chooseRoute')}</option>
            {(routes.data ?? []).map((r) => <option key={r.id} value={r.id}>{r.name}{r.seat === 'FULL' || r.seat === 'OVER' ? ` (${t('transport.seat.FULL')})` : ''}</option>)}
          </Select>
        </Field>
        <Field id="as-stop" label={t('transport.stop')}>
          <Select id="as-stop" value={stop} disabled={!route} onChange={(e) => setStopId(e.target.value)}>
            <option value="">{t('transport.chooseStop')}</option>
            {(route?.stops ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}{s.pickupTime ? ` · ${s.pickupTime}` : ''}</option>)}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
