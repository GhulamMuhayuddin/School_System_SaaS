import { Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { fmtMoney } from '@/features/fees/fees-api';
import { BookDetailModal, BookFormModal } from '@/features/library/book-modals';
import { parseSettings, useBooks, useLibrarySettings, useLibrarySummary, useSaveLibrarySettings, type Book } from '@/features/library/library-api';
import { LoansTab } from '@/features/library/loans-tab';
import { PageHeader, platformError } from '@/features/platform/common';
import { cn } from '@/lib/cn';

type Tab = 'books' | 'loans' | 'settings';

function SettingsTab() {
  const { t } = useTranslation();
  const toast = useToast();
  const q = useLibrarySettings();
  const save = useSaveLibrarySettings();
  const { can } = useAuth();
  const [draft, setDraft] = useState<{ loanDays: string; finePerDay: string; maxBooksStudent: string } | null>(null);
  if (!q.data) return null;
  const v = draft ?? { loanDays: String(q.data.loanDays), finePerDay: String(q.data.finePerDay), maxBooksStudent: String(q.data.maxBooksStudent) };
  const parsed = parseSettings(v);
  const edit = can('library.manage');
  const field = (k: keyof typeof v, label: string) => (
    <Field id={`ls-${k}`} label={label}><Input id={`ls-${k}`} dir="ltr" inputMode="numeric" disabled={!edit} value={v[k]} onChange={(e) => setDraft({ ...v, [k]: e.target.value })} /></Field>
  );
  return (
    <Card className="max-w-xl space-y-4 p-5">
      <p className="text-sm text-muted">{t('library.settingsNote')}</p>
      <div className="grid gap-3 sm:grid-cols-3">{field('loanDays', t('library.loanDays'))}{field('finePerDay', t('library.finePerDay'))}{field('maxBooksStudent', t('library.maxBooks'))}</div>
      {edit && <Button disabled={!parsed || draft === null} loading={save.isPending} onClick={() => parsed && save.mutate(parsed, { onSuccess: () => { toast.success(t('library.settingsSaved')); setDraft(null); }, onError: (e) => toast.error(t('platform.errors.generic'), platformError(t, e)) })}>{t('library.save')}</Button>}
    </Card>
  );
}

function BooksTab() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [category, setCategory] = useState('');
  const [available, setAvailable] = useState(false);
  const [retired, setRetired] = useState(false);
  const [adding, setAdding] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const books = useBooks({ category, available, includeInactive: retired });
  const columns: Column<Book>[] = [
    { key: 'title', header: t('library.bookTitle'), sortValue: (b) => b.title, cell: (b) => <button type="button" className="text-start font-semibold text-brand-700 hover:underline" onClick={() => setOpenId(b.id)}>{b.title}{!b.active ? <Badge tone="neutral" className="ms-2">{t('library.retired')}</Badge> : null}</button> },
    { key: 'author', header: t('library.author'), sortValue: (b) => b.author, cell: (b) => b.author },
    { key: 'category', header: t('library.category'), sortValue: (b) => b.category ?? '', cell: (b) => b.category ?? '—' },
    { key: 'location', header: t('library.location'), sortValue: (b) => b.location ?? '', cell: (b) => b.location ?? '—' },
    { key: 'avail', header: t('library.available'), sortValue: (b) => b.counts.available, cell: (b) => <Badge tone={b.counts.available > 0 ? 'success' : 'warning'}><span dir="ltr">{b.counts.available} / {b.counts.total}</span></Badge> },
  ];
  return (
    <div>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field id="bl-cat" label={t('library.category')}>
          <Select id="bl-cat" value={category} onChange={(e) => setCategory(e.target.value)}>
            <option value="">{t('library.allCategories')}</option>{(books.data?.categories ?? []).map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
        </Field>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={available} onChange={(e) => setAvailable(e.target.checked)} />{t('library.onlyAvailable')}</label>
        <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={retired} onChange={(e) => setRetired(e.target.checked)} />{t('library.showRetired')}</label>
        {can('library.manage') && <Button className="self-end" onClick={() => setAdding(true)}><Plus className="size-4" aria-hidden />{t('library.addBook')}</Button>}
      </div>
      <DataTable columns={columns} rows={books.data?.books ?? []} rowKey={(b) => b.id} pageSize={15} searchText={(b) => `${b.title} ${b.author} ${b.isbn ?? ''} ${b.category ?? ''}`}
        loading={books.isLoading} error={books.error ? platformError(t, books.error) : null} onRetry={() => void books.refetch()} emptyTitle={t('library.booksEmptyTitle')} emptyDescription={t('library.booksEmptyBody')} />
      {books.data?.truncated ? <p className="mt-2 text-xs text-muted">{t('library.truncated')}</p> : null}
      {adding ? <BookFormModal onClose={() => setAdding(false)} /> : null}
      {openId ? <BookDetailModal id={openId} onClose={() => setOpenId(null)} /> : null}
    </div>
  );
}

export default function LibraryPage() {
  const { t, i18n } = useTranslation();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('books');
  const s = useLibrarySummary().data;
  const tabs: Tab[] = ['books', 'loans', 'settings'];
  const chip = (label: string, value: string | number, warn = false) => (
    <Card key={label} className="p-4"><p className="text-xs text-muted">{label}</p><p className={cn('text-xl font-extrabold', warn ? 'text-rose-700' : 'text-navy-900')} dir="ltr">{value}</p></Card>
  );
  return (
    <div className="space-y-5">
      <PageHeader title={t('library.title')} subtitle={t('library.subtitle')} />
      {s && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {chip(t('library.books'), s.books)}{chip(t('library.available'), `${s.available} / ${s.copies}`)}{chip(t('library.issuedNow'), s.issued)}
          {chip(t('library.overdue'), s.overdue, s.overdue > 0)}{chip(t('library.unpaidFines'), fmtMoney(s.unpaidFines.amount, i18n.language), s.unpaidFines.amount > 0)}
        </div>
      )}
      <nav aria-label={t('library.sections')} className="flex gap-1 overflow-x-auto rounded-card bg-white p-1 ring-1 ring-line">
        {tabs.filter((x) => x !== 'settings' || can('library.read')).map((x) => (
          <button key={x} type="button" aria-current={tab === x ? 'page' : undefined} onClick={() => setTab(x)}
            className={cn('whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold', tab === x ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>{t(`library.tabs.${x}`)}</button>
        ))}
      </nav>
      {tab === 'books' && <BooksTab />}
      {tab === 'loans' && <LoansTab />}
      {tab === 'settings' && <SettingsTab />}
    </div>
  );
}
