import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input, Select } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { platformError } from '@/features/platform/common';
import { useStudents } from '@/features/students/students-api';
import { parseFee } from '@/features/transport/transport-api';
import {
  HOSTEL_KINDS, freeBeds, parseBeds, parseFloorNo, useAssignRoom, useCreateHostel, useCreateRoom, useHostels, useRooms, useUpdateHostel, useUpdateRoom,
  type Hostel, type HostelKind, type Room,
} from './hostel-api';

export function HostelFormModal({ hostel, onClose }: { hostel?: Hostel; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateHostel();
  const update = useUpdateHostel();
  const [name, setName] = useState(hostel?.name ?? '');
  const [kind, setKind] = useState<HostelKind>(hostel?.kind ?? 'BOYS');
  const [warden, setWarden] = useState(hostel?.wardenName ?? '');
  const [phone, setPhone] = useState(hostel?.wardenPhone ?? '');
  const [notes, setNotes] = useState(hostel?.notes ?? '');
  const phoneOk = /^[0-9+\-\s()]*$/.test(phone);
  const valid = name.trim().length >= 2 && phoneOk;
  const values = () => ({ name: name.trim(), kind, wardenName: warden.trim() || null, wardenPhone: phone.trim() || null, notes: notes.trim() || null });
  const submit = async () => {
    if (!valid) return;
    try {
      if (hostel) await update.mutateAsync({ id: hostel.id, patch: values() }); else await create.mutateAsync(values());
      toast.success(t('hostel.hostelSaved'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={hostel ? t('hostel.editHostel') : t('hostel.addHostel')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending || update.isPending} disabled={!valid}>{t('hostel.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="hs-name" label={t('hostel.hostelName')}><Input id="hs-name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} /></Field>
        <Field id="hs-kind" label={t('hostel.kind')}>
          <Select id="hs-kind" value={kind} onChange={(e) => setKind(e.target.value as HostelKind)}>{HOSTEL_KINDS.map((k) => <option key={k} value={k}>{t(`hostel.kinds.${k}`)}</option>)}</Select>
        </Field>
        <Field id="hs-warden" label={t('hostel.wardenName')}><Input id="hs-warden" value={warden} maxLength={80} onChange={(e) => setWarden(e.target.value)} /></Field>
        <Field id="hs-phone" label={t('hostel.wardenPhone')} error={phoneOk ? undefined : t('hostel.phoneInvalid')}><Input id="hs-phone" dir="ltr" value={phone} maxLength={30} onChange={(e) => setPhone(e.target.value)} /></Field>
        <div className="sm:col-span-2"><Field id="hs-notes" label={t('hostel.notes')}><Input id="hs-notes" value={notes} maxLength={300} onChange={(e) => setNotes(e.target.value)} /></Field></div>
      </div>
    </Modal>
  );
}

export function RoomFormModal({ room, defaultHostelId, onClose }: { room?: Room; defaultHostelId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const hostels = useHostels();
  const create = useCreateRoom();
  const update = useUpdateRoom();
  const [hostelId, setHostelId] = useState(room?.hostelId ?? defaultHostelId ?? '');
  const [roomNo, setRoomNo] = useState(room?.roomNo ?? '');
  const [floor, setFloor] = useState(room?.floor !== null && room?.floor !== undefined ? String(room.floor) : '');
  const [beds, setBeds] = useState(room ? String(room.beds) : '');
  const [fee, setFee] = useState(room ? String(room.monthlyFee) : '');
  const bedCount = parseBeds(beds);
  const monthly = parseFee(fee);
  const floorNo = parseFloorNo(floor);
  const valid = (room !== undefined || hostelId !== '') && roomNo.trim().length >= 1 && bedCount !== null && monthly !== null && floorNo !== null;
  const submit = async () => {
    if (!valid || bedCount === null || monthly === null || floorNo === null) return;
    const values = { roomNo: roomNo.trim(), floor: floorNo ?? null, beds: bedCount, monthlyFee: monthly, notes: room?.notes ?? null };
    try {
      if (room) await update.mutateAsync({ id: room.id, patch: values }); else await create.mutateAsync({ hostelId, ...values });
      toast.success(t('hostel.roomSaved'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={room ? t('hostel.editRoom') : t('hostel.addRoom')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending || update.isPending} disabled={!valid}>{t('hostel.save')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {!room ? (
          <div className="sm:col-span-2">
            <Field id="rm-hostel" label={t('hostel.hostel')}>
              <Select id="rm-hostel" value={hostelId} onChange={(e) => setHostelId(e.target.value)}>
                <option value="">{t('hostel.chooseHostel')}</option>{(hostels.data ?? []).map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
              </Select>
            </Field>
          </div>
        ) : null}
        <Field id="rm-no" label={t('hostel.roomNo')}><Input id="rm-no" dir="ltr" value={roomNo} maxLength={20} onChange={(e) => setRoomNo(e.target.value)} /></Field>
        <Field id="rm-floor" label={t('hostel.floor')} error={floorNo === null ? t('hostel.floorInvalid') : undefined}><Input id="rm-floor" inputMode="numeric" dir="ltr" value={floor} onChange={(e) => setFloor(e.target.value)} /></Field>
        <Field id="rm-beds" label={t('hostel.beds')} error={beds !== '' && bedCount === null ? t('hostel.bedsInvalid') : undefined}><Input id="rm-beds" inputMode="numeric" dir="ltr" value={beds} onChange={(e) => setBeds(e.target.value)} /></Field>
        <Field id="rm-fee" label={t('hostel.monthlyFee')} error={fee !== '' && monthly === null ? t('hostel.feeInvalid') : undefined}><Input id="rm-fee" inputMode="numeric" dir="ltr" value={fee} onChange={(e) => setFee(e.target.value)} /></Field>
      </div>
    </Modal>
  );
}

/** Move a student into a room. The student is fixed (from the student page) or searched (from the Residents tab). */
export function AssignModal({ studentId, studentName, currentRoomId, onClose }: { studentId?: string; studentName?: string; currentRoomId?: string; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const rooms = useRooms();
  const assign = useAssignRoom();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState('');
  const [roomId, setRoomId] = useState(currentRoomId ?? '');
  const students = useStudents({ q: !studentId && search.trim().length >= 2 ? search.trim() : undefined, status: 'ACTIVE' });
  const options = !studentId && search.trim().length >= 2 ? (students.data?.students ?? []).slice(0, 30) : [];
  const who = studentId ?? picked;
  const submit = async () => {
    try {
      await assign.mutateAsync({ studentId: who, roomId });
      toast.success(t('hostel.assigned'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('hostel.assign')} description={studentName}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={assign.isPending} disabled={!who || !roomId}>{t('hostel.assign')}</Button></>}>
      <div className="space-y-4">
        {!studentId ? (
          <>
            <Field id="as-search" label={t('hostel.findStudent')} hint={t('hostel.findStudentHint')}><Input id="as-search" value={search} onChange={(e) => { setSearch(e.target.value); setPicked(''); }} /></Field>
            {options.length > 0 ? (
              <Field id="as-student" label={t('hostel.student')}>
                <Select id="as-student" value={picked} onChange={(e) => setPicked(e.target.value)}>
                  <option value="">{t('hostel.chooseStudent')}</option>
                  {options.map((s) => <option key={s.id} value={s.id}>{s.firstName} {s.lastName} ({s.admissionNo})</option>)}
                </Select>
              </Field>
            ) : null}
          </>
        ) : null}
        <Field id="as-room" label={t('hostel.room')}>
          <Select id="as-room" value={roomId} onChange={(e) => setRoomId(e.target.value)}>
            <option value="">{t('hostel.chooseRoom')}</option>
            {(rooms.data ?? []).map((r) => (
              <option key={r.id} value={r.id} disabled={freeBeds(r) === 0 && r.id !== currentRoomId}>
                {r.hostelName} · {r.roomNo} ({freeBeds(r) === 0 ? t('hostel.full') : t('hostel.freeOf', { n: freeBeds(r) })})
              </option>
            ))}
          </Select>
        </Field>
      </div>
    </Modal>
  );
}
