import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Field, Select } from '@/components/ui/input';
import type { ClassDto } from '@/features/students/students-api';

/** Class + section choice. Until the user picks, the first class and its first section are used. */
export function useClassSection(classes: ClassDto[] | undefined) {
  const [classId, setClassIdState] = useState('');
  const [sectionId, setSectionId] = useState('');
  const cls = classes?.find((c) => c.id === classId) ?? classes?.[0];
  const section = cls?.sections.find((s) => s.id === sectionId) ?? cls?.sections[0];
  const setClassId = (id: string) => { setClassIdState(id); setSectionId(''); };
  return { cls, section, setClassId, setSectionId };
}

interface PickerProps {
  classes: ClassDto[];
  cls: ClassDto | undefined;
  section: ClassDto['sections'][number] | undefined;
  onClass: (id: string) => void;
  onSection: (id: string) => void;
  idPrefix: string;
}

export function ClassSectionPicker({ classes, cls, section, onClass, onSection, idPrefix }: PickerProps) {
  const { t } = useTranslation();
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:max-w-xl">
      <Field id={`${idPrefix}-class`} label={t('timetable.class')}>
        <Select id={`${idPrefix}-class`} value={cls?.id ?? ''} onChange={(e) => onClass(e.target.value)}>
          {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </Field>
      <Field id={`${idPrefix}-section`} label={t('timetable.section')}>
        <Select id={`${idPrefix}-section`} value={section?.id ?? ''} onChange={(e) => onSection(e.target.value)} disabled={!cls || cls.sections.length === 0}>
          {(cls?.sections ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
      </Field>
    </div>
  );
}
