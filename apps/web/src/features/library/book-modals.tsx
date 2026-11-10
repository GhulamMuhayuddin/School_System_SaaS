import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Modal } from '@/components/ui/modal';
import { ErrorState, Skeleton } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtDate, platformError } from '@/features/platform/common';
import { copyTone, useAddCopies, useBook, useCreateBook, useSetCopyStatus, useUpdateBook, type BookDetail, type BookValues } from './library-api';

const empty: BookValues = { title: '', author: '', isbn: null, category: null, publisher: null, language: null, location: null };

/** Add a book (with its first copies) or change the details of an existing one. */
export function BookFormModal({ existing, onClose }: { existing?: BookDetail; onClose: () => void }) {
  const { t } = useTranslation();
  const toast = useToast();
  const create = useCreateBook();
  const update = useUpdateBook();
  const [v, setV] = useState<BookValues>(existing ? { title: existing.title, author: existing.author, isbn: existing.isbn, category: existing.category, publisher: existing.publisher, language: existing.language, location: existing.location } : empty);
  const [copies, setCopies] = useState('1');
  const set = (k: keyof BookValues) => (e: React.ChangeEvent<HTMLInputElement>) => setV({ ...v, [k]: e.target.value });
  const copiesOk = existing ? true : /^\d{1,3}$/.test(copies) && Number(copies) <= 100;
  const valid = v.title.trim().length > 0 && v.author.trim().length > 0 && copiesOk;
  const submit = async () => {
    const body = { ...v, title: v.title.trim(), author: v.author.trim() };
    try {
      if (existing) await update.mutateAsync({ id: existing.id, patch: body });
      else await create.mutateAsync({ ...body, copies: Number(copies) });
      toast.success(t(existing ? 'library.bookUpdated' : 'library.bookCreated'));
      onClose();
    } catch (err) { toast.error(t('platform.errors.generic'), platformError(t, err)); }
  };
  return (
    <Modal open onOpenChange={(o) => !o && onClose()} title={t(existing ? 'library.editBook' : 'library.addBook')}
      footer={<><Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button><Button onClick={() => void submit()} loading={create.isPending || update.isPending} disabled={!valid}>{t('library.save')}</Button></>}>
      <div className="space-y-3">
        <Field id="bk-title" label={t('library.bookTitle')}><Input id="bk-title" value={v.title} onChange={set('title')} maxLength={200} /></Field>
        <Field id="bk-author" label={t('library.author')}><Input id="bk-author" value={v.author} onChange={set('author')} maxLength={150} /></Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field id="bk-cat" label={t('library.category')}><Input id="bk-cat" value={v.category ?? ''} onChange={set('category')} maxLength={60} /></Field>
          <Field id="bk-isbn" label="ISBN"><Input id="bk-isbn" dir="ltr" value={v.isbn ?? ''} onChange={set('isbn')} maxLength={30} /></Field>
          <Field id="bk-pub" label={t('library.publisher')}><Input id="bk-pub" value={v.publisher ?? ''} onChange={set('publisher')} maxLength={120} /></Field>
          <Field id="bk-lang" label={t('library.language')}><Input id="bk-lang" value={v.language ?? ''} onChange={set('language')} maxLength={40} /></Field>
          <Field id="bk-loc" label={t('library.location')}><Input id="bk-loc" value={v.location ?? ''} onChange={set('location')} maxLength={60} /></Field>
          {existing ? null : <Field id="bk-copies" label={t('library.copiesToAdd')} error={copiesOk ? undefined : t('library.copiesInvalid')}><Input id="bk-copies" dir="ltr" inputMode="numeric" value={copies} onChange={(e) => setCopies(e.target.value)} /></Field>}
        </div>
      </div>
    </Modal>
  );
}

/** One book: details, every copy with its status and borrower, add copies, mark lost/withdrawn, edit or retire. */
export function BookDetailModal({ id, onClose }: { id: string; onClose: () => void }) {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const toast = useToast();
  const q = useBook(id);
  const addCopies = useAddCopies();
  const setStatus = useSetCopyStatus();
  const update = useUpdateBook();
  const [count, setCount] = useState('1');
  const [editing, setEditing] = useState(false);
  const manage = can('library.manage');
  const b = q.data;
  const fail = (err: unknown) => toast.error(t('platform.errors.generic'), platformError(t, err));
  const countOk = /^\d{1,3}$/.test(count) && Number(count) >= 1 && Number(count) <= 100;
  return (
    <>
      <Modal open onOpenChange={(o) => !o && onClose()} title={b ? b.title : t('library.book')} description={b ? `${b.author}${b.category ? ` · ${b.category}` : ''}` : undefined}
        footer={<Button variant="secondary" onClick={onClose}>{t('common.close')}</Button>}>
        {q.error ? <ErrorState title={t('platform.errors.loadTitle')} description={platformError(t, q.error)} onRetry={() => void q.refetch()} /> : !b ? <Skeleton className="h-32" /> : (
          <div className="space-y-4 text-sm">
            <p className="flex flex-wrap items-center gap-2 text-muted">
              {!b.active && <Badge tone="neutral">{t('library.retired')}</Badge>}
              <span>{t('library.copiesSummary', { total: b.counts.total, available: b.counts.available })}</span>
              {b.location ? <span>· {b.location}</span> : null}{b.isbn ? <span dir="ltr">· ISBN {b.isbn}</span> : null}
            </p>
            <ul className="divide-y divide-line rounded-lg ring-1 ring-line">
              {b.copies.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 p-2.5">
                  <span><b dir="ltr" className="text-navy-900">{c.accessionNo}</b>
                    {c.loan ? <span className="block text-xs text-muted">{c.loan.student.name} ({c.loan.student.admissionNo}) · {t('library.dueOn', { date: fmtDate(c.loan.dueOn, i18n.language) })}{c.loan.overdue ? ` · ${t('library.overdue')}` : ''}</span> : null}</span>
                  <span className="flex items-center gap-2">
                    <Badge tone={copyTone(c.status)}>{t(`library.copyStatus.${c.status}`)}</Badge>
                    {manage && c.status === 'AVAILABLE' && <><Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: c.id, status: 'LOST' }, { onError: fail })}>{t('library.markLost')}</Button><Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: c.id, status: 'WITHDRAWN' }, { onError: fail })}>{t('library.withdraw')}</Button></>}
                    {manage && (c.status === 'LOST' || c.status === 'WITHDRAWN') && <Button size="sm" variant="secondary" onClick={() => setStatus.mutate({ id: c.id, status: 'AVAILABLE' }, { onError: fail })}>{t('library.restore')}</Button>}
                  </span>
                </li>
              ))}
            </ul>
            {manage && (
              <div className="flex flex-wrap items-end gap-3">
                {b.active && <Field id="bk-more" label={t('library.copiesToAdd')}><Input id="bk-more" dir="ltr" inputMode="numeric" className="w-24" value={count} onChange={(e) => setCount(e.target.value)} /></Field>}
                {b.active && <Button onClick={() => addCopies.mutate({ id: b.id, count: Number(count) }, { onSuccess: () => toast.success(t('library.copiesAdded')), onError: fail })} disabled={!countOk} loading={addCopies.isPending}>{t('library.addCopies')}</Button>}
                <Button variant="secondary" onClick={() => setEditing(true)}>{t('library.editBook')}</Button>
                <Button variant="secondary" onClick={() => update.mutate({ id: b.id, patch: { active: !b.active } }, { onError: fail })}>{t(b.active ? 'library.retire' : 'library.reactivate')}</Button>
              </div>
            )}
          </div>
        )}
      </Modal>
      {editing && b ? <BookFormModal existing={b} onClose={() => setEditing(false)} /> : null}
    </>
  );
}
