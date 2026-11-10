import '@/i18n';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { PeriodDto } from './academics-api';
import { TimetableGrid, visibleDays } from './timetable-grid';

const periods: PeriodDto[] = [
  { id: 'p1', name: 'Period 1', startTime: '08:00', endTime: '08:40', sortOrder: 1, isBreak: false },
  { id: 'b', name: 'Break', startTime: '08:40', endTime: '09:00', sortOrder: 2, isBreak: true },
];

describe('visibleDays', () => {
  it('shows Monday-Saturday and adds Sunday only when a lesson is on it', () => {
    expect(visibleDays([])).toEqual([1, 2, 3, 4, 5, 6]);
    expect(visibleDays([1, 7])).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });
});

describe('TimetableGrid', () => {
  it('renders lessons read-only, with the break as one wide row and no buttons', () => {
    render(<TimetableGrid periods={periods} days={[1, 2]} cell={(d, p) => (d === 1 && p.id === 'p1' ? <span>Maths</span> : null)} />);
    expect(screen.getByText('Maths')).toBeInTheDocument();
    expect(screen.getByText('08:00 – 08:40')).toBeInTheDocument();
    expect(screen.getByText('Break', { selector: 'td' })).toHaveAttribute('colspan', '2');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('turns cells into labelled buttons when editing is allowed', async () => {
    const onClick = vi.fn();
    render(<TimetableGrid periods={periods} days={[1]} cell={() => null} onCellClick={onClick} />);
    await userEvent.click(screen.getByRole('button', { name: 'Monday, Period 1' }));
    expect(onClick).toHaveBeenCalledWith(1, periods[0]);
    expect(screen.getAllByRole('button')).toHaveLength(1); // the break row has no button
  });
});
