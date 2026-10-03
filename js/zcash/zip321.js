// ZIP-321 payment request URIs: zcash:<address>?amount=<zec>&memo=<base64url>&message=<text>
import { enc } from './bytes.js';
import { inspect, isShieldedCapable } from './address.js';

export const MAX_MEMO_BYTES = 512;
const b64url = (u8) => btoa(String.fromCharCode(...u8)).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
const unb64url = (s) => Uint8Array.from(atob(s.replaceAll('-', '+').replaceAll('_', '/')), (c) => c.charCodeAt(0));

/** Validates a decimal ZEC amount. Returns {zats} (BigInt) or {error}. */
export function parseAmount(str) {
  if (!/^\d{1,8}(\.\d{1,8})?$/.test(str)) return { error: 'Use up to 8 decimal places, e.g. 0.05' };
  const [w, f = ''] = str.split('.');
  const zats = BigInt(w) * 100_000_000n + BigInt(f.padEnd(8, '0'));
  if (zats > 21_000_000n * 100_000_000n) return { error: 'More than the total ZEC supply.' };
  return { zats };
}

/** @returns {{uri?:string, errors:string[], warnings:string[]}} */
export function buildPaymentUri({ address, amount = '', memo = '', message = '' }) {
  const errors = [], warnings = [];
  const info = inspect(address);
  if (info.kind === 'secret') return { errors: ['Never paste a secret here.'], warnings };
  if (info.kind === 'invalid' || info.kind === 'empty') return { errors: [info.error ?? 'Enter an address.'], warnings };
  if (info.kind === 'sprout') errors.push('Sprout addresses cannot be used in payment requests.');
  const q = [];
  if (amount) {
    const a = parseAmount(amount);
    if (a.error) errors.push(a.error);
    else q.push('amount=' + amount.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, ''));
  }
  if (memo) {
    const bytes = enc.encode(memo);
    if (!isShieldedCapable(info)) errors.push('Memos can only be attached to shielded recipients.');
    else if (bytes.length > MAX_MEMO_BYTES) errors.push(`Memo is ${bytes.length} bytes; the limit is ${MAX_MEMO_BYTES}.`);
    else q.push('memo=' + b64url(bytes));
    warnings.push('The memo is encrypted on-chain, but it lives in this link in plain base64. Anyone who sees the link can read it.');
  }
  if (message) q.push('message=' + encodeURIComponent(message).replace(/%20/g, '%20'));
  if (info.kind === 'tex') warnings.push('TEX addresses only accept transparent funds.');
  if (errors.length) return { errors, warnings };
  return { uri: `zcash:${address.trim()}${q.length ? '?' + q.join('&') : ''}`, errors, warnings };
}

export function parsePaymentUri(uri) {
  const m = /^zcash:([^?]+)(?:\?(.*))?$/.exec(uri.trim());
  if (!m) return null;
  const out = { address: m[1] };
  for (const kv of (m[2] ?? '').split('&').filter(Boolean)) {
    const [k, v = ''] = kv.split('=');
    if (k === 'memo') out.memo = new TextDecoder().decode(unb64url(v));
    else out[k] = decodeURIComponent(v);
  }
  return out;
}
