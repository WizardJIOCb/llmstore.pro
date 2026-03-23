import type { Response } from 'express';

export class SSEEmitter {
  private res: Response;
  private closed = false;

  constructor(res: Response) {
    this.res = res;
    this.res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    this.res.flushHeaders();
  }

  send(event: string, data: unknown) {
    if (this.closed) return;
    this.res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  heartbeat() {
    if (this.closed) return;
    this.res.write(': heartbeat\n\n');
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.res.end();
  }

  get isClosed() {
    return this.closed;
  }

  onClientDisconnect(callback: () => void) {
    this.res.on('close', () => {
      this.closed = true;
      callback();
    });
  }
}
