import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { formatReceiptTime } from '@/lib/businessDay';
import { loadShifts, loadStaffReport, type DateRange } from '@/lib/reports';
import type { ShiftListItem, StaffReportEvent, StaffReportRow } from '@/lib/types';
import { Panel } from '@/ui/admin/AdminKit';
import { Banner } from '@/ui/Banner';
import { DataTable, DateRangeBar, egp, presetRange, type Column } from '@/ui/reports/ReportKit';
import { useReport } from '@/ui/reports/useReport';
import { colors, font, space } from '@/ui/theme';

const loadStaffAndShifts = async (range: DateRange) => {
  const [report, shifts] = await Promise.all([loadStaffReport(range), loadShifts(range)]);
  return { report, shifts };
};

// A variance is shown signed: short (missing cash) is negative, over is positive.
const variance = (amount: number | null) => (amount === null ? '—' : amount === 0 ? '0.00' : `${amount > 0 ? '+' : '−'}${egp(Math.abs(amount))}`);

const STAFF_COLUMNS: Column<StaffReportRow>[] = [
  { title: 'Staff', render: (row) => `${row.fullName}${row.isActive ? '' : ' (inactive)'}` },
  { title: 'Orders', width: 70, numeric: true, render: (row) => String(row.ordersServed) },
  { title: 'Payments taken', width: 120, numeric: true, render: (row) => egp(row.paymentsTaken) },
  { title: 'Shifts', width: 60, numeric: true, render: (row) => String(row.shiftsClosed) },
  { title: 'Cash variance', width: 115, numeric: true, render: (row) => (row.shiftsClosed ? variance(row.totalCashVariance) : '—') },
  { title: 'Short shifts', width: 90, numeric: true, render: (row) => (row.shiftsClosed ? String(row.shortShifts) : '—') },
  { title: 'Refunds issued', width: 120, numeric: true, render: (row) => (row.refundsIssued ? `${row.refundsIssued} · ${egp(row.refundsIssuedAmount)}` : '—') },
  {
    title: 'Approved',
    width: 190,
    numeric: true,
    render: (row) =>
      [
        row.refundsApproved && `${row.refundsApproved} refund${row.refundsApproved > 1 ? 's' : ''}`,
        row.cancellationsApproved && `${row.cancellationsApproved} cancel${row.cancellationsApproved > 1 ? 's' : ''}`,
        row.cashMovementsApproved && `${row.cashMovementsApproved} cash out`,
      ]
        .filter(Boolean)
        .join(' · ') || '—',
  },
];

const SHIFT_COLUMNS: Column<ShiftListItem>[] = [
  { title: 'Opened', width: 150, render: (shift) => formatReceiptTime(shift.openedAt) },
  { title: 'Closed', width: 150, render: (shift) => (shift.closedAt ? formatReceiptTime(shift.closedAt) : 'Still open') },
  { title: 'Staff', render: (shift) => shift.staffName },
  { title: 'Net sales', width: 110, numeric: true, render: (shift) => egp(shift.totals.allMethods.net) },
  { title: 'Expected cash', width: 115, numeric: true, render: (shift) => (shift.expectedCashAtClose === null ? '—' : egp(shift.expectedCashAtClose)) },
  { title: 'Counted', width: 100, numeric: true, render: (shift) => (shift.countedCashAtClose === null ? '—' : egp(shift.countedCashAtClose)) },
  { title: 'Variance', width: 100, numeric: true, render: (shift) => variance(shift.cashVariance) },
];

const EVENT_COLUMNS: Column<StaffReportEvent>[] = [
  { title: 'When', width: 150, render: (event) => formatReceiptTime(event.occurredAt) },
  { title: 'What', width: 110, render: (event) => (event.kind === 'REFUND' ? 'Refund' : 'Cancellation') },
  { title: 'Order', width: 90, render: (event) => event.orderDisplayCode ?? '—' },
  { title: 'Amount', width: 90, numeric: true, render: (event) => (event.amount === null ? '—' : egp(event.amount)) },
  { title: 'Reason', render: (event) => event.reason ?? '—' },
  { title: 'Done by', width: 130, render: (event) => event.requestedByName ?? '—' },
  { title: 'Approved by', width: 130, render: (event) => event.approvedByName },
];

// Reports → Shifts: every shift in the period, who handled the drawer, and refunds/cancellations with who approved them.
export default function ShiftsReportScreen() {
  const [range, setRange] = useState<DateRange>(presetRange('week'));
  const { data, error, loading } = useReport(loadStaffAndShifts, range);

  const shortShifts = data?.shifts.filter((shift) => (shift.cashVariance ?? 0) < 0) ?? [];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <DateRangeBar initial="week" onChange={setRange} />
      {error ? <Banner tone="danger" message={error} /> : null}
      {loading && !data ? <Text style={styles.muted}>Loading…</Text> : null}
      {shortShifts.length > 0 ? (
        <Banner
          tone="warning"
          message={`${shortShifts.length} shift${shortShifts.length > 1 ? 's were' : ' was'} short on cash in this period, ${egp(
            Math.abs(shortShifts.reduce((sum, shift) => sum + (shift.cashVariance ?? 0), 0)),
          )} EGP in total.`}
        />
      ) : null}

      {data ? (
        <View style={[styles.content, loading && styles.stale]}>
          <Panel title="Shifts (EGP)" scroll={false}>
            <DataTable
              columns={SHIFT_COLUMNS}
              rows={data.shifts}
              rowKey={(shift) => shift.id}
              emptyMessage="No shifts opened in this period."
            />
          </Panel>
          <Panel title="Cash handling by staff member (EGP)" scroll={false}>
            <DataTable columns={STAFF_COLUMNS} rows={data.report.staff} rowKey={(row) => row.staffId} emptyMessage="No staff activity in this period." />
          </Panel>
          <Panel title="Refunds & cancellations" scroll={false}>
            <DataTable
              columns={EVENT_COLUMNS}
              rows={data.report.events}
              rowKey={(event) => `${event.kind}-${event.occurredAt}-${event.orderDisplayCode}`}
              emptyMessage="No refunds or cancellations in this period."
            />
          </Panel>
          <Text style={styles.muted}>
            Cash variance is counted cash minus expected cash at close: − means cash was missing, + means extra. Approvals show who
            entered their manager PIN.
          </Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { gap: space.md, paddingBottom: space.xl },
  stale: { opacity: 0.5 },
  muted: { fontSize: font.small, color: colors.textMuted },
});
