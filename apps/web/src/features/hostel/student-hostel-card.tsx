import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney } from '@/features/fees/fees-api';
import { fmtDate, platformError } from '@/features/platform/common';
import { useRemoveResident, useStudentHostel } from './hostel-api';
import { AssignModal } from './hostel-modals';

/** Hostel card on the student page: hostel, room, warden and fee, with change/remove for hostel.manage. */
export function StudentHostelCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const q = useStudentHostel(studentId);
  const remove = useRemoveResident();
  const [open, setOpen] = useState(false);
  const a = q.data?.allocation ?? null;
  const edit = can('hostel.manage');
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-navy-900">{t('hostel.title')}</h2>
        {edit ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{a ? t('hostel.change') : t('hostel.assign')}</Button> : null}
      </div>
      {q.error ? <p className="text-sm text-rose-700">{platformError(t, q.error)}</p> : null}
      {q.data && !a ? <p className="text-sm text-muted">{t('hostel.notInHostel')}</p> : null}
      {a ? (
        <div className="space-y-1 text-sm">
          <p><b className="text-navy-900">{a.hostel.name}</b> · {t('hostel.roomLine', { room: a.room.roomNo })}{a.room.floor !== null ? ` · ${t('hostel.floorLine', { n: a.room.floor })}` : ''}</p>
          {a.hostel.wardenName ? <p className="text-muted">{t('hostel.warden')}: {a.hostel.wardenName}{a.hostel.wardenPhone ? <> · <span dir="ltr">{a.hostel.wardenPhone}</span></> : null}</p> : null}
          <p className="text-muted">{t('hostel.monthlyFee')}: <span dir="ltr">{fmtMoney(a.room.monthlyFee, i18n.language)}</span> · {t('hostel.since', { date: fmtDate(a.assignedOn, i18n.language) })}</p>
          {edit ? <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => void remove.mutateAsync(studentId).then(() => toast.success(t('hostel.removed')), (e) => toast.error(t('platform.errors.generic'), platformError(t, e)))}>{t('hostel.removeResident')}</Button> : null}
        </div>
      ) : null}
      {open ? <AssignModal studentId={studentId} studentName={studentName} currentRoomId={a?.room.id} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}
