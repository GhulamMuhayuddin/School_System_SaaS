import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney } from '@/features/fees/fees-api';
import { fmtDate, platformError } from '@/features/platform/common';
import { useStudentTransport, useUnassign } from './transport-api';
import { AssignModal } from './transport-modals';

/** Transport card on the student page: the route, stop, pickup time and vehicle, with change/remove for transport.manage. */
export function StudentTransportCard({ studentId, studentName }: { studentId: string; studentName: string }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const q = useStudentTransport(studentId);
  const remove = useUnassign();
  const [open, setOpen] = useState(false);
  const a = q.data?.assignment ?? null;
  const edit = can('transport.manage');
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="font-semibold text-navy-900">{t('transport.title')}</h2>
        {edit ? <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>{a ? t('transport.change') : t('transport.assign')}</Button> : null}
      </div>
      {q.error ? <p className="text-sm text-rose-700">{platformError(t, q.error)}</p> : null}
      {q.data && !a ? <p className="text-sm text-muted">{t('transport.notOnTransport')}</p> : null}
      {a ? (
        <div className="space-y-1 text-sm">
          <p><b className="text-navy-900">{a.route.name}</b> · {a.stop.name}{a.stop.pickupTime ? ` · ${t('transport.pickupAt', { time: a.stop.pickupTime })}` : ''}</p>
          {a.vehicle ? <p className="text-muted">{a.vehicle.kind} <span dir="ltr">{a.vehicle.registrationNo}</span>{a.vehicle.driverName ? ` · ${a.vehicle.driverName}` : ''}{a.vehicle.driverPhone ? <> · <span dir="ltr">{a.vehicle.driverPhone}</span></> : null}</p> : null}
          <p className="text-muted">{t('transport.monthlyFee')}: <span dir="ltr">{fmtMoney(a.route.monthlyFee, i18n.language)}</span> · {t('transport.since', { date: fmtDate(a.assignedOn, i18n.language) })}</p>
          {edit ? <Button size="sm" variant="ghost" loading={remove.isPending} onClick={() => void remove.mutateAsync(studentId).then(() => toast.success(t('transport.removed')), (e) => toast.error(t('platform.errors.generic'), platformError(t, e)))}>{t('transport.removeRider')}</Button> : null}
        </div>
      ) : null}
      {open ? <AssignModal studentId={studentId} studentName={studentName} currentRouteId={a?.route.id} onClose={() => setOpen(false)} /> : null}
    </Card>
  );
}
