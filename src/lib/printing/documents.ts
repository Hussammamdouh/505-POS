import { formatReceiptTime } from '../businessDay';
import { balanceDue, type LocalOrder, type LocalOrderLine } from '../localOrder';
import { formatMoney, type Piastres } from '../money';
import type { OrderChannel, PaymentMethod, PrintingOptions } from '../types';
import { ReceiptCanvas } from './raster';
import { RECEIPT_FONTS } from './receiptFonts.generated';
import { RECEIPT_IMAGES } from './receiptImages.generated';

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  CASH: 'Cash',
  VISA: 'Visa',
  INSTAPAY: 'InstaPay',
  VODAFONE_CASH: 'Vodafone Cash',
  TALABAT_CASH: 'Talabat Cash',
  TALABAT_VISA: 'Talabat Visa',
  WEBSITE_CASH: 'Website Cash',
};

export const METHODS_BY_CHANNEL: Record<OrderChannel, PaymentMethod[]> = {
  // Talabat Cash / Visa let the register ring up Talabat orders until the Talabat relay is live.
  POS: ['CASH', 'VISA', 'INSTAPAY', 'VODAFONE_CASH', 'TALABAT_CASH', 'TALABAT_VISA'],
  WEB: ['WEBSITE_CASH'],
  TALABAT: ['TALABAT_CASH', 'TALABAT_VISA'],
};

export const isTalabat = (method: PaymentMethod) => method === 'TALABAT_CASH' || method === 'TALABAT_VISA';

export const isDrawerCash = (method: PaymentMethod) => method === 'CASH' || method === 'WEBSITE_CASH';

const CHANNEL_PRINT_LABELS: Record<OrderChannel, string> = { POS: 'In-store', WEB: 'Website', TALABAT: 'Talabat' };

const { small, body, bodyBold, large, huge } = RECEIPT_FONTS;

/** Width of the quantity column; item names start here. */
const ITEM_INDENT = 46;
const ADDON_INDENT = 66;
/** Space kept clear at the paper edges, in dots. */
const SIDE = 8;

const egp = (amount: Piastres) => `EGP ${formatMoney(amount)}`;

/**
 * The order number for the day ("Order# 24" for POS-024). Offline orders don't have one until
 * they sync, so they show their offline code (A03 for OFF-A03) instead.
 */
export function orderNumberLabel(order: LocalOrder): string {
  const daily = /^[A-Z]+-(\d+)$/.exec(order.displayCode);
  if (daily && order.offlineCode !== order.displayCode) {
    return String(Number(daily[1]));
  }

  return order.displayCode.replace(/^OFF-/, '');
}

// One receipt per order, used by both the customer and the staff making the drinks. It is drawn
// on the iPad from bundled fonts and logos plus cached options, so it prints over the LAN even
// when the internet (and the server) is down.
export function buildReceipt(order: LocalOrder, options: PrintingOptions, reprint = false) {
  const canvas = new ReceiptCanvas(options.lineWidth * 12);
  printHeader(canvas, order);

  const contact = [...options.addressLines, options.phone ? `Tel ${options.phone}` : null].filter((part) => part).join('  •  ');
  if (contact) {
    canvas.gap(12).text(contact, small, { align: 'center' });
  }

  if (reprint) {
    canvas.gap(14).bar(`REPRINT  ${formatReceiptTime(new Date().toISOString())}`, bodyBold, 2);
  }

  if (order.isCancelled) {
    canvas.gap(14).bar('CANCELLED', large, 2);
  }

  const ref = order.offlineCode && order.offlineCode !== order.displayCode ? `${order.displayCode} (${order.offlineCode})` : order.displayCode;
  canvas.rule('dashed', 16).row(order.cashierName ? `Cashier: ${order.cashierName}` : '', `Ref ${ref}`, small);
  if (order.customerName) {
    canvas.text(`Customer: ${order.customerName}`, bodyBold);
  }

  canvas.rule('solid', 16).row('Qty   Item', 'Price', small).gap(8);
  order.lines.forEach((line, index) => {
    // A thin dotted line between drinks keeps each one with its add-ons.
    if (index > 0) {
      canvas.rule('dotted', 10);
    }

    printLine(canvas, line);
  });

  if (order.orderNotes) {
    canvas.gap(18).bar(`NOTE: ${order.orderNotes}`, bodyBold, 6);
  }

  const count = order.lines.reduce((sum, line) => sum + line.quantity, 0);
  canvas.rule('solid', 16).row(`Subtotal (${count} ${count === 1 ? 'item' : 'items'})`, egp(order.subtotal), body);
  if (order.discount > 0) {
    canvas.row(order.discountLabel ? `Discount (${order.discountLabel})` : 'Discount', `-${egp(order.discount)}`, body);
  }

  canvas.gap(6).row('Total', egp(order.netAmountDue), large).gap(order.payments.length > 0 ? 12 : 0);
  for (const payment of order.payments) {
    canvas.row(`Paid - ${PAYMENT_LABELS[payment.method]}`, egp(payment.amount), bodyBold);
    if (payment.amountTendered !== null) {
      canvas.row(`Received ${formatMoney(payment.amountTendered)}`, `Change ${formatMoney(payment.changeGiven)}`, small);
    }
  }

  for (const refund of order.refunds ?? []) {
    canvas.row(`Refund - ${PAYMENT_LABELS[refund.method]}`, `-${egp(refund.amount)}`, body);
  }

  const due = balanceDue(order);
  if (due > 0 && !order.isCancelled) {
    canvas.gap(14).bar(`NOT PAID - ${egp(due)} DUE`, bodyBold, 4);
  }

  printFooter(canvas, options);
  return { bytes: canvas.toEscPos() };
}

/** Logo on the left; the order number for the day, order type and time on the right. */
function printHeader(canvas: ReceiptCanvas, order: LocalOrder) {
  const channel = order.channel ?? 'POS';
  const logo = RECEIPT_IMAGES.headerLogo;
  const top = canvas.y;
  const left = SIDE + logo.width + 20;
  const right = canvas.width - SIDE;
  canvas.drawImage(logo, SIDE, top);

  const labelHeight = canvas.lineHeight(bodyBold);
  canvas.drawCentered('ORDER', bodyBold, left, right, top + 4);
  canvas.drawCentered(orderNumberLabel(order), huge, left, right, top + labelHeight - 4);

  let y = top + labelHeight + canvas.lineHeight(huge) + 2;
  if (channel === 'POS') {
    canvas.drawCentered(CHANNEL_PRINT_LABELS[channel], bodyBold, left, right, y);
    y += labelHeight;
  } else {
    // Delivery orders get an outlined label so staff spot them.
    canvas.roundedBox(left, y, right - left, labelHeight + 8, false);
    canvas.drawCentered(CHANNEL_PRINT_LABELS[channel].toUpperCase(), bodyBold, left, right, y + 4);
    y += labelHeight + 12;
  }

  canvas.drawCentered(formatReceiptTime(order.createdAt), small, left, right, y);
  y += canvas.lineHeight(small);
  canvas.y = Math.max(top + logo.height, y);
}

/** The mascot with the thank-you beside it, centred together; the optional QR code goes beneath. */
function printFooter(canvas: ReceiptCanvas, options: PrintingOptions) {
  const art = RECEIPT_IMAGES.footerArt;
  const spacing = 16;
  canvas.rule('dashed', 18);

  const maxTextWidth = canvas.width - SIDE * 2 - art.width - spacing;
  const lines = options.receiptFooter ? canvas.wrap(options.receiptFooter, bodyBold, maxTextWidth) : [];
  const textWidth = Math.max(0, ...lines.map((line) => canvas.measure(line, bodyBold)));
  const groupLeft = Math.round((canvas.width - art.width - (textWidth > 0 ? spacing + textWidth : 0)) / 2);
  const top = canvas.y;
  canvas.drawImage(art, groupLeft, top);

  const textLeft = groupLeft + art.width + spacing;
  const lineHeight = canvas.lineHeight(bodyBold);
  let y = top + Math.max(0, Math.round((art.height - lines.length * lineHeight) / 2));
  for (const line of lines) {
    canvas.drawCentered(line, bodyBold, textLeft, textLeft + textWidth, y);
    y += lineHeight;
  }

  canvas.y = top + art.height;
  if (options.qrUrl) {
    const qrSize = canvas.qrCodeSize(options.qrUrl, 4);
    canvas.gap(14);
    canvas.drawQrCode(options.qrUrl, Math.round((canvas.width - qrSize) / 2), canvas.y, 4);
    canvas.gap(qrSize + 4);
    if (options.qrCaption) {
      canvas.text(options.qrCaption, small, { align: 'center' });
    }
  }
}

function printLine(canvas: ReceiptCanvas, line: LocalOrderLine) {
  canvas.drawText(String(line.quantity), 14, canvas.y, bodyBold);
  canvas.row(line.name, formatMoney(line.totalLinePrice), bodyBold, { indent: ITEM_INDENT });

  // Add-on prices are per drink; the line price above already includes them.
  for (const modifier of line.modifiers) {
    canvas.row(`+ ${modifier.name}`, modifier.extraPrice > 0 ? `+${formatMoney(modifier.extraPrice)}` : '', small, {
      indent: ADDON_INDENT,
      hang: 18,
    });
  }

  if (line.isFreeLoyaltyItem) {
    canvas.text('1 free - loyalty card', bodyBold, { indent: ADDON_INDENT });
  }
}

export function buildTestPage(options: PrintingOptions, deviceLetter: string) {
  const sample: LocalOrder = {
    id: 'test',
    displayCode: 'POS-024',
    offlineCode: null,
    createdAt: new Date().toISOString(),
    cashierId: '',
    cashierName: `Printer test - iPad ${deviceLetter}`,
    customerName: null,
    orderNotes: null,
    lines: [
      {
        name: 'Iced Spanish latte',
        quantity: 2,
        unitBasePrice: 16000,
        modifiers: [
          { name: 'Oat milk', extraPrice: 5000 },
          { name: 'Caramel', extraPrice: 4000 },
        ],
        totalLinePrice: 50000,
        isFreeLoyaltyItem: false,
      },
      { name: 'Water', quantity: 1, unitBasePrice: 2500, modifiers: [], totalLinePrice: 2500, isFreeLoyaltyItem: false },
    ],
    subtotal: 52500,
    discount: 0,
    netAmountDue: 52500,
    payments: [{ method: 'CASH', amount: 52500, amountTendered: 60000, changeGiven: 7500 }],
    isCancelled: false,
  };

  return buildReceipt(sample, options);
}
