import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TimetableGrid, visibleDays } from '@/features/academics/timetable-grid';
import { statusStyle } from '@/features/attendance/status-picker';
import { loanTone } from '@/features/library/library-api';
import { fmtMoney, statusTone as feeTone } from '@/features/fees/fees-api';
import { ChildHomeworkList } from '@/features/homework/child-homework';
import { fmtDate } from '@/features/platform/common';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Modal } from '@/components/ui/modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import {
  monthBounds, monthText, shiftMonth, usePortalAttendance, usePortalCalendar, usePortalFees, usePortalHostel, usePortalLibrary, usePortalResults, usePortalTransport, usePortalTimetable, usePortalVoucher,
} from './portal-api';

function Load({ q, children }: { q: { isLoading: boolean; error: unknown; refetch: () => unknown }; children: React.ReactNode }) {
  const { t } = useTranslation();
  if (q.error) return <ErrorState title={t('platform.errors.loadTitle')} description={t('portal.loadFailed')} onRetry={() => void q.refetch()} />;
  if (q.isLoading) return <Skeleton className="h-32" />;
  return <>{children}</>;
}

export function AttendanceTab({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const [month, setMonth] = useState(monthText());
  const q = usePortalAttendance(id, month);
  const label = new Date(`${month}-01T00:00:00Z`).toLocaleDateString(i18n.language === 'ur' ? 'ur-PK' : 'en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const d = q.data;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between gap-2">
        <Button variant="secondary" size="sm" aria-label={t('portal.prevMonth')} onClick={() => setMonth(shiftMonth(month, -1))}><ChevronLeft className="size-4 rtl:rotate-180" aria-hidden /></Button>
        <h3 className="font-bold text-navy-900">{label}</h3>
        <Button variant="secondary" size="sm" aria-label={t('portal.nextMonth')} disabled={month >= monthText()} onClick={() => setMonth(shiftMonth(month, 1))}><ChevronRight className="size-4 rtl:rotate-180" aria-hidden /></Button>
      </div>
      <Load q={q}>
        {d && (d.totals.marked === 0 ? <p className="mt-4 text-sm text-muted">{t('portal.attendanceEmpty')}</p> : (
          <div className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs font-bold">
              <Badge tone={(d.totals.percentage ?? 0) >= 75 ? 'success' : (d.totals.percentage ?? 0) >= 50 ? 'warning' : 'danger'}>{d.totals.percentage}%</Badge>
              {(['PRESENT', 'ABSENT', 'LATE', 'LEAVE'] as const).map((s) => (
                <span key={s} className={`rounded-full px-3 py-1 ${statusStyle[s].chip}`}>{t(`attendance.statuses.${s}`)}: {d.totals[s.toLowerCase() as 'present' | 'absent' | 'late' | 'leave']}</span>
              ))}
            </div>
            <ul className="divide-y divide-line text-sm">
              {[...d.records].reverse().map((r) => (
                <li key={r.date} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <span>{fmtDate(r.date, i18n.language)}{r.remark ? <span className="text-muted"> · {r.remark}</span> : null}</span>
                  <span className={`rounded-full px-3 py-0.5 text-xs font-bold ${statusStyle[r.status].chip}`}>{t(`attendance.statuses.${r.status}`)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </Load>
    </Card>
  );
}

export function ResultsTab({ id }: { id: string }) {
  const { t } = useTranslation();
  const q = usePortalResults(id);
  return (
    <Load q={q}>
      {q.data && (q.data.length === 0 ? <EmptyState title={t('portal.resultsEmptyTitle')} description={t('portal.resultsEmptyBody')} /> : (
        <div className="space-y-4">
          {q.data.map(({ exam, result, classSize }) => (
            <Card key={exam.id} className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-navy-900">{exam.name} <span className="text-sm font-normal text-muted">· {exam.sessionName}</span></h3>
                {result.passed === null ? <Badge>{t('exams.incomplete')}</Badge> : <Badge tone={result.passed ? 'success' : 'danger'}>{t(result.passed ? 'exams.pass' : 'exams.fail')}</Badge>}
              </div>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[22rem] text-sm">
                  <thead><tr className="text-start text-xs text-muted"><th className="py-1 text-start">{t('timetable.subject')}</th><th className="text-start">{t('exams.total')}</th><th className="text-start">%</th><th className="text-start">{t('exams.grade')}</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {result.subjects.map((s) => (
                      <tr key={s.subjectId}>
                        <td className="py-1.5 font-semibold text-navy-900">{s.subjectName}</td>
                        <td>{!s.entered ? <span className="text-muted">—</span> : s.absent ? <Badge tone="danger">{t('exams.absentShort')}</Badge> : <span className={s.passed ? '' : 'font-bold text-rose-600'}>{s.marks}/{s.totalMarks}</span>}</td>
                        <td>{s.percentage === null ? '—' : `${s.percentage}%`}</td><td>{s.grade ?? '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-3 flex flex-wrap gap-x-4 text-sm text-muted">
                <span>{t('exams.total')}: <b className="text-navy-900">{result.obtained}/{result.total}</b></span>
                <span>%: <b className="text-navy-900">{result.percentage === null ? '—' : `${result.percentage}%`}</b></span>
                <span>{t('exams.grade')}: <b className="text-navy-900">{result.grade ?? '—'}</b></span>
                {result.position !== null && <span>{t('exams.position')}: <b className="text-navy-900">{result.position}/{classSize}</b></span>}
              </p>
            </Card>
          ))}
        </div>
      ))}
    </Load>
  );
}

function VoucherModal({ id, voucherId, onClose }: { id: string; voucherId: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const q = usePortalVoucher(id, voucherId);
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, i18n.language)}</span>;
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={q.data ? `${q.data.voucherNo} · ${q.data.period}` : t('portal.voucher')} footer={<Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>}>
      <Load q={q}>
        {q.data && (
          <div className="space-y-4 text-sm">
            <ul className="divide-y divide-line">
              {q.data.items.map((i) => <li key={i.id} className="flex justify-between py-1.5"><span>{i.description}</span>{money(i.amount)}</li>)}
              {q.data.discountAmount > 0 && <li className="flex justify-between py-1.5"><span>{t('fees.discount')}</span>{money(-q.data.discountAmount)}</li>}
              <li className="flex justify-between py-1.5 font-bold text-navy-900"><span>{t('fees.net')}</span>{money(q.data.netAmount)}</li>
              <li className="flex justify-between py-1.5"><span>{t('fees.paid')}</span>{money(q.data.paidAmount)}</li>
              <li className="flex justify-between py-1.5 font-bold text-navy-900"><span>{t('fees.balance')}</span>{money(q.data.balance)}</li>
            </ul>
            <div>
              <h4 className="mb-1 font-semibold text-navy-900">{t('fees.receipts')}</h4>
              {q.data.payments.filter((p) => !p.voided).length === 0 ? <p className="text-muted">{t('fees.noReceipts')}</p> : (
                <ul className="divide-y divide-line">
                  {q.data.payments.filter((p) => !p.voided).map((p) => (
                    <li key={p.id} className="flex flex-wrap justify-between gap-2 py-1.5"><span><span dir="ltr">{p.receiptNo}</span> · {fmtDate(p.paidAt, i18n.language)} · {t(`fees.methods.${p.method}`)}</span>{money(p.amount)}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </Load>
    </Modal>
  );
}

export function FeesTab({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const q = usePortalFees(id);
  const [open, setOpen] = useState<string | null>(null);
  const money = (n: number) => <span dir="ltr">{fmtMoney(n, i18n.language)}</span>;
  return (
    <Load q={q}>
      {q.data && (q.data.vouchers.length === 0 ? <EmptyState title={t('portal.feesEmptyTitle')} description={t('portal.feesEmptyBody')} /> : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4"><p className="text-xs text-muted">{t('fees.net')}</p><p className="text-lg font-extrabold text-navy-900">{money(q.data.totals.billed)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">{t('fees.paid')}</p><p className="text-lg font-extrabold text-emerald-700">{money(q.data.totals.paid)}</p></Card>
            <Card className="p-4"><p className="text-xs text-muted">{t('fees.balance')}</p><p className={`text-lg font-extrabold ${q.data.totals.balance > 0 ? 'text-rose-700' : 'text-navy-900'}`}>{money(q.data.totals.balance)}</p></Card>
          </div>
          <Card className="p-2">
            <ul className="divide-y divide-line text-sm">
              {q.data.vouchers.map((v) => (
                <li key={v.id}>
                  <button type="button" onClick={() => setOpen(v.id)} className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg p-3 text-start hover:bg-canvas">
                    <span><b className="text-navy-900">{v.period}</b> · <span dir="ltr">{v.voucherNo}</span><span className="block text-xs text-muted">{t('homework.dueOn', { date: fmtDate(v.dueDate, i18n.language) })}</span></span>
                    <span className="flex items-center gap-3">{money(v.balance)}<Badge tone={feeTone(v.status, v.overdue)}>{v.overdue && v.status !== 'PAID' ? t('fees.overdue') : t(`fees.statuses.${v.status}`)}</Badge></span>
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ))}
      {open && <VoucherModal id={id} voucherId={open} onClose={() => setOpen(null)} />}
    </Load>
  );
}

export function TimetableTab({ id }: { id: string }) {
  const { t } = useTranslation();
  const q = usePortalTimetable(id);
  return (
    <Load q={q}>
      {q.data === null || (q.data && q.data.periods.length === 0) ? <EmptyState title={t('portal.timetableEmptyTitle')} description={t('portal.timetableEmptyBody')} /> : q.data && (
        <TimetableGrid periods={q.data.periods} days={visibleDays(q.data.entries.map((e) => e.dayOfWeek))}
          cell={(day, period) => {
            const e = q.data!.entries.find((x) => x.dayOfWeek === day && x.period.id === period.id);
            return e ? (<><span className="block text-sm font-bold text-navy-900">{e.subject.name}</span><span className="block text-xs text-muted">{[e.staff?.name, e.room].filter(Boolean).join(' · ')}</span></>) : null;
          }} />
      )}
    </Load>
  );
}

export function CalendarTab() {
  const { t, i18n } = useTranslation();
  const today = new Date().toISOString().slice(0, 10);
  const { from } = monthBounds(monthText());
  const to = monthBounds(shiftMonth(monthText(), 2)).to;
  const q = usePortalCalendar(from, to);
  const upcoming = (q.data ?? []).filter((e) => e.endDate >= today);
  return (
    <Load q={q}>
      {upcoming.length === 0 ? <EmptyState title={t('portal.calendarEmptyTitle')} description={t('portal.calendarEmptyBody')} /> : (
        <Card className="p-2">
          <ul className="divide-y divide-line text-sm">
            {upcoming.map((e) => (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                <span><b className="text-navy-900">{e.title}</b>{e.description ? <span className="block text-xs text-muted">{e.description}</span> : null}</span>
                <span className="flex items-center gap-2 text-xs text-muted"><Badge tone={e.type === 'HOLIDAY' ? 'success' : e.type === 'EXAM' ? 'warning' : 'brand'}>{t(`calendar.types.${e.type}`)}</Badge>
                  {fmtDate(e.startDate, i18n.language)}{e.endDate !== e.startDate ? ` – ${fmtDate(e.endDate, i18n.language)}` : ''}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </Load>
  );
}

export function HomeworkTab({ id }: { id: string }) {
  return <Card className="p-5"><ChildHomeworkList studentId={id} /></Card>;
}

export function TransportTab({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const q = usePortalTransport(id);
  const a = q.data?.assignment ?? null;
  return (
    <Load q={q}>
      {q.data && (!a ? <EmptyState title={t('portal.transportEmptyTitle')} description={t('portal.transportEmptyBody')} /> : (
        <Card className="space-y-2 p-5 text-sm">
          <p className="text-base font-bold text-navy-900">{a.route.name}</p>
          <p>{t('transport.stop')}: <b>{a.stop.name}</b>{a.stop.pickupTime ? ` · ${t('transport.pickupAt', { time: a.stop.pickupTime })}` : ''}</p>
          {a.vehicle && <p className="text-muted">{a.vehicle.kind} <span dir="ltr">{a.vehicle.registrationNo}</span>{a.vehicle.driverName ? ` · ${a.vehicle.driverName}` : ''}{a.vehicle.driverPhone ? <> · <span dir="ltr">{a.vehicle.driverPhone}</span></> : null}</p>}
          <p className="text-muted">{t('transport.monthlyFee')}: <span dir="ltr">{fmtMoney(a.route.monthlyFee, i18n.language)}</span> · {t('transport.since', { date: fmtDate(a.assignedOn, i18n.language) })}</p>
        </Card>
      ))}
    </Load>
  );
}

export function HostelTab({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const q = usePortalHostel(id);
  const a = q.data?.allocation ?? null;
  return (
    <Load q={q}>
      {q.data && (!a ? <EmptyState title={t('portal.hostelEmptyTitle')} description={t('portal.hostelEmptyBody')} /> : (
        <Card className="space-y-2 p-5 text-sm">
          <p className="text-base font-bold text-navy-900">{a.hostel.name}</p>
          <p>{t('hostel.roomLine', { room: a.room.roomNo })}{a.room.floor !== null ? ` · ${t('hostel.floorLine', { n: a.room.floor })}` : ''}</p>
          {a.hostel.wardenName && <p className="text-muted">{t('hostel.warden')}: {a.hostel.wardenName}{a.hostel.wardenPhone ? <> · <span dir="ltr">{a.hostel.wardenPhone}</span></> : null}</p>}
          <p className="text-muted">{t('hostel.monthlyFee')}: <span dir="ltr">{fmtMoney(a.room.monthlyFee, i18n.language)}</span> · {t('hostel.since', { date: fmtDate(a.assignedOn, i18n.language) })}</p>
        </Card>
      ))}
    </Load>
  );
}

export function LibraryTab({ id }: { id: string }) {
  const { t, i18n } = useTranslation();
  const q = usePortalLibrary(id);
  return (
    <Load q={q}>
      {q.data && (q.data.loans.length === 0 ? <EmptyState title={t('portal.libraryEmptyTitle')} description={t('portal.libraryEmptyBody')} /> : (
        <div className="space-y-3">
          {q.data.unpaidFine > 0 && <p className="rounded-lg bg-rose-50 p-3 text-sm font-semibold text-rose-700">{t('portal.libraryUnpaid', { amount: fmtMoney(q.data.unpaidFine, i18n.language) })}</p>}
          <Card className="p-2">
            <ul className="divide-y divide-line text-sm">
              {q.data.loans.map((l) => (
                <li key={l.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <span><b className="text-navy-900">{l.book.title}</b><span className="block text-xs text-muted">{l.book.author} · {t('library.issuedOn')}: {fmtDate(l.issuedOn, i18n.language)} · {t('library.dueLabel')}: {fmtDate(l.dueOn, i18n.language)}{l.returnedOn ? ` · ${t('library.state.RETURNED')}: ${fmtDate(l.returnedOn, i18n.language)}` : ''}</span></span>
                  <span className="flex items-center gap-2">
                    {l.fine > 0 && <span dir="ltr" className="text-xs text-muted">{fmtMoney(l.fine, i18n.language)} · {t(`library.fineStatus.${l.fineStatus}`)}</span>}
                    <Badge tone={loanTone(l.state)}>{l.state === 'OVERDUE' ? t('library.overdueDays', { count: l.overdueDays }) : t(`library.state.${l.state}`)}</Badge>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      ))}
    </Load>
  );
}
