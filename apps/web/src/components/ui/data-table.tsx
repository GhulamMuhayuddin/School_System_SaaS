import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/cn';
import { Button } from './button';
import { Input } from './input';
import { EmptyState, ErrorState, Skeleton } from './states';

export interface Column<T> {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  /** Provide a sort value to make this column sortable. */
  sortValue?: (row: T) => string | number;
  className?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  /** Text used for the search box. Omit to hide search. */
  searchText?: (row: T) => string;
  pageSize?: number;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  toolbar?: ReactNode;
}

type Sort = { key: string; dir: 'asc' | 'desc' } | null;

/** Client-side table with search, sorting and pagination. Server-driven mode is added with the first API-backed module. */
export function DataTable<T>({
  columns, rows, rowKey, searchText, pageSize = 10, loading, error, onRetry, emptyTitle, emptyDescription, toolbar,
}: DataTableProps<T>) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>(null);
  const [page, setPage] = useState(1);

  const processed = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = q && searchText ? rows.filter((r) => searchText(r).toLowerCase().includes(q)) : rows;
    const col = sort && columns.find((c) => c.key === sort.key);
    if (sort && col?.sortValue) {
      const get = col.sortValue;
      const factor = sort.dir === 'asc' ? 1 : -1;
      list = [...list].sort((a, b) => {
        const x = get(a);
        const y = get(b);
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * factor;
        return String(x).localeCompare(String(y)) * factor;
      });
    }
    return list;
  }, [rows, query, sort, columns, searchText]);

  const pageCount = Math.max(1, Math.ceil(processed.length / pageSize));
  const current = Math.min(page, pageCount);
  const start = (current - 1) * pageSize;
  const visible = processed.slice(start, start + pageSize);

  const toggleSort = (key: string) => {
    setSort((s) => (s?.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : null));
    setPage(1);
  };

  return (
    <div>
      {(searchText || toolbar) && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          {searchText ? (
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => { setQuery(e.target.value); setPage(1); }}
                placeholder={t('table.search')}
                aria-label={t('table.search')}
                className="ps-9"
              />
            </div>
          ) : <span />}
          {toolbar}
        </div>
      )}

      {error ? (
        <ErrorState title={t('table.error')} description={error} onRetry={onRetry} />
      ) : loading ? (
        <div className="space-y-3 p-5" role="status" aria-label={t('common.loading')}>
          {Array.from({ length: 5 }, (_, i) => <Skeleton key={i} className="h-9 w-full" />)}
        </div>
      ) : processed.length === 0 ? (
        rows.length === 0
          ? <EmptyState title={emptyTitle ?? t('table.empty')} description={emptyDescription} />
          : <EmptyState title={t('table.noMatch')} description={t('table.noMatchBody')} />
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-start text-sm">
              <thead>
                <tr className="border-b border-line bg-canvas/70">
                  {columns.map((c) => {
                    const active = sort?.key === c.key;
                    return (
                      <th
                        key={c.key}
                        scope="col"
                        aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : undefined}
                        className={cn('px-5 py-3 text-start font-semibold text-navy-900', c.className)}
                      >
                        {c.sortValue ? (
                          <button type="button" onClick={() => toggleSort(c.key)} className="inline-flex items-center gap-1.5 hover:text-brand-700">
                            {c.header}
                            {active && (sort.dir === 'asc' ? <ArrowUp className="size-3.5" aria-hidden /> : <ArrowDown className="size-3.5" aria-hidden />)}
                          </button>
                        ) : c.header}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={rowKey(row)} className="border-b border-line/70 last:border-0 hover:bg-brand-50/40">
                    {columns.map((c) => (
                      <td key={c.key} className={cn('px-5 py-3 text-ink', c.className)}>{c.cell(row)}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-3">
            <p className="text-sm text-muted">
              {t('table.showing', { from: start + 1, to: Math.min(start + pageSize, processed.length), total: processed.length })}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={current <= 1} onClick={() => setPage(current - 1)}>
                <ChevronLeft className="size-4 rtl:rotate-180" aria-hidden />
                {t('table.previous')}
              </Button>
              <Button size="sm" variant="secondary" disabled={current >= pageCount} onClick={() => setPage(current + 1)}>
                {t('table.next')}
                <ChevronRight className="size-4 rtl:rotate-180" aria-hidden />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
