// Minimal direct SMTP client using Deno.connectTls / Deno.connect + STARTTLS.
// Built to avoid the heavy CPU cost of denomailer in Supabase Edge Functions.
//
// Supports:
// - Implicit TLS (port 465) and STARTTLS (port 587)
// - AUTH LOGIN
// - multipart/alternative (text + html), quoted-printable encoded
// - UTF-8 MIME-encoded subject / from-name
// - Dot-stuffing during DATA phase

export interface SendMailOptions {
  host: string;
  port: number;
  useTls?: boolean;             // true => implicit TLS (465). false => STARTTLS (587)
  username: string;
  password: string;
  fromEmail: string;
  fromName?: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  html: string;
  text?: string;
  headers?: Record<string, string | undefined>;
}

function b64(s: string): string {
  return btoa(unescape(encodeURIComponent(s)));
}

function encodeHeaderWord(s: string): string {
  // Only encode if non-ASCII present
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(s)) return s;
  return `=?utf-8?B?${b64(s)}?=`;
}

function quotedPrintable(input: string): string {
  // Encode to UTF-8 bytes then to QP, wrap at 76 chars with soft line breaks.
  const bytes = new TextEncoder().encode(input.replace(/\r?\n/g, "\r\n"));
  let out = "";
  let lineLen = 0;
  const pushChunk = (chunk: string) => {
    if (lineLen + chunk.length > 75) {
      out += "=\r\n";
      lineLen = 0;
    }
    out += chunk;
    lineLen += chunk.length;
  };
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    // CRLF passthrough
    if (b === 0x0d && bytes[i + 1] === 0x0a) {
      out += "\r\n";
      lineLen = 0;
      i++;
      continue;
    }
    const isPrintable =
      (b >= 33 && b <= 126 && b !== 61) || b === 0x20 || b === 0x09;
    if (isPrintable) {
      const ch = String.fromCharCode(b);
      // Avoid trailing space/tab at line end — defer handling: just push, fix on CRLF
      if ((b === 0x20 || b === 0x09) && (bytes[i + 1] === 0x0d || i === bytes.length - 1)) {
        pushChunk(`=${b.toString(16).toUpperCase().padStart(2, "0")}`);
      } else {
        pushChunk(ch);
      }
    } else {
      pushChunk(`=${b.toString(16).toUpperCase().padStart(2, "0")}`);
    }
  }
  return out;
}

function buildAddress(email: string, name?: string): string {
  if (!name) return email;
  return `${encodeHeaderWord(name)} <${email}>`;
}

function buildMimeMessage(opts: SendMailOptions): string {
  const boundary = `=_lov_${crypto.randomUUID().replace(/-/g, "")}`;
  const lines: string[] = [];
  lines.push(`From: ${buildAddress(opts.fromEmail, opts.fromName)}`);
  lines.push(`To: ${opts.to.join(", ")}`);
  if (opts.cc?.length) lines.push(`Cc: ${opts.cc.join(", ")}`);
  lines.push(`Subject: ${encodeHeaderWord(opts.subject)}`);
  lines.push(`Date: ${new Date().toUTCString()}`);
  lines.push(`MIME-Version: 1.0`);
  for (const [k, v] of Object.entries(opts.headers ?? {})) {
    if (v) lines.push(`${k}: ${v}`);
  }
  lines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);
  lines.push("");

  const text = opts.text ?? htmlToText(opts.html);

  lines.push(`--${boundary}`);
  lines.push(`Content-Type: text/plain; charset=utf-8`);
  lines.push(`Content-Transfer-Encoding: quoted-printable`);
  lines.push("");
  lines.push(quotedPrintable(text));
  lines.push("");

  lines.push(`--${boundary}`);
  lines.push(`Content-Type: text/html; charset=utf-8`);
  lines.push(`Content-Transfer-Encoding: quoted-printable`);
  lines.push("");
  lines.push(quotedPrintable(opts.html));
  lines.push("");

  lines.push(`--${boundary}--`);
  lines.push("");
  return lines.join("\r\n");
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

class SmtpConn {
  private conn: Deno.Conn;
  private reader: ReadableStreamDefaultReader<Uint8Array>;
  private buf = "";
  private encoder = new TextEncoder();

  constructor(conn: Deno.Conn) {
    this.conn = conn;
    this.reader = conn.readable.getReader();
  }

  async readLine(): Promise<string> {
    while (!this.buf.includes("\n")) {
      const { value, done } = await this.reader.read();
      if (done) break;
      this.buf += new TextDecoder().decode(value);
    }
    const idx = this.buf.indexOf("\n");
    if (idx < 0) {
      const out = this.buf;
      this.buf = "";
      return out;
    }
    const line = this.buf.slice(0, idx + 1);
    this.buf = this.buf.slice(idx + 1);
    return line;
  }

  // Read full SMTP response (multi-line: "250-foo" continues, "250 bar" ends)
  async readResponse(): Promise<{ code: number; text: string }> {
    let text = "";
    let code = 0;
    while (true) {
      const line = await this.readLine();
      if (!line) break;
      text += line;
      code = parseInt(line.slice(0, 3), 10);
      if (line[3] === " ") break;
      if (line.length < 4) break;
    }
    return { code, text };
  }

  async write(data: string | Uint8Array): Promise<void> {
    const bytes = typeof data === "string" ? this.encoder.encode(data) : data;
    const writer = this.conn.writable.getWriter();
    try {
      await writer.write(bytes);
    } finally {
      writer.releaseLock();
    }
  }

  async cmd(line: string, expect: number): Promise<{ code: number; text: string }> {
    await this.write(line + "\r\n");
    const resp = await this.readResponse();
    if (resp.code !== expect) {
      throw new Error(`SMTP cmd "${line.split(" ")[0]}" failed: ${resp.code} ${resp.text.trim()}`);
    }
    return resp;
  }

  close() {
    try { this.reader.releaseLock(); } catch { /* ignore */ }
    try { this.conn.close(); } catch { /* ignore */ }
  }

  // Upgrade plain conn to TLS (for STARTTLS path)
  async startTls(hostname: string): Promise<void> {
    // Release reader so we can hand the conn to startTls
    try { this.reader.releaseLock(); } catch { /* ignore */ }
    // @ts-ignore — Deno.startTls exists in Deno runtime
    const tlsConn = await Deno.startTls(this.conn as Deno.TcpConn, { hostname });
    this.conn = tlsConn;
    this.reader = tlsConn.readable.getReader();
    this.buf = "";
  }
}

export async function sendSmtpMail(opts: SendMailOptions): Promise<void> {
  const useTls = opts.useTls ?? (opts.port === 465);
  const rawConn = useTls
    ? await Deno.connectTls({ hostname: opts.host, port: opts.port })
    : await Deno.connect({ hostname: opts.host, port: opts.port });

  const smtp = new SmtpConn(rawConn);

  try {
    // Greeting
    const greet = await smtp.readResponse();
    if (greet.code !== 220) throw new Error(`SMTP greeting: ${greet.code} ${greet.text}`);

    await smtp.cmd(`EHLO ${opts.fromEmail.split("@")[1] || "localhost"}`, 250);

    if (!useTls) {
      await smtp.cmd("STARTTLS", 220);
      await smtp.startTls(opts.host);
      await smtp.cmd(`EHLO ${opts.fromEmail.split("@")[1] || "localhost"}`, 250);
    }

    // AUTH LOGIN
    await smtp.cmd("AUTH LOGIN", 334);
    await smtp.cmd(b64(opts.username), 334);
    await smtp.cmd(b64(opts.password), 235);

    await smtp.cmd(`MAIL FROM:<${opts.fromEmail}>`, 250);
    const allRcpts = [...opts.to, ...(opts.cc ?? []), ...(opts.bcc ?? [])];
    for (const r of allRcpts) {
      await smtp.cmd(`RCPT TO:<${r}>`, 250);
    }

    await smtp.cmd("DATA", 354);

    const message = buildMimeMessage(opts);
    // Dot-stuff: any line starting with "." must be prefixed with another "."
    const stuffed = message.replace(/\r\n\./g, "\r\n..");
    await smtp.write(stuffed);
    if (!stuffed.endsWith("\r\n")) await smtp.write("\r\n");
    const dataResp = await (async () => {
      await smtp.write(".\r\n");
      return smtp.readResponse();
    })();
    if (dataResp.code !== 250) {
      throw new Error(`SMTP DATA end: ${dataResp.code} ${dataResp.text.trim()}`);
    }

    try { await smtp.cmd("QUIT", 221); } catch { /* ignore */ }
  } finally {
    smtp.close();
  }
}
