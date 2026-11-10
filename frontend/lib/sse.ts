/**
 * Server-Sent Events streaming client for `GET /api/negotiate`.
 *
 * Requirements that shaped this module:
 * - `fetch` + `ReadableStream` + `AbortController` (no native `EventSource`).
 * - Chunks that split across event boundaries must not break the stream.
 * - Multiple events can arrive in a single network chunk; each must be parsed.
 * - A trailing incomplete chunk must be handled on close/abort.
 * - Per-event JSON shape validation, never a full-document parse.
 * - Malformed events must not abort the whole negotiation.
 * - Network errors, non-2xx responses, and explicit abort each have their own path.
 */

/* Re-exported for testing. */
export type SseEvent =
  | { type: "round"; n: number }
  | { type: "offer"; seller: string; who: "buyer" | "seller"; price: number; deposit_percent: number; delivery_days: number; message: string }
  | { type: "status"; seller: string; status: "deal" | "out"; note: string; price: number | null }
  | { type: "result"; ranking: Array<{ seller: string; price: number; deposit_percent: number; delivery_days: number; score: number }>; winner: { seller: string; price: number; deposit_percent: number; delivery_days: number; score: number } | null; list_price: number | null; deal_id?: string }
  | { type: "notice"; message: string }
  | { type: "error"; message: string }
  | { type: "reset" }
  | { type: "unknown"; raw: string };

/** A single decoded SSE event. `ok` matters more than the payload; a malformed event is not fatal. */
/* Re-exported for testing. */
export interface SseMessage {
  ok: boolean;
  event: SseEvent;
}

/**
 * Split a raw text chunk into complete SSE events.
 *
 * The buffer is carried across `append`/`consume` calls so a chunk that ends in
 * the middle of `data: ...` never loses bytes.
 */
/* Re-exported for testing. */
export class SlidingWindow {
  private buf = "";

  /** @param chunk network payload, may end part-way through an event */
  append(chunk: string): string {
    this.buf += chunk;
    return this.buf;
  }

  /** Return the next complete event (or `""`), leaving the tail buffered. */
  consume(): string {
    const idx = this.buf.indexOf("\n\n");
    if (idx === -1) return "";
    const event = this.buf.slice(0, idx);
    this.buf = this.buf.slice(idx + 2);
    return event;
  }
}

function parseEventLine(line: string): { name: string; data: string } | null {
  // Strip a single leading `data:` / `event:` / `id:` / `retry:` prefix.
  const match = /^([a-z]+):\s*([\s\S]*)$/i.exec(line);
  if (!match) return null;
  const name = match[1].toLowerCase();
  const data = match[2];
  if (name === "data") return { name, data };
  // `id` and `retry` are metadata; ignore them for payload purposes.
  return null;
}

/* Re-exported for testing. */
export function decodeEvent(raw: string): SseMessage {
  const lines = raw.split(/\r?\n/);
  const payloadLines: string[] = [];
  for (const line of lines) {
    if (line === "") continue;
    const parsed = parseEventLine(line);
    if (!parsed) {
      // Malformed directive line (e.g. trailing spaces, unknown keyword).
      // Keep it out of the payload but do not abort: this is *the* event.
      continue;
    }
    if (parsed.name === "event") {
      // The backend does not send an `event:` directive, so the type is never
      // observed; keep the branch for spec-compliance only.
      void parsed.data;
    }
    else if (parsed.name === "data") payloadLines.push(parsed.data);
  }

  if (payloadLines.length === 0) {
    return { ok: false, event: { type: "unknown", raw } };
  }

  const text = payloadLines.join("\n");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, event: { type: "unknown", raw: text } };
  }

  if (typeof parsed !== "object" || parsed === null) {
    return { ok: false, event: { type: "unknown", raw: text } };
  }

  const obj = parsed as Record<string, unknown>;
  const type = obj.type;

  // Exhaustive validation. Unknown `type` values are handled below.
  if (type === "round") {
    return { ok: true, event: { type: "round", n: num(obj.n) } };
  }
  if (type === "offer") {
    return {
      ok: true,
      event: {
        type: "offer",
        seller: str(obj.seller),
        who: role(obj.who),
        price: num(obj.price),
        deposit_percent: num(obj.deposit_percent),
        delivery_days: num(obj.delivery_days),
        message: str(obj.message),
      },
    };
  }
  if (type === "status") {
    return {
      ok: true,
      event: {
        type: "status",
        seller: str(obj.seller),
        status: statusValue(obj.status),
        note: str(obj.note),
        price: obj.price === undefined ? null : (typeof obj.price === "number" ? obj.price : null),
      },
    };
  }
  if (type === "result") {
    return {
      ok: true,
      event: {
        type: "result",
        ranking: arr(obj.ranking),
        winner: obj.winner === null || obj.winner === undefined ? null : row(obj.winner),
        list_price: obj.list_price === undefined ? null : (typeof obj.list_price === "number" ? obj.list_price : null),
        deal_id: obj.deal_id as string | undefined,
      },
    };
  }
  if (type === "notice") return { ok: true, event: { type: "notice", message: str(obj.message) } };
  if (type === "error") return { ok: true, event: { type: "error", message: str(obj.message) } };
  if (type === "reset") return { ok: true, event: { type: "reset" } };

  return { ok: true, event: { type: "unknown", raw: text } };
}

function num(v: unknown): number {
  return typeof v === "number" ? v : 0;
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function role(v: unknown): "buyer" | "seller" {
  return v === "buyer" ? "buyer" : "seller";
}

function statusValue(v: unknown): "deal" | "out" {
  return v === "deal" ? "deal" : "out";
}

function arr(v: unknown): Array<{ seller: string; price: number; deposit_percent: number; delivery_days: number; score: number }> {
  if (Array.isArray(v)) {
    return v.map((entry) => row(entry));
  }
  return [];
}

function row(v: unknown): { seller: string; price: number; deposit_percent: number; delivery_days: number; score: number } {
  if (typeof v === "object" && v !== null) {
    const o = v as Record<string, unknown>;
    return {
      seller: str(o.seller),
      price: num(o.price),
      deposit_percent: num(o.deposit_percent),
      delivery_days: num(o.delivery_days),
      score: num(o.score),
    };
  }
  return { seller: "", price: 0, deposit_percent: 0, delivery_days: 0, score: 0 };
}

/* Re-exported for testing. */
export function decodeEventChunk(raw: string): SseMessage[] {
  const window = new SlidingWindow();
  window.append(raw);
  const events: SseMessage[] = [];
  let event = window.consume();
  while (event !== "") {
    events.push(decodeEvent(event));
    event = window.consume();
  }
  // `event` is the unfinished tail (no trailing `\n\n`): carry it on the next call.
  return events;
}

/** Parse the first complete event of a chunk; keep the rest on the window. */
/* Re-exported for testing. */
export function decodeFirstEvent(raw: string): { message: SseMessage; remaining: string } {
  const window = new SlidingWindow();
  window.append(raw);
  const event = window.consume();
  const decoded = decodeEvent(event);
  return { message: decoded, remaining: window.consume() };
}

/**
 * Stream reader. Keeps a `SlidingWindow` buffer across `read()` calls so a
 * chunk that splits an event is reassembled transparently.
 */
export class SseReader {
  private readonly setState: (message: SseMessage) => void;
  private readonly onAbort: () => void;
  private readonly onFinish: ((error: Error | null) => void) | undefined;
  private closed = false;

  constructor(
    private readonly stream: ReadableStream<Uint8Array>,
    private readonly reader: ReadableStreamDefaultReader<Uint8Array>,
    setState: (message: SseMessage) => void,
    onAbort: () => void,
    onFinish?: (error: Error | null) => void,
  ) {
    this.setState = setState;
    this.onAbort = onAbort;
    this.onFinish = onFinish;
  }

  async run(): Promise<void> {
    const window = new SlidingWindow();
    const decoder = new TextDecoder();
    let failure: Error | null = null;

    try {
      while (true) {
        // Abort takes priority: stop consuming and release the reader.
        if (this.closed) return;
        const { done, value } = await this.reader.read();
        if (done) break;
        if (!value) continue;

        // `stream: true` keeps multi-byte characters intact across chunk splits.
        window.append(decoder.decode(value, { stream: true }));

        let event = window.consume();
        while (event !== "") {
          this.setState(decodeEvent(event));
          event = window.consume();
        }
      }

      // Flush any pending decoder state, then decode a trailing partial event:
      // a remote that drops the connection mid-event must not leave bytes behind.
      window.append(decoder.decode());
      const trailing = window.consume();
      if (trailing !== "") this.setState(decodeEvent(trailing));
    } catch (error) {
      if (!this.closed) failure = error instanceof Error ? error : new Error(String(error));
    } finally {
      try {
        this.reader.releaseLock();
      } catch {
        // Already released/cancelled; nothing to do.
      }
    }

    // An explicit abort is reported through `onAbort`; only natural completion
    // (or a read failure) reaches `onFinish`.
    if (!this.closed) this.onFinish?.(failure);
  }

  abort(): void {
    if (this.closed) return;
    this.closed = true;
    void this.reader.cancel().catch(() => undefined);
    this.onAbort();
  }
}

/** Turn a fetch `Response` into a `ReadableStream` of UTF-8 bytes. */
function toByteStream(response: Response): ReadableStream<Uint8Array> {
  if (!response.body) {
    return new ReadableStream<Uint8Array>({
      start() {},
      cancel() {},
    });
  }
  return response.body as ReadableStream<Uint8Array>;
}

/**
 * Open the negotiation stream. Returns the reader handle so the caller can
 * stop it later with `reader.abort()` (Stop listening only — it does not
 * cancel the backend negotiation).
 *
 * `onFinish` receives `null` when the stream ends on its own (the normal path,
 * including after a `result` event) and an `Error` when reading fails.
 */
/* Re-exported for testing. */
export async function openNegotiationStream(
  url: string,
  onMessage: (message: SseMessage) => void,
  onAbort: () => void,
  onFinish?: (error: Error | null) => void,
): Promise<SseReader> {
  const controller = new AbortController();
  const response = await fetch(url, {
    signal: controller.signal,
    // Needed in cross-origin dev so the identity cookie reaches `/api/negotiate`.
    credentials: "include",
  });

  if (!response.ok) {
    let message = `Request failed with status ${response.status}.`;
    try {
      const body = await response.json();
      if (body && typeof body.detail === "string") message = body.detail;
    } catch {
      // Keep the generic message.
    }
    throw new Error(message);
  }

  const stream = toByteStream(response);

  // `response.body` can only be read once. If the caller cancels before we
  // consume it, the stream is already closed.
  const reader = stream.getReader();

  const sseReader = new SseReader(stream, reader, onMessage, onAbort, onFinish);

  // Consume the body immediately so events reach `onMessage` while the caller
  // still holds the reader handle.
  void sseReader.run().catch(() => undefined);

  return sseReader;
}

/* Re-exported for testing. */
export function abortReader(reader: SseReader | null): void {
  if (reader) reader.abort();
}
