import { useState } from 'react';
import { useToast } from '@/components/ui/toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DataTable, type Column } from '@/components/ui/data-table';
import { Field, Input, Select, Textarea } from '@/components/ui/input';
import { ConfirmDialog, Modal } from '@/components/ui/modal';
import { EmptyState, ErrorState, Skeleton } from '@/components/ui/states';

// Sample rows exist ONLY on this internal showcase page to demonstrate the table. They are not school data.
interface SampleRow { id: string; name: string; className: string; status: 'Active' | 'Pending' | 'Withdrawn'; fee: number }
const SAMPLE: SampleRow[] = Array.from({ length: 23 }, (_, i) => ({
  id: String(i + 1),
  name: `Sample student ${i + 1}`,
  className: `Class ${(i % 10) + 1}`,
  status: (['Active', 'Pending', 'Withdrawn'] as const)[i % 3],
  fee: 2000 + (i % 5) * 500,
}));
const tone = { Active: 'success', Pending: 'warning', Withdrawn: 'neutral' } as const;
const columns: Column<SampleRow>[] = [
  { key: 'name', header: 'Name', cell: (r) => <span className="font-semibold">{r.name}</span>, sortValue: (r) => r.name },
  { key: 'class', header: 'Class', cell: (r) => r.className, sortValue: (r) => r.className },
  { key: 'status', header: 'Status', cell: (r) => <Badge tone={tone[r.status]}>{r.status}</Badge> },
  { key: 'fee', header: 'Monthly fee (PKR)', cell: (r) => r.fee.toLocaleString(), sortValue: (r) => r.fee, className: 'text-end' },
];

export default function DesignSystemPage() {
  const toast = useToast();
  const [modal, setModal] = useState(false);
  const [confirm, setConfirm] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-navy-900">Design system</h1>
        <p className="mt-1 text-sm text-muted">Reusable building blocks for every module. Sample data on this page is for demonstration only.</p>
      </div>

      <Card>
        <CardHeader title="Buttons and badges" />
        <div className="flex flex-wrap items-center gap-3 p-5">
          <Button>Save changes</Button>
          <Button variant="secondary">Cancel</Button>
          <Button variant="ghost">Skip</Button>
          <Button variant="danger">Delete record</Button>
          <Button loading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Badge tone="brand">New</Badge><Badge tone="success">Paid</Badge><Badge tone="warning">Due soon</Badge><Badge tone="danger">Overdue</Badge><Badge>Draft</Badge>
        </div>
      </Card>

      <Card>
        <CardHeader title="Form controls" />
        <div className="grid gap-5 p-5 sm:grid-cols-2">
          <Field id="ds-name" label="Student name" hint="As written on the birth certificate."><Input id="ds-name" placeholder="Full name" /></Field>
          <Field id="ds-class" label="Class"><Select id="ds-class"><option>Class 1</option><option>Class 2</option></Select></Field>
          <Field id="ds-bad" label="Phone number" error="Enter a valid phone number"><Input id="ds-bad" aria-invalid defaultValue="03" aria-describedby="ds-bad-error" /></Field>
          <Field id="ds-note" label="Notes"><Textarea id="ds-note" /></Field>
        </div>
      </Card>

      <Card>
        <CardHeader title="Data table" description="Search, sort and pagination." />
        <DataTable columns={columns} rows={SAMPLE} rowKey={(r) => r.id} searchText={(r) => `${r.name} ${r.className} ${r.status}`} pageSize={8} />
      </Card>

      <Card>
        <CardHeader title="Dialogs and messages" />
        <div className="flex flex-wrap gap-3 p-5">
          <Button variant="secondary" onClick={() => setModal(true)}>Open dialog</Button>
          <Button variant="danger" onClick={() => setConfirm(true)}>Confirm deletion</Button>
          <Button variant="secondary" onClick={() => toast.success('Student saved', 'The record was updated.')}>Success message</Button>
          <Button variant="secondary" onClick={() => toast.error('Could not save', 'Check the highlighted fields and try again.')}>Error message</Button>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card><CardHeader title="Loading" /><div className="space-y-3 p-5"><Skeleton className="h-6 w-2/3" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div></Card>
        <Card><CardHeader title="Empty" /><EmptyState title="No students yet" description="Add your first student to see them here." action={<Button size="sm">Add student</Button>} /></Card>
        <Card><CardHeader title="Error" /><ErrorState title="Could not load students" description="Check your connection and try again." onRetry={() => toast.info('Retrying…')} /></Card>
      </div>

      <Modal open={modal} onOpenChange={setModal} title="Add a note" description="Notes are visible to staff only." footer={<><Button variant="secondary" onClick={() => setModal(false)}>Cancel</Button><Button onClick={() => { setModal(false); toast.success('Note added'); }}>Save note</Button></>}>
        <Field id="ds-modal-note" label="Note"><Textarea id="ds-modal-note" /></Field>
      </Modal>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} danger title="Delete this record?" description="This cannot be undone." confirmLabel="Delete record" onConfirm={() => { setConfirm(false); toast.success('Record deleted'); }} />
    </div>
  );
}
