import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { todayText } from '@/features/hr/hr-api';
import { platformError } from '@/features/platform/common';
import { useClasses } from '@/features/students/students-api';
import { AUDIENCES, formValid, useSend, type Audience, type Priority } from './communication-api';

export function ComposeModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const classes = useClasses();
  const send = useSend();
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [audience, setAudience] = useState<Audience>('ALL');
  const [classId, setClassId] = useState('');
  const [priority, setPriority] = useState<Priority>('NORMAL');
  const [until, setUntil] = useState('');
  const untilOk = until === '' || (/^\d{4}-\d{2}-\d{2}$/.test(until) && until >= todayText());
  const valid = formValid({ title, body, audience, classId }) && untilOk;
  const submit = async () => {
    if (!valid) return;
    try {
      await send.mutateAsync({ title: title.trim(), body: body.trim(), audience, classId: audience === 'CLASS' ? classId : null, priority, expiresOn: until || null });
      toast.success(t('communication.sentToast'));
      onClose();
    } catch (e) { toast.error(t('platform.errors.generic'), platformError(t, e)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t('communication.compose')} description={t('communication.composeHint')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={send.isPending} disabled={!valid}>{t('communication.publish')}</Button></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="sm:col-span-2"><Field id="an-title" label={t('communication.title')}><Input id="an-title" value={title} maxLength={120} onChange={(e) => setTitle(e.target.value)} /></Field></div>
        <div className="sm:col-span-2"><Field id="an-body" label={t('communication.message')}><Textarea id="an-body" rows={5} value={body} maxLength={3000} onChange={(e) => setBody(e.target.value)} /></Field></div>
        <Field id="an-aud" label={t('communication.audience')}>
          <Select id="an-aud" value={audience} onChange={(e) => setAudience(e.target.value as Audience)}>{AUDIENCES.map((a) => <option key={a} value={a}>{t(`communication.audiences.${a}`)}</option>)}</Select>
        </Field>
        {audience === 'CLASS' ? (
          <Field id="an-class" label={t('communication.class')}>
            <Select id="an-class" value={classId} onChange={(e) => setClassId(e.target.value)}><option value="">{t('communication.chooseClass')}</option>{(classes.data ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
        ) : null}
        <Field id="an-prio" label={t('communication.priority')}>
          <Select id="an-prio" value={priority} onChange={(e) => setPriority(e.target.value as Priority)}><option value="NORMAL">{t('communication.priorities.NORMAL')}</option><option value="IMPORTANT">{t('communication.priorities.IMPORTANT')}</option></Select>
        </Field>
        <Field id="an-until" label={t('communication.showUntil')} hint={t('communication.showUntilHint')} error={untilOk ? undefined : t('communication.untilInvalid')}>
          <Input id="an-until" type="date" dir="ltr" value={until} min={todayText()} onChange={(e) => setUntil(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
