/**
 * Share links.
 *
 * A finished run is packed into the URL hash so it can be sent to someone else
 * and rendered exactly as the operator saw it. The payload is one compact
 * comma-separated record per call, deflated when the browser has
 * CompressionStream, then base64url encoded.
 *
 * Everything the results screen shows is either stored or recomputed from what
 * is stored. Points are stored rather than recomputed so an old link keeps its
 * numbers if the scoring constants are ever retuned.
 */

import { scoreCall } from './scoring';
import type { Attempt } from '../hooks/useRufzRun';

export const SHARE_PARAM = 'r';

const VERSION = '1';

/** Marks a call the operator submitted without typing anything. */
const BLANK = '-';

export interface SharedRun {
  /** When the link was made, for display on the shared results screen. */
  timestamp: number;
  attempts: Attempt[];
  totalPoints: number;
}

export async function encodeRun(attempts: Attempt[], timestamp = Date.now()): Promise<string> {
  const lines = [VERSION, timestamp.toString(36)];

  for (const a of attempts) {
    const fields = [
      a.sent,
      // Typed is dropped when it matches, which is the common case. A call the
      // operator answered blank is a different thing, so it gets a marker.
      a.typed === a.sent ? '' : a.typed || BLANK,
      a.cpm.toString(36),
      Math.round(a.elapsedSeconds * 10).toString(36),
      a.score.points.toString(36),
      a.repeated ? 'r' : '',
    ];
    while (fields.length > 1 && fields[fields.length - 1] === '') fields.pop();
    lines.push(fields.join(','));
  }

  const bytes = new TextEncoder().encode(lines.join('\n'));
  const packed = await deflate(bytes);
  return packed ? `D${toBase64Url(packed)}` : `P${toBase64Url(bytes)}`;
}

/** Returns null for anything that is not a payload we wrote. */
export async function decodeRun(payload: string): Promise<SharedRun | null> {
  try {
    const body = toBytes(payload.slice(1));
    const bytes =
      payload[0] === 'D' ? await inflate(body) : payload[0] === 'P' ? body : null;
    if (!bytes) return null;

    const lines = new TextDecoder().decode(bytes).split('\n');
    if (lines[0] !== VERSION || lines.length < 3) return null;

    const timestamp = Number.parseInt(lines[1], 36);
    if (!Number.isFinite(timestamp)) return null;

    const attempts: Attempt[] = [];
    for (let i = 2; i < lines.length; i += 1) {
      const attempt = parseAttempt(lines[i], attempts.length);
      if (!attempt) return null;
      attempts.push(attempt);
    }

    const totalPoints = attempts.reduce((sum, a) => sum + a.score.points, 0);
    return { timestamp, attempts, totalPoints };
  } catch {
    return null;
  }
}

function parseAttempt(line: string, index: number): Attempt | null {
  const [sent = '', typed = '', cpm = '', decis = '', points = '', flags = ''] =
    line.split(',');
  if (!/^[A-Z0-9/]{1,16}$/.test(sent)) return null;
  if (typed && typed !== BLANK && !/^[A-Z0-9/]{1,16}$/.test(typed)) return null;

  const numbers = [cpm, decis, points].map((v) => Number.parseInt(v, 36));
  if (numbers.some((n) => !Number.isFinite(n) || n < 0)) return null;
  const [cpmValue, decisValue, pointsValue] = numbers;

  const elapsedSeconds = decisValue / 10;
  const repeated = flags.includes('r');
  const typedValue = typed === BLANK ? '' : typed || sent;

  // Errors, maxPoints and the correct flag are all deterministic in the stored
  // fields, so only the points need carrying across.
  const score = scoreCall({
    cpm: cpmValue,
    sent,
    typed: typedValue,
    elapsedSeconds,
    repeated,
  });

  return {
    index,
    sent,
    typed: typedValue,
    cpm: cpmValue,
    elapsedSeconds,
    repeated,
    score: { ...score, points: pointsValue },
  };
}

/** The payload the current URL carries, or null when there is none. */
export function readSharePayload(hash: string): string | null {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  return params.get(SHARE_PARAM);
}

export function buildShareUrl(payload: string): string {
  const { origin, pathname, search } = window.location;
  return `${origin}${pathname}${search}#${SHARE_PARAM}=${payload}`;
}

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === 'undefined') return null;
  try {
    return await pump(new CompressionStream('deflate-raw'), bytes);
  } catch {
    return null;
  }
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof DecompressionStream === 'undefined') return null;
  try {
    return await pump(new DecompressionStream('deflate-raw'), bytes);
  } catch {
    return null;
  }
}

async function pump(
  transform: { readable: ReadableStream; writable: WritableStream },
  bytes: Uint8Array,
): Promise<Uint8Array> {
  const writer = transform.writable.getWriter();
  // A corrupt payload rejects on both ends of the stream; the readable side is
  // the one that carries the error, so the writable side is swallowed here to
  // keep it from surfacing as an unhandled rejection.
  writer.write(bytes).catch(() => {});
  writer.close().catch(() => {});
  const out = await new Response(transform.readable).arrayBuffer();
  return new Uint8Array(out);
}

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function toBytes(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}
