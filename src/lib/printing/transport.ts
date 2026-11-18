import { Buffer } from 'buffer';
import TcpSocket from 'react-native-tcp-socket';

const CONNECT_TIMEOUT_MS = 4000;
const IDLE_TIMEOUT_MS = 8000;
// Network thermal printers (e.g. Xprinter) take one connection on port 9100 at a time and may refuse
// a new one while still printing; wait for the close and retry a refused connect once.
const CLOSE_WAIT_MS = 1500;
const CONNECT_RETRY_DELAY_MS = 1200;

export class PrinterError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PrinterError';
  }
}

let queue: Promise<void> = Promise.resolve();

// Jobs run one at a time so two screens printing together never open overlapping connections.
export function sendToPrinter(host: string, port: number, bytes: Uint8Array): Promise<void> {
  if (!host) {
    return Promise.reject(new PrinterError('No printer is set up. Add its IP address in Settings.'));
  }

  const job = queue.then(() => sendWithRetry(host, port, bytes));
  queue = job.catch(() => undefined);
  return job;
}

async function sendWithRetry(host: string, port: number, bytes: Uint8Array): Promise<void> {
  try {
    await sendOnce(host, port, bytes);
  } catch (error) {
    // Only retry when nothing reached the printer, so a ticket is never printed twice.
    if (!(error instanceof ConnectError)) {
      throw error;
    }

    await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_DELAY_MS));
    try {
      await sendOnce(host, port, bytes);
    } catch (retryError) {
      throw retryError instanceof ConnectError ? retryError.toPrinterError() : retryError;
    }
  }
}

class ConnectError extends Error {
  constructor(
    readonly host: string,
    readonly port: number,
    readonly reason: string,
  ) {
    super(reason);
  }

  toPrinterError() {
    return new PrinterError(`Can't reach the printer at ${this.host}:${this.port}. Check it is on and connected to the router. (${this.reason})`);
  }
}

function sendOnce(host: string, port: number, bytes: Uint8Array): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    let written = false;
    const finish = (error?: Error) => {
      if (settled) {
        return;
      }

      settled = true;
      socket.destroy();
      if (error) {
        reject(error);
      } else {
        resolve();
      }
    };

    const socket = TcpSocket.createConnection({ host, port, connectTimeout: CONNECT_TIMEOUT_MS }, () => {
      socket.write(Buffer.from(bytes), undefined, (error) => {
        if (error) {
          finish(new PrinterError(`Printer write failed: ${error.message}`));
          return;
        }

        written = true;
        // Half-close and let the printer drain the data before the socket is torn down.
        socket.end();
        setTimeout(() => finish(), CLOSE_WAIT_MS);
      });
    });

    socket.setTimeout(IDLE_TIMEOUT_MS);
    socket.on('close', () => {
      if (written) {
        finish();
      }
    });
    socket.on('timeout', () =>
      finish(written ? undefined : new PrinterError(`Printer at ${host}:${port} did not respond.`)),
    );
    socket.on('error', (error) => {
      if (written) {
        finish();
      } else {
        finish(new ConnectError(host, port, error.message));
      }
    });
  });
}
