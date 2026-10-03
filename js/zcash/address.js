// Zcash address inspector. Everything here runs locally; an address never leaves the page.
// Supports: Unified (ZIP-316), Sapling, Transparent P2PKH/P2SH, TEX (ZIP-320), legacy Sprout.
// It also recognises secrets (seed phrases, spending & viewing keys) so the UI can refuse them.
import { bech32Decode, base58CheckDecode } from './checksums.js';
import { f4jumbleInv } from './f4jumble.js';
import { enc, concat } from './bytes.js';

const NETWORKS = { main: 'Mainnet', test: 'Testnet', regtest: 'Regtest' };
const UA_HRP = { u: 'main', utest: 'test', uregtest: 'regtest' };
const SAPLING_HRP = { zs: 'main', ztestsapling: 'test', zregtestsapling: 'regtest' };
const TEX_HRP = { tex: 'main', textest: 'test', texregtest: 'regtest' };
const T_PREFIX = { '1cb8': ['main', 'p2pkh'], '1cbd': ['main', 'p2sh'], '1d25': ['test', 'p2pkh'], '1cba': ['test', 'p2sh'] };
const SPROUT_PREFIX = { '169a': 'main', '16b6': 'test' };

export const RECEIVER = {
  orchard: { label: 'Orchard', shielded: true, note: 'Newest shielded pool (Halo 2, no trusted setup). The best default.' },
  sapling: { label: 'Sapling', shielded: true, note: 'Mature shielded pool. Private, widely supported.' },
  p2pkh: { label: 'Transparent (P2PKH)', shielded: false, note: 'Public, Bitcoin-style. Amounts and addresses are visible to everyone.' },
  p2sh: { label: 'Transparent (P2SH)', shielded: false, note: 'Public script address. Everything is visible.' },
};

function readCompactSize(buf, o) {
  const b = buf[o];
  if (b === undefined) return null;
  if (b < 0xfd) return [b, o + 1];
  if (b === 0xfd && o + 2 < buf.length) return [buf[o + 1] | (buf[o + 2] << 8), o + 3];
  return null;
}

/** Parse the plaintext (post-F4Jumble, padding removed) item list of a Unified Address. */
export function parseUnifiedItems(payload) {
  const items = [];
  let o = 0;
  while (o < payload.length) {
    const tc = readCompactSize(payload, o);
    if (!tc) return null;
    const ln = readCompactSize(payload, tc[1]);
    if (!ln || ln[1] + ln[0] > payload.length) return null;
    items.push({ typecode: tc[0], data: payload.slice(ln[1], ln[1] + ln[0]) });
    o = ln[1] + ln[0];
  }
  return items;
}

function decodeUnified(addr, hrp, data) {
  if (data.length < 48) return { error: 'Too short to be a Unified Address.' };
  const plain = f4jumbleInv(data);
  const pad = concat(enc.encode(hrp), new Uint8Array(16 - hrp.length));
  const tail = plain.slice(-16);
  if (!tail.every((v, i) => v === pad[i])) {
    return { error: 'Padding check failed: this is not a valid Unified Address for its prefix.' };
  }
  const items = parseUnifiedItems(plain.slice(0, -16));
  if (!items || !items.length) return { error: 'Malformed receiver list.' };
  const receivers = [], unknown = [];
  const want = { 0: ['p2pkh', 20], 1: ['p2sh', 20], 2: ['sapling', 43], 3: ['orchard', 43] };
  const seen = new Set();
  for (const it of items) {
    const w = want[it.typecode];
    if (!w) { unknown.push(it.typecode); continue; }
    if (it.data.length !== w[1]) return { error: `Receiver ${w[0]} has the wrong length.` };
    if (seen.has(it.typecode)) return { error: `Duplicate ${w[0]} receiver.` };
    seen.add(it.typecode);
    receivers.push(w[0]);
  }
  if (seen.has(0) && seen.has(1)) return { error: 'A Unified Address cannot hold both P2PKH and P2SH receivers.' };
  if (!receivers.some((r) => RECEIVER[r].shielded) && !unknown.length) {
    return { error: 'A Unified Address must contain at least one shielded receiver.' };
  }
  return { receivers: ['orchard', 'sapling', 'p2pkh', 'p2sh'].filter((r) => receivers.includes(r)), unknown };
}

const verdictFor = (receivers) => {
  const shielded = receivers.filter((r) => RECEIVER[r].shielded);
  const transparent = receivers.filter((r) => !RECEIVER[r].shielded);
  if (shielded.length && !transparent.length) return { level: 'private', text: 'Fully shielded. Wallets will pay it privately.' };
  if (shielded.length) return { level: 'ok', text: 'Has a shielded receiver. A wallet that understands it will pick that one; a transparent receiver is also present as a fallback.' };
  return { level: 'public', text: 'Transparent only. Anything sent here is public forever.' };
};

/** Returns an object describing the input; never throws. */
export function inspect(raw) {
  const input = (raw ?? '').trim();
  if (!input) return { kind: 'empty' };

  // --- secrets first: refuse before we do anything else ---
  const words = input.toLowerCase().split(/\s+/);
  if ([12, 15, 18, 24].includes(words.length) && words.every((w) => /^[a-z]{3,8}$/.test(w))) {
    return { kind: 'secret', what: 'a seed phrase', detail: 'This looks like a recovery phrase. Anyone who sees it can spend your funds.' };
  }
  if (/^secret-extended-key-|^secret-spending-key|^zxviews|^zxviewtestsapling|^uview|^uivk|^ufvk|^zxsapling/i.test(input)) {
    return { kind: 'secret', what: /^(uview|uivk|ufvk|zxview)/i.test(input) ? 'a viewing key' : 'a spending key', detail: /^(uview|uivk|ufvk|zxview)/i.test(input) ? 'Viewing keys reveal your transaction history to whoever holds them.' : 'Spending keys control your funds.' };
  }
  if (/\s/.test(input)) return { kind: 'invalid', error: 'Addresses contain no spaces.' };

  // --- bech32 family ---
  const b = bech32Decode(input);
  if (b) {
    if (b.hrp in UA_HRP && b.variant === 'bech32m') {
      const r = decodeUnified(input, b.hrp, b.data);
      if (r.error) return { kind: 'invalid', error: r.error };
      return { kind: 'unified', network: UA_HRP[b.hrp], networkName: NETWORKS[UA_HRP[b.hrp]], receivers: r.receivers, unknown: r.unknown, verdict: verdictFor(r.receivers), title: 'Unified Address' };
    }
    if (b.hrp in SAPLING_HRP && b.variant === 'bech32') {
      if (b.data.length !== 43) return { kind: 'invalid', error: 'Sapling payload must be 43 bytes.' };
      const n = SAPLING_HRP[b.hrp];
      return { kind: 'sapling', network: n, networkName: NETWORKS[n], receivers: ['sapling'], verdict: verdictFor(['sapling']), title: 'Sapling Address' };
    }
    if (b.hrp in TEX_HRP && b.variant === 'bech32m') {
      if (b.data.length !== 20) return { kind: 'invalid', error: 'TEX payload must be 20 bytes.' };
      const n = TEX_HRP[b.hrp];
      return { kind: 'tex', network: n, networkName: NETWORKS[n], receivers: ['p2pkh'], title: 'TEX Address (ZIP-320)', verdict: { level: 'public', text: 'Transparent-source-only address. It can only be paid from transparent funds, and it is public. Some exchanges use these; avoid sending shielded funds here.' } };
    }
    return { kind: 'invalid', error: 'Valid checksum, but not a Zcash address prefix.' };
  }
  if (/^(u1|utest1|uregtest1|zs1|ztestsapling1|tex1)/i.test(input)) return { kind: 'invalid', error: 'Checksum failed. A character is wrong, missing or extra.' };

  // --- base58check family ---
  const body = base58CheckDecode(input);
  if (body) {
    const ver = Array.from(body.slice(0, 2), (v) => v.toString(16).padStart(2, '0')).join('');
    if (ver in T_PREFIX && body.length === 22) {
      const [n, t] = T_PREFIX[ver];
      return { kind: 'transparent', network: n, networkName: NETWORKS[n], receivers: [t], title: 'Transparent Address', verdict: verdictFor([t]) };
    }
    if (ver in SPROUT_PREFIX && body.length === 66) {
      const n = SPROUT_PREFIX[ver];
      return { kind: 'sprout', network: n, networkName: NETWORKS[n], receivers: [], title: 'Sprout Address (legacy)', verdict: { level: 'public', text: 'Legacy Sprout pool. New value can no longer enter it and most wallets cannot pay it. Do not use.' } };
    }
    return { kind: 'invalid', error: 'Valid Base58Check, but not a Zcash address.' };
  }
  if (/^(t1|t3|tm|t2|zc)/.test(input)) return { kind: 'invalid', error: 'Checksum failed. A character is wrong, missing or extra.' };
  return { kind: 'invalid', error: 'This does not look like a Zcash address.' };
}

export const isShieldedCapable = (info) => !!info.receivers?.some((r) => RECEIVER[r].shielded);
