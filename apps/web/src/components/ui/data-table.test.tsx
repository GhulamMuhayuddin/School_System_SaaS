import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/i18n';
import { DataTable, type Column } from './data-table';

interface Row { id: string; name: string }
const rows: Row[] = [{ id: '1', name: 'Zara' }, { id: '2', name: 'Ali' }, { id: '3', name: 'Bilal' }];
const columns: Column<Row>[] = [{ key: 'name', header: 'Name', cell: (r) => r.name, sortValue: (r) => r.name }];

describe('DataTable', () => {
  it('filters rows by search text', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} searchText={(r) => r.name} />);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'ali' } });
    expect(screen.getByText('Ali')).toBeInTheDocument();
    expect(screen.queryByText('Zara')).not.toBeInTheDocument();
  });
  it('sorts ascending when the header is clicked', () => {
    render(<DataTable columns={columns} rows={rows} rowKey={(r) => r.id} />);
    fireEvent.click(screen.getByRole('button', { name: 'Name' }));
    const cells = screen.getAllByRole('cell').map((c) => c.textContent);
    expect(cells).toEqual(['Ali', 'Bilal', 'Zara']);
  });
  it('shows the empty state when there are no rows', () => {
    render(<DataTable columns={columns} rows={[]} rowKey={(r) => r.id} />);
    expect(screen.getByText('No records yet')).toBeInTheDocument();
  });
});
