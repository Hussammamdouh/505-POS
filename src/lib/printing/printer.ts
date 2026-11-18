import { kvGet, kvSet } from '../db';
import type { LocalOrder } from '../localOrder';
import type { DeviceSettings } from '../settings';
import type { PrintingOptions, ShiftReport } from '../types';
import { buildReceipt, buildTestPage } from './documents';
import { buildShiftReport } from './shiftReport';
import { sendToPrinter } from './transport';

const PRINT_OPTIONS_KEY = 'printing-options';

const FALLBACK_OPTIONS: PrintingOptions = {
  businessName: 'Cafe',
  addressLines: [],
  phone: null,
  receiptFooter: 'Thank you!',
  lineWidth: 48,
};

export const cachePrintingOptions = (options: PrintingOptions) => kvSet(PRINT_OPTIONS_KEY, options);

export const loadPrintingOptions = async (): Promise<PrintingOptions> =>
  (await kvGet<PrintingOptions>(PRINT_OPTIONS_KEY)) ?? FALLBACK_OPTIONS;

const send = (settings: DeviceSettings, bytes: Uint8Array) => sendToPrinter(settings.printerHost.trim(), settings.printerPort, bytes);

/** Prints the order's one receipt, which serves both the customer and the staff making it. */
export async function printOrderReceipt(settings: DeviceSettings, order: LocalOrder, reprint = false) {
  await send(settings, buildReceipt(order, await loadPrintingOptions(), reprint).bytes);
}

export async function printShiftReportData(settings: DeviceSettings, report: ShiftReport) {
  await send(settings, buildShiftReport(report, await loadPrintingOptions()).bytes);
}

export async function printTestPage(settings: DeviceSettings) {
  await send(settings, buildTestPage(await loadPrintingOptions(), settings.deviceLetter).bytes);
}
