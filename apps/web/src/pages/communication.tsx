import { Megaphone, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { ConfirmDialog } from '@/components/ui/modal';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/states';
import { useToast } from '@/components/ui/toast';
import { useAuth } from '@/features/auth/auth-context';
import { ComposeModal } from '@/features/communication/communication-modals';
import { statusTone, useInbox, useMarkAllRead, useMarkRead, useSent, useWithdraw, type Announcement, type SentAnnouncement } from '@/features/communication/communication-api';
import { PageHeader, fmtDate, platformError } from '@/features/platform/common';
import { cn } from '@/lib/cn';

type Tab = 'inbox' | 'send';

function audienceLabel(t: (k: string, o?: Record<string, unknown>) => string, a: { audience: string; className: string | null }): string {
  return a.audience === 'CLASS' ? t('communication.classAudience', { name: a.className ?? '—' }) : t(`communication.audiences.${a.audience}`);
}

function Inbox() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [unreadOnly, setUnreadOnly] = useState(false);
  const inbox = useInbox(unreadOnly);
  const markRead = useMarkRead();
  const markAll = useMarkAllRead();
  const fail = (e: unknown) => toast.error(t('platform.errors.generic'), platformError(t, e));
  if (inbox.isLoading) return <Spinner />;
  if (inbox.error || !inbox.data) return <ErrorState title={t('platform.errors.generic')} description={inbox.error ? platformError(t, inbox.error) : undefined} onRetry={() => void inbox.refetch()} />;
  const { announcements, unread } = inbox.data;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4">
        <p className="text-sm font-semibold text-navy-900" aria-live="polite">{unread > 0 ? t('communication.unreadCount', { count: unread }) : t('communication.allRead')}</p>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />{t('communication.unreadOnly')}</label>
        {unread > 0 ? <Button size="sm" variant="secondary" onClick={() => void markAll.mutateAsync().catch(fail)} loading={markAll.isPending}>{t('communication.markAll')}</Button> : null}
      </div>
      {announcements.length === 0 ? <EmptyState title={t('communication.inboxEmptyTitle')} description={t('communication.inboxEmptyBody')} /> : (
        <ul className="space-y-3">
          {announcements.map((a: Announcement) => (
            <li key={a.id}>
              <Card className={cn('space-y-2 p-4', !a.read && 'ring-2 ring-brand-200')}>
                <div className="flex flex-wrap items-center gap-2">
                  <h3 className={cn('text-base text-navy-900', a.read ? 'font-semibold' : 'font-extrabold')}>{a.title}</h3>
                  {!a.read ? <Badge tone="brand">{t('communication.new')}</Badge> : null}
                  {a.priority === 'IMPORTANT' ? <Badge tone="danger">{t('communication.priorities.IMPORTANT')}</Badge> : null}
                </div>
                <p className="whitespace-pre-wrap text-sm">{a.body}</p>
                <p className="text-xs text-muted">{audienceLabel(t, a)} · {a.author ?? t('communication.school')} · {fmtDate(a.publishedAt.slice(0, 10), i18n.language)}{a.expiresOn ? ` · ${t('communication.until', { date: fmtDate(a.expiresOn, i18n.language) })}` : ''}</p>
                {!a.read ? <Button size="sm" variant="ghost" onClick={() => void markRead.mutateAsync(a.id).catch(fail)}>{t('communication.markRead')}</Button> : null}
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Send() {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const [composing, setComposing] = useState(false);
  const [withdrawing, setWithdrawing] = useState<SentAnnouncement | null>(null);
  const sent = useSent(true);
  const withdraw = useWithdraw();
  const columns: Column<SentAnnouncement>[] = [
    { key: 'title', header: t('communication.title'), sortValue: (a) => a.title, cell: (a) => <span>{a.title}{a.priority === 'IMPORTANT' ? <Badge tone="danger">{t('communication.priorities.IMPORTANT')}</Badge> : null}<span className="block text-xs text-muted">{a.author ?? ''}</span></span> },
    { key: 'aud', header: t('communication.audience'), sortValue: (a) => a.audience, cell: (a) => audienceLabel(t, a) },
    { key: 'date', header: t('communication.published'), sortValue: (a) => a.publishedAt, cell: (a) => fmtDate(a.publishedAt.slice(0, 10), i18n.language) },
    { key: 'status', header: t('communication.status'), sortValue: (a) => a.status, cell: (a) => <Badge tone={statusTone(a.status)}>{t(`communication.statuses.${a.status}`)}</Badge> },
    { key: 'reads', header: t('communication.readBy'), sortValue: (a) => a.readCount, cell: (a) => <span dir="ltr">{a.readCount}</span> },
    { key: 'x', header: '', sortValue: () => '', cell: (a) => (a.status === 'WITHDRAWN' ? null : <Button size="sm" variant="ghost" onClick={() => setWithdrawing(a)}>{t('communication.withdraw')}</Button>) },
  ];
  return (
    <div className="space-y-4">
      <div><Button onClick={() => setComposing(true)}><Plus className="size-4" aria-hidden />{t('communication.compose')}</Button></div>
      <DataTable columns={columns} rows={sent.data?.announcements ?? []} rowKey={(a) => a.id} pageSize={15} searchText={(a) => a.title}
        loading={sent.isLoading} error={sent.error ? platformError(t, sent.error) : null} onRetry={() => void sent.refetch()}
        emptyTitle={t('communication.sentEmptyTitle')} emptyDescription={t('communication.sentEmptyBody')} />
      {sent.data?.truncated ? <p className="text-xs text-muted">{t('communication.truncated')}</p> : null}
      {composing ? <ComposeModal onClose={() => setComposing(false)} /> : null}
      <ConfirmDialog open={withdrawing !== null} onOpenChange={(o) => !o && setWithdrawing(null)} danger loading={withdraw.isPending}
        title={t('communication.withdrawTitle')} description={withdrawing ? t('communication.withdrawBody', { title: withdrawing.title }) : undefined} confirmLabel={t('communication.withdraw')}
        onConfirm={() => { if (withdrawing) void withdraw.mutateAsync(withdrawing.id).then(() => { toast.success(t('communication.withdrawn')); setWithdrawing(null); }, (e) => { setWithdrawing(null); toast.error(t('platform.errors.generic'), platformError(t, e)); }); }} />
    </div>
  );
}

export default function CommunicationPage() {
  const { t } = useTranslation();
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('inbox');
  const tabs: Tab[] = can('communication.send') ? ['inbox', 'send'] : ['inbox'];
  return (
    <div className="space-y-5">
      <PageHeader title={t('communication.pageTitle')} subtitle={t('communication.subtitle')} />
      {tabs.length > 1 ? (
        <nav aria-label={t('communication.sections')} className="flex gap-1 overflow-x-auto rounded-card bg-white p-1 ring-1 ring-line">
          {tabs.map((x) => (
            <button key={x} type="button" aria-current={tab === x ? 'page' : undefined} onClick={() => setTab(x)}
              className={cn('flex items-center gap-2 whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold', tab === x ? 'bg-brand-600 text-white' : 'text-muted hover:bg-canvas')}>
              {x === 'send' ? <Megaphone className="size-4" aria-hidden /> : null}{t(`communication.tabs.${x}`)}
            </button>
          ))}
        </nav>
      ) : null}
      {tab === 'inbox' && <Inbox />}
      {tab === 'send' && <Send />}
    </div>
  );
}
