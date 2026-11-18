import { formatClock, formatReceiptTime } from '../businessDay';
import { formatMoney, toPiastres } from '../money';
import type { CashMovementType, OrderChannel, PrintingOptions, ShiftReport } from '../types';
import { PAYMENT_LABELS } from './documents';
import { ReceiptCanvas } from './raster';
import { RECEIPT_FONTS } from './receiptFonts.generated';
import { RECEIPT_IMAGES } from './receiptImages.generated';

const { small, body, bodyBold, large } = RECEIPT_FONTS;

const CHANNEL_LABELS: Record<OrderChannel, string> = { POS: 'In-house', TALABAT: 'Talabat', WEB: 'Website' };
const MOVEMENT_LABELS: Record<CashMovementType, string> = { CASH_DROP: 'Cash drop', PETTY_PAYOUT: 'Payout', STAFF_LOAN: 'Staff loan' };
const SIDE = 8;

const egp = (amount: number) => `EGP ${formatMoney(toPiastres(amount))}`;

function section(canvas: ReceiptCanvas, title: string) {
  canvas.gap(26).bar(title, bodyBold, 4).gap(12);
}

/** The end-of-shift report, drawn in the same style as the receipts. */
export function buildShiftReport(report: ShiftReport, options: PrintingOptions) {
  const canvas = new ReceiptCanvas(options.lineWidth * 12);

  // Logo on the left; the report title and staff member on the right.
  const logo = RECEIPT_IMAGES.headerLogo;
  const top = canvas.y;
  const left = SIDE + logo.width + 20;
  const right = canvas.width - SIDE;
  canvas.drawImage(logo, SIDE, top);
  const labelHeight = canvas.lineHeight(bodyBold);
  // The drawer is shared, so the box shows the date; who opened and closed it is listed below.
  const boxHeight = labelHeight + canvas.lineHeight(large) + 8;
  canvas.roundedBox(left, top + 4, right - left, boxHeight, true);
  canvas.drawCentered(report.isClosed ? 'SHIFT REPORT' : 'INTERIM REPORT', bodyBold, left, right, top + 10, true);
  canvas.drawCentered(formatReceiptTime(report.openedAt).split(' ')[0], large, left, right, top + 8 + labelHeight, true);
  canvas.y = Math.max(top + logo.height, top + boxHeight + 12);

  if (!report.isClosed) {
    canvas.gap(6).bar('SHIFT STILL OPEN', bodyBold, 2);
  }

  canvas.rule('dashed', 16);
  canvas.row(`Opened by ${report.staffName}`, formatReceiptTime(report.openedAt), small);
  canvas.row(report.closedByName ? `Closed by ${report.closedByName}` : 'Closed', report.closedAt ? formatReceiptTime(report.closedAt) : '-', small);

  const netSales = report.grossSales - report.discounts;
  section(canvas, 'SALES');
  canvas.row('Completed orders', String(report.completedOrders), body);
  canvas.row('Gross sales', egp(report.grossSales), body);
  if (report.discounts > 0) {
    canvas.row('Discounts', `-${egp(report.discounts)}`, body);
  }

  if (report.refundTotal > 0) {
    canvas.row('Refunds', `-${egp(report.refundTotal)}`, body);
  }

  canvas.gap(6).row('Net sales', egp(netSales - report.refundTotal), large);
  if (report.completedOrders > 0) {
    canvas.row('Average order', egp(netSales / report.completedOrders), small);
  }

  if (report.channels.length > 0) {
    canvas.rule('dotted', 12);
    for (const channel of report.channels) {
      canvas.row(`${CHANNEL_LABELS[channel.channel]} (${channel.orders})`, egp(channel.netSales), body);
    }
  }

  if (report.cashiers.length > 1) {
    section(canvas, 'BY CASHIER');
    for (const cashier of report.cashiers) {
      canvas.row(`${cashier.name} (${cashier.orders})`, egp(cashier.netSales), body);
    }
  }

  section(canvas, 'PAYMENTS');
  if (report.paymentMethods.length === 0) {
    canvas.text('No payments', small);
  }

  for (const method of report.paymentMethods) {
    canvas.row(PAYMENT_LABELS[method.method], egp(method.net), body);
    if (method.refunds > 0) {
      canvas.row(`Taken ${formatMoney(toPiastres(method.gross))}`, `Refunded ${formatMoney(toPiastres(method.refunds))}`, small, { indent: 20 });
    }
  }

  section(canvas, 'CASH DRAWER');
  canvas.row('Opening float', egp(report.openingFloat), body);
  canvas.row('Cash sales', `+${egp(report.cashSalesNet)}`, body);
  if (report.cashDrops > 0) {
    canvas.row('Cash drops', `-${egp(report.cashDrops)}`, body);
  }

  if (report.staffLoans > 0) {
    canvas.row('Staff loans', `-${egp(report.staffLoans)}`, body);
  }

  if (report.pettyPayouts > 0) {
    canvas.row('Payouts', `-${egp(report.pettyPayouts)}`, body);
  }

  canvas.gap(6).row('Expected in drawer', egp(report.expectedCash), bodyBold);
  if (report.countedCash !== null && report.cashVariance !== null) {
    canvas.row('Counted', egp(report.countedCash), bodyBold);
    const variance = report.cashVariance;
    const label = variance < 0 ? `SHORT ${egp(-variance)}` : variance > 0 ? `OVER ${egp(variance)}` : 'DRAWER BALANCED';
    canvas.gap(16).badge(label, large, variance !== 0, 24, 6);
  }

  // These lists only appear when something happened, so a quiet shift prints a short report.
  if (report.cashMovements.length > 0) {
    section(canvas, 'CASH TAKEN OUT');
    for (const movement of report.cashMovements) {
      canvas.row(`${formatClock(movement.createdAt)}  ${MOVEMENT_LABELS[movement.type]}`, egp(movement.amount), body);
      canvas.text(`${movement.reason} (by ${movement.authorizedBy})`, small, { indent: 20 }).gap(6);
    }
  }

  if (report.refunds.length > 0) {
    section(canvas, `REFUNDS (${report.refunds.length})`);
    for (const refund of report.refunds) {
      canvas.row(`${formatClock(refund.createdAt)}  ${refund.displayCode}  ${PAYMENT_LABELS[refund.method]}`, egp(refund.amount), body);
      canvas.text(`${refund.reason} (by ${refund.authorizedBy})`, small, { indent: 20 }).gap(6);
    }
  }

  if (report.cancellations.length > 0) {
    section(canvas, `CANCELLED ORDERS (${report.cancellations.length})`);
    for (const cancellation of report.cancellations) {
      canvas.row(`${formatClock(cancellation.createdAt)}  ${cancellation.displayCode}`, egp(cancellation.amount), body);
      canvas.text(`${cancellation.reason} (by ${cancellation.authorizedBy})`, small, { indent: 20 }).gap(6);
    }
  }

  if (report.notes) {
    section(canvas, 'NOTES');
    canvas.text(report.notes, body);
  }

  // Signed when the drawer is handed over.
  canvas.gap(56);
  const half = Math.round(canvas.width / 2);
  const lineY = canvas.y;
  canvas.fillRect(SIDE, lineY, half - SIDE - 16, 2);
  canvas.fillRect(half + 16, lineY, canvas.width - SIDE - half - 16, 2);
  canvas.drawCentered('Staff', small, SIDE, half - 16, lineY + 6);
  canvas.drawCentered('Manager', small, half + 16, canvas.width - SIDE, lineY + 6);
  canvas.gap(6 + canvas.lineHeight(small));

  canvas.gap(14).text(`Printed ${formatReceiptTime(new Date().toISOString())}`, small, { align: 'center' });
  return { bytes: canvas.toEscPos() };
}
