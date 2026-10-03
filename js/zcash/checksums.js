// Bech32 / Bech32m (BIP-173 / BIP-350, length limit lifted per ZIP-316) and Base58Check.
import { concat } from './bytes.js';

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
const BECH32 = 1, BECH32M = 0x2bc830a3;

function polymod(values) {
  const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk >>> 0;
}
const hrpExpand = (hrp) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];

export function convertBits(data, from, to, pad) {
  let acc = 0, bits = 0;
  const out = [], max = (1 << to) - 1;
  for (const v of data) {
    if (v >> from) return null;
    acc = (acc << from) | v; bits += from;
    while (bits >= to) { bits -= to; out.push((acc >> bits) & max); }
  }
  if (pad) { if (bits) out.push((acc << (to - bits)) & max); }
  else if (bits >= from || ((acc << (to - bits)) & max)) return null;
  return Uint8Array.from(out);
}

/** @returns {{hrp:string, data:Uint8Array, variant:'bech32'|'bech32m'}|null} */
export function bech32Decode(str) {
  if (str !== str.toLowerCase() && str !== str.toUpperCase()) return null;
  str = str.toLowerCase();
  const pos = str.lastIndexOf('1');
  if (pos < 1 || pos + 7 > str.length) return null;
  const hrp = str.slice(0, pos);
  const vals = [];
  for (const c of str.slice(pos + 1)) {
    const i = CHARSET.indexOf(c);
    if (i < 0) return null;
    vals.push(i);
  }
  const chk = polymod([...hrpExpand(hrp), ...vals]);
  const variant = chk === BECH32 ? 'bech32' : chk === BECH32M ? 'bech32m' : null;
  if (!variant) return null;
  const data = convertBits(vals.slice(0, -6), 5, 8, false);
  return data ? { hrp, data, variant } : null;
}

export function bech32Encode(hrp, bytes, variant = 'bech32m') {
  const vals = convertBits(bytes, 8, 5, true);
  const c = polymod([...hrpExpand(hrp), ...vals, 0, 0, 0, 0, 0, 0]) ^ (variant === 'bech32m' ? BECH32M : BECH32);
  const check = Array.from({ length: 6 }, (_, i) => (c >>> (5 * (5 - i))) & 31);
  return hrp + '1' + [...vals, ...check].map((v) => CHARSET[v]).join('');
}

// ---- SHA-256 (sync, tiny) for Base58Check ----
const K = Uint32Array.from(
  ('428a2f98 71374491 b5c0fbcf e9b5dba5 3956c25b 59f111f1 923f82a4 ab1c5ed5 d807aa98 12835b01 243185be 550c7dc3 ' +
   '72be5d74 80deb1fe 9bdc06a7 c19bf174 e49b69c1 efbe4786 0fc19dc6 240ca1cc 2de92c6f 4a7484aa 5cb0a9dc 76f988da ' +
   '983e5152 a831c66d b00327c8 bf597fc7 c6e00bf3 d5a79147 06ca6351 14292967 27b70a85 2e1b2138 4d2c6dfc 53380d13 ' +
   '650a7354 766a0abb 81c2c92e 92722c85 a2bfe8a1 a81a664b c24b8b70 c76c51a3 d192e819 d6990624 f40e3585 106aa070 ' +
   '19a4c116 1e376c08 2748774c 34b0bcb5 391c0cb3 4ed8aa4a 5b9cca4f 682e6ff3 748f82ee 78a5636f 84c87814 8cc70208 ' +
   '90befffa a4506ceb bef9a3f7 c67178f2').split(' '),
  (h) => parseInt(h, 16),
);
export function sha256(data) {
  const h = Uint32Array.of(0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19);
  const len = data.length, padded = new Uint8Array(((len + 9 + 63) >> 6) << 6);
  padded.set(data); padded[len] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(padded.length - 4, (len * 8) >>> 0, false);
  view.setUint32(padded.length - 8, Math.floor(len / 0x20000000), false);
  const w = new Uint32Array(64), rr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let o = 0; o < padded.length; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(o + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, hh] = h;
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rr(e, 6) ^ rr(e, 11) ^ rr(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0;
      const t2 = ((rr(a, 2) ^ rr(a, 13) ^ rr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0;
      hh = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
    }
    h[0] += a; h[1] += b; h[2] += c; h[3] += d; h[4] += e; h[5] += f; h[6] += g; h[7] += hh;
  }
  const out = new Uint8Array(32), dv = new DataView(out.buffer);
  h.forEach((v, i) => dv.setUint32(i * 4, v, false));
  return out;
}

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
/** @returns {Uint8Array|null} payload (version bytes included) without the checksum */
export function base58CheckDecode(str) {
  let n = 0n;
  for (const c of str) {
    const i = B58.indexOf(c);
    if (i < 0) return null;
    n = n * 58n + BigInt(i);
  }
  const bytes = [];
  while (n > 0n) { bytes.unshift(Number(n & 0xffn)); n >>= 8n; }
  const lead = [...str].findIndex((c) => c !== '1');
  const raw = Uint8Array.from([...Array(lead < 0 ? str.length : lead).fill(0), ...bytes]);
  if (raw.length < 5) return null;
  const body = raw.slice(0, -4), sum = sha256(sha256(body)).slice(0, 4);
  return sum.every((v, i) => v === raw[raw.length - 4 + i]) ? body : null;
}
export function base58CheckEncode(body) {
  const raw = concat(body, sha256(sha256(body)).slice(0, 4));
  let n = 0n;
  for (const b of raw) n = (n << 8n) | BigInt(b);
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  const lead = raw.findIndex((b) => b !== 0);
  return '1'.repeat(lead < 0 ? raw.length : lead) + s;
}
