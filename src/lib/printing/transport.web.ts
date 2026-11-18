// Web build printing. A browser can't open a raw TCP socket, but it can POST to the printer's raw port
// (9100): the printer treats every byte it receives as print data. Two side effects of that trick:
//  - The HTTP request line and headers arrive first and print as a few lines of text. The body therefore
//    starts by feeding that text past the cutter and cutting it off as a small scrap slip, so the real
//    receipt that follows comes out clean.
//  - The printer never answers HTTP, so the request never "finishes". Once the bytes have had time to
//    reach it, the request is aborted, which closes the connection and frees the printer for the next job.
// This only works when the page itself is opened over http:// — Safari blocks http requests from an
// https page (mixed content). We can't see whether the printer accepted the data, only whether the
// connection failed.

const ESC = 0x1b;
const GS = 0x1d;

// ESC @ resets the printer, ESC d 3 feeds the header text past the cutter, GS V 66 0 partial-cuts it off.
// (Tried and failed on the Xprinter XP-K200L: ESC = 0 and page mode left set after a job to swallow the next
// job's header text. The printer appears to reset on every new connection, so the scrap slip stays.)
const CUT_AWAY_REQUEST_TEXT = new Uint8Array([ESC, 0x40, ESC, 0x64, 0x03, GS, 0x56, 0x42, 0x00]);

// Time allowed for the bytes to reach the printer before the connection is closed. The printer slows the
// upload while it prints (its buffer is small), so longer receipts get more time.
const BASE_SEND_MS = 2500;
const MS_PER_KILOBYTE = 25;
const MAX_SEND_MS = 15000;

export class PrinterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrinterError';
  }
}

let queue: Promise<void> = Promise.resolve();

// One job at a time: the printer accepts one connection on port 9100 and refuses others while busy.
export function sendToPrinter(host: string, port: number, bytes: Uint8Array): Promise<void> {
  if (!host) {
    return Promise.reject(new PrinterError('No printer is set up. Add its IP address in Settings.'));
  }

  if (globalThis.location?.protocol === 'https:') {
    return Promise.reject(
      new PrinterError('The browser blocks printing from an https:// page. Open the register using its http:// address.'),
    );
  }

  const job = queue.then(() => sendOnce(host, port, bytes));
  queue = job.catch(() => undefined);
  return job;
}

async function sendOnce(host: string, port: number, bytes: Uint8Array): Promise<void> {
  const controller = new AbortController();
  const sendMs = Math.min(MAX_SEND_MS, BASE_SEND_MS + (bytes.length / 1024) * MS_PER_KILOBYTE);
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, sendMs);

  try {
    // no-cors keeps this a "simple" request: no CORS preflight (an OPTIONS request would print too and then
    // fail), and the opaque response is fine because the printer never sends one. Every option here is
    // chosen to keep the printed header text short: a bare Uint8Array body sends no Content-Type line,
    // no-referrer drops Referer, and there is deliberately no `cache` option (no-store/reload make the
    // browser add Cache-Control and Pragma lines; a POST is never cached anyway).
    const body = new Uint8Array(CUT_AWAY_REQUEST_TEXT.length + bytes.length);
    body.set(CUT_AWAY_REQUEST_TEXT, 0);
    body.set(bytes, CUT_AWAY_REQUEST_TEXT.length);
    await fetch(`http://${host}:${port}/`, {
      method: 'POST',
      mode: 'no-cors',
      credentials: 'omit',
      referrerPolicy: 'no-referrer',
      body,
      signal: controller.signal,
    });
  } catch (error) {
    if (timedOut) {
      // Expected path: the bytes went out and we closed the connection ourselves.
      return;
    }

    throw new PrinterError(
      `Can't reach the printer at ${host}:${port}. Check it is on and connected to the router, then look at the printer before trying again — part of the receipt may have printed. (${(error as Error).message})`,
    );
  } finally {
    clearTimeout(timer);
  }
}
