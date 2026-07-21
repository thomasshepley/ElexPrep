import net from 'net';

const ESC = '\x1b';
const UEL = `${ESC}%-12345X`; // PJL Universal Exit Language

/**
 * Sends a PDF straight to a printer's raw port (9100) wrapped in a PJL job that selects
 * the input tray. The bizhub/ineo family accepts direct PDF via PJL ENTER LANGUAGE=PDF.
 * MEDIASOURCE values vary slightly by firmware — they're configurable per tray in settings,
 * and the right values can be confirmed by capturing a driver print job or from the
 * device's PJL documentation.
 */
export function sendPdfDirect(
  host: string,
  port: number,
  pdf: Buffer,
  opts: { mediaSource: string; jobName: string; timeoutMs?: number }
): Promise<void> {
  const header = [
    `${UEL}@PJL`,
    `@PJL JOB NAME="${opts.jobName.replace(/"/g, "'")}"`,
    `@PJL SET MEDIASOURCE=${opts.mediaSource}`,
    '@PJL ENTER LANGUAGE=PDF',
    '',
  ].join('\r\n');
  const footer = `\r\n${UEL}@PJL EOJ\r\n${UEL}`;
  const payload = Buffer.concat([Buffer.from(header, 'ascii'), pdf, Buffer.from(footer, 'ascii')]);

  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    const timeout = opts.timeoutMs ?? 30_000;
    let settled = false;
    const fail = (err: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      reject(err);
    };

    socket.setTimeout(timeout, () => fail(new Error(`Printer connection timed out after ${timeout}ms`)));
    socket.on('error', (err) => fail(new Error(`Printer connection failed: ${err.message}`)));
    socket.connect(port, host, () => {
      socket.end(payload, () => {
        if (settled) return;
        settled = true;
        resolve();
      });
    });
  });
}

/** Cheap reachability check for the settings page's "test connection" button. */
export function testPrinterConnection(host: string, port: number, timeoutMs = 5000): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = new net.Socket();
    let settled = false;
    const done = (err?: Error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      err ? reject(err) : resolve();
    };
    socket.setTimeout(timeoutMs, () => done(new Error(`No response from ${host}:${port} within ${timeoutMs}ms`)));
    socket.on('error', (err) => done(new Error(`Cannot reach ${host}:${port}: ${err.message}`)));
    socket.connect(port, host, () => done());
  });
}
