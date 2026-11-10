import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { Field, Input } from '@/components/ui/input';
import { ClassSectionPicker, useClassSection } from '@/features/academics/class-section-picker';
import { thisMonth, useSectionMonthly } from '@/features/attendance/attendance-api';
import { AttendanceTabs } from '@/features/attendance/attendance-tabs';
import { MonthlyGrid } from '@/features/attendance/monthly-grid';
import { PageHeader, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

export default function AttendanceMonthlyPage() {
  const { t } = useTranslation();
  const classes = useClasses();
  const { cls, section, setClassId, setSectionId } = useClassSection(classes.data);
  const [month, setMonth] = useState(thisMonth());
  const sheet = useSectionMonthly(section?.id, month);
  const d = sheet.data;
  return (
    <div>
      <PageHeader title={t('attendance.title')} subtitle={t('attendance.monthlySubtitle')} />
      <AttendanceTabs />
      {classes.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, classes.error)} onRetry={() => void classes.refetch()} /> : !classes.data ? <Skeleton className="h-40" /> : !section ? (
        <EmptyState title={t('attendance.noSections')} description={t('attendance.noSectionsBody')} />
      ) : (
        <div className="space-y-5">
          <div className="flex flex-wrap items-end gap-3">
            <ClassSectionPicker classes={classes.data} cls={cls} section={section} onClass={setClassId} onSection={setSectionId} idPrefix="mo" />
            <Field id="mo-month" label={t('attendance.month')}><Input id="mo-month" type="month" dir="ltr" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} /></Field>
          </div>
          {sheet.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, sheet.error)} onRetry={() => void sheet.refetch()} /> : !d ? <Skeleton className="h-64" /> : d.students.length === 0 ? (
            <EmptyState title={t('attendance.noStudents')} description={t('attendance.noStudentsBody')} />
          ) : (
            <>
              <MonthlyGrid month={d.month} days={d.days} holidays={d.holidays} rows={d.students.map((s) => ({ id: s.id, label: s.name, sub: s.admissionNo, records: s.records, totals: s.totals }))} />
              <p className="text-xs text-muted">{t('attendance.legend')}</p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
