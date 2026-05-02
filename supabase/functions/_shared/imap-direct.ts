// Minimal direct IMAP client using raw TLS sockets.
// Replaces ImapFlow for the body-fetch path because ImapFlow's async iterator
// stalls on the Migadu server inside Deno's edge runtime.
//
// Supported commands: LOGIN, SELECT, UID SEARCH, UID FETCH (BODY.PEEK[]), LOGOUT.
// Parses literal bodies ({N}) and yields { uid, source } per message.

export interface ImapDirectOptions {
  host: string;
  port: number;
  username: string;
  password: string;
}

export interface FetchedMessage {
  uid: number;
  source: Uint8Array;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("latin1"); // headers/control bytes only — body is binary

export class ImapDirectClient {
  private conn: Deno.TlsConn | null = null;
  private buf: Uint8Array = new Uint8Array(0);
  private tag = 0;

  constructor(private opts: ImapDirectOptions) {}

  async connect(timeoutMs = 15_000): Promise<void> {
    this.conn = await Promise.race([
      Deno.connectTls({ hostname: this.opts.host, port: this.opts.port }),
      new Promise<never>((_, rej) =>
        setTimeout(() => rej(new Error(`connectTls timeout after ${timeoutMs}ms`)), timeoutMs)
      ),
    ]);
    // read greeting (* OK ...)
    await this.readUntilTag(null, 10_000);
  }

  async login(): Promise<void> {
    const tag = this.nextTag();
    // Quote password against odd characters
    const safePass = String(this.opts.password).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    const safeUser = String(this.opts.username).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    await this.send(`${tag} LOGIN "${safeUser}" "${safePass}"\r\n`);
    await this.readUntilTag(tag, 15_000);
  }

  async selectInbox(): Promise<{ uidNext: number }> {
    const tag = this.nextTag();
    await this.send(`${tag} SELECT INBOX\r\n`);
    const lines = await this.readUntilTag(tag, 15_000);
    let uidNext = 0;
    for (const line of lines) {
      const m = line.match(/UIDNEXT\s+(\d+)/i);
      if (m) uidNext = Number(m[1]);
    }
    return { uidNext };
  }

  async uidSearchRange(fromUid: number, toUid: number | "*"): Promise<number[]> {
    const tag = this.nextTag();
    const range = toUid === "*" ? `${fromUid}:*` : `${fromUid}:${toUid}`;
    await this.send(`${tag} UID SEARCH UID ${range}\r\n`);
    const lines = await this.readUntilTag(tag, 30_000);
    const uids: number[] = [];
    for (const line of lines) {
      const m = line.match(/^\* SEARCH(.*)$/i);
      if (m) {
        for (const tok of m[1].trim().split(/\s+/)) {
          const n = Number(tok);
          if (Number.isFinite(n) && n > 0) uids.push(n);
        }
      }
    }
    return uids.sort((a, b) => a - b);
  }

  // Fetch a single UID's full RFC822 source. Uses BODY.PEEK[] (no \Seen flag).
  async fetchOne(uid: number, timeoutMs = 30_000): Promise<FetchedMessage | null> {
    const tag = this.nextTag();
    await this.send(`${tag} UID FETCH ${uid} BODY.PEEK[]\r\n`);
    return await this.readFetchResponse(tag, uid, timeoutMs);
  }

  async logout(): Promise<void> {
    if (!this.conn) return;
    try {
      const tag = this.nextTag();
      await this.send(`${tag} LOGOUT\r\n`);
      await this.readUntilTag(tag, 5_000).catch(() => {});
    } catch { /* ignore */ }
    try { this.conn.close(); } catch { /* ignore */ }
    this.conn = null;
  }

  // ───── internals ─────

  private nextTag(): string {
    this.tag += 1;
    return `a${this.tag.toString().padStart(4, "0")}`;
  }

  private async send(cmd: string): Promise<void> {
    if (!this.conn) throw new Error("Not connected");
    await this.conn.write(encoder.encode(cmd));
  }

  // Read raw bytes until we have at least `min` bytes available, or timeout.
  private async readMore(timeoutMs: number): Promise<void> {
    if (!this.conn) throw new Error("Not connected");
    const tmp = new Uint8Array(64 * 1024);
    const n = await Promise.race([
      this.conn.read(tmp),
      new Promise<null>((res) => setTimeout(() => res(null), timeoutMs)),
    ]);
    if (n === null) throw new Error(`IMAP read timeout after ${timeoutMs}ms`);
    if (n === 0 || n === undefined) throw new Error("IMAP connection closed");
    const merged = new Uint8Array(this.buf.length + n);
    merged.set(this.buf, 0);
    merged.set(tmp.subarray(0, n), this.buf.length);
    this.buf = merged;
  }

  // Pull bytes out of buffer (consumes them).
  private take(n: number): Uint8Array {
    const out = this.buf.subarray(0, n);
    this.buf = this.buf.subarray(n);
    // ensure we own the slice
    return new Uint8Array(out);
  }

  // Find next CRLF in buffer; returns index of the LF, or -1.
  private indexOfCrlf(): number {
    for (let i = 0; i < this.buf.length - 1; i++) {
      if (this.buf[i] === 0x0d && this.buf[i + 1] === 0x0a) return i;
    }
    return -1;
  }

  // Read a single line (without trailing CRLF) from buffer, fetching more if needed.
  private async readLine(timeoutMs: number): Promise<string> {
    const deadline = Date.now() + timeoutMs;
    while (true) {
      const idx = this.indexOfCrlf();
      if (idx >= 0) {
        const line = this.take(idx + 2);
        return decoder.decode(line.subarray(0, idx));
      }
      const remain = deadline - Date.now();
      if (remain <= 0) throw new Error(`readLine timeout after ${timeoutMs}ms`);
      await this.readMore(remain);
    }
  }

  // Read exactly n bytes from buffer, fetching more if needed.
  private async readBytes(n: number, timeoutMs: number): Promise<Uint8Array> {
    const deadline = Date.now() + timeoutMs;
    while (this.buf.length < n) {
      const remain = deadline - Date.now();
      if (remain <= 0) throw new Error(`readBytes timeout after ${timeoutMs}ms`);
      await this.readMore(remain);
    }
    return this.take(n);
  }

  // Read response lines until we hit `tag OK|NO|BAD ...`. Returns collected lines.
  // If tag is null, reads only the first line (used for greeting).
  private async readUntilTag(tag: string | null, timeoutMs: number): Promise<string[]> {
    const deadline = Date.now() + timeoutMs;
    const out: string[] = [];
    while (true) {
      const remain = deadline - Date.now();
      if (remain <= 0) throw new Error(`readUntilTag timeout after ${timeoutMs}ms`);
      const line = await this.readLine(remain);
      out.push(line);
      if (tag === null) return out; // greeting: one line
      if (line.startsWith(`${tag} `)) {
        const status = line.slice(tag.length + 1).split(" ")[0].toUpperCase();
        if (status === "OK") return out;
        throw new Error(`IMAP ${status}: ${line}`);
      }
      // If a literal {N} appears mid-stream outside a FETCH (rare), drain it.
      const litMatch = line.match(/\{(\d+)\}$/);
      if (litMatch) {
        const n = Number(litMatch[1]);
        await this.readBytes(n, deadline - Date.now());
      }
    }
  }

  // Parse a UID FETCH response for a single message. Handles BODY[] {N} literals.
  private async readFetchResponse(
    tag: string,
    expectedUid: number,
    timeoutMs: number,
  ): Promise<FetchedMessage | null> {
    const deadline = Date.now() + timeoutMs;
    let source: Uint8Array | null = null;
    let uid = expectedUid;

    while (true) {
      const remain = deadline - Date.now();
      if (remain <= 0) throw new Error(`fetch timeout after ${timeoutMs}ms (uid=${expectedUid})`);
      const line = await this.readLine(remain);

      if (line.startsWith(`${tag} `)) {
        const status = line.slice(tag.length + 1).split(" ")[0].toUpperCase();
        if (status === "OK") return source ? { uid, source } : null;
        throw new Error(`IMAP ${status}: ${line}`);
      }

      // Untagged FETCH response. Extract UID if present.
      const uidMatch = line.match(/UID\s+(\d+)/i);
      if (uidMatch) uid = Number(uidMatch[1]);

      // Look for a literal at end of line: {N}
      const litMatch = line.match(/\{(\d+)\}$/);
      if (litMatch) {
        const n = Number(litMatch[1]);
        const bodyBytes = await this.readBytes(n, deadline - Date.now());
        source = bodyBytes;
        // After the literal there's typically a closing ")" line. Drain it on next loop.
      }
    }
  }
}
