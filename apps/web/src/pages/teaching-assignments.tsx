import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Select } from '@/components/ui/input';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import {
  useAssignmentActions, useAssignments, useClassSubjects, useTeachers, type AssignmentDto, type TeacherOption,
} from '@/features/academics/academics-api';
import { ClassSectionPicker, useClassSection } from '@/features/academics/class-section-picker';
import { useAuth } from '@/features/auth/auth-context';
import { PageHeader, platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';

interface RowProps {
  sectionId: string;
  subject: { id: string; name: string };
  assignment: AssignmentDto | undefined;
  teachers: TeacherOption[];
  canEdit: boolean;
}

function SubjectRow({ sectionId, subject, assignment, teachers, canEdit }: RowProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const a = useAssignmentActions();
  const [staffId, setStaffId] = useState(assignment?.staff.id ?? '');
  const changed = staffId !== '' && staffId !== (assignment?.staff.id ?? '');
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <div>
        <p className="font-bold text-navy-900">{subject.name}</p>
        <p className="text-sm text-muted">{assignment ? assignment.staff.name : t('assignments.none')}</p>
      </div>
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Select aria-label={`${t('assignments.teacher')}: ${subject.name}`} className="w-56" value={staffId} onChange={(e) => setStaffId(e.target.value)}>
            <option value="">{t('assignments.choose')}</option>
            {teachers.map((x) => <option key={x.id} value={x.id}>{x.name} ({x.employeeNo})</option>)}
          </Select>
          <Button size="sm" disabled={!changed} loading={a.assign.isPending}
            onClick={() => a.assign.mutateAsync({ sectionId, subjectId: subject.id, staffId }).then(() => toast.success(t('assignments.saved'))).catch(fail)}>
            {assignment ? t('assignments.change') : t('assignments.assign')}
          </Button>
          {assignment && (
            <Button size="sm" variant="ghost" loading={a.remove.isPending}
              onClick={() => a.remove.mutateAsync(assignment.id).then(() => { setStaffId(''); toast.success(t('assignments.removed')); }).catch(fail)}>
              {t('assignments.remove')}
            </Button>
          )}
        </div>
      )}
    </li>
  );
}

export default function TeachingAssignmentsPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const canEdit = can('academic.manage');
  const classes = useClasses();
  const { cls, section, setClassId, setSectionId } = useClassSection(classes.data);
  const subjects = useClassSubjects(cls?.id);
  const assignments = useAssignments({ sectionId: section?.id }, Boolean(section));
  const teachers = useTeachers();

  const body = () => {
    if (classes.error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, classes.error)} onRetry={() => void classes.refetch()} />;
    if (classes.isLoading || !classes.data) return <Skeleton className="h-48" />;
    if (classes.data.length === 0) return <EmptyState title={t('assignments.noClasses')} />;
    if (!section) return <EmptyState title={t('assignments.noSections')} />;
    if (subjects.isLoading || assignments.isLoading || teachers.isLoading) return <Skeleton className="h-48" />;
    const error = subjects.error ?? assignments.error ?? teachers.error;
    if (error) return <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, error)} onRetry={() => { void subjects.refetch(); void assignments.refetch(); void teachers.refetch(); }} />;
    const list = subjects.data?.subjects ?? [];
    if (list.length === 0) return <EmptyState title={t('assignments.noSubjects')} />;
    return (
      <>
        {canEdit && (teachers.data ?? []).length === 0 && <p className="mb-3 rounded-control bg-amber-50 px-3 py-2 text-sm text-amber-900">{t('assignments.noTeachers')}</p>}
        <Card>
          <ul className="divide-y divide-line">
            {list.map((s) => {
              const current = assignments.data?.find((x) => x.subject.id === s.id);
              return <SubjectRow key={`${section.id}-${s.id}-${current?.staff.id ?? ''}`} sectionId={section.id} subject={s} assignment={current} teachers={teachers.data ?? []} canEdit={canEdit} />;
            })}
          </ul>
        </Card>
      </>
    );
  };

  return (
    <div>
      <PageHeader title={t('assignments.title')} subtitle={t('assignments.subtitle')} />
      {classes.data && classes.data.length > 0 && (
        <div className="mb-5"><ClassSectionPicker idPrefix="as" classes={classes.data} cls={cls} section={section} onClass={setClassId} onSection={setSectionId} /></div>
      )}
      {body()}
    </div>
  );
}
