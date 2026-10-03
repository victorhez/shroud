// F4Jumble, as specified in ZIP-316: a 4-round unkeyed Feistel permutation
// that makes every bit of a Unified Address depend on every other bit.
import { blake2b } from './blake2b.js';
import { enc, concat, xor } from './bytes.js';

const personal = (tag, i, j = 0) => concat(enc.encode(tag), Uint8Array.of(i, j & 0xff, j >> 8));
const H = (i, u, len) => blake2b(u, len, personal('UA_F4Jumble_H', i));
function G(i, u, len) {
  const out = new Uint8Array(len);
  for (let j = 0; j * 64 < len; j++) {
    const block = blake2b(u, 64, personal('UA_F4Jumble_G', i, j));
    out.set(block.subarray(0, Math.min(64, len - j * 64)), j * 64);
  }
  return out;
}
const split = (m) => {
  const l = Math.min(64, m.length >> 1);
  return [m.slice(0, l), m.slice(l), l];
};

export function f4jumble(m) {
  if (m.length < 48) throw new RangeError('F4Jumble input must be at least 48 bytes');
  const [a, b, l] = split(m);
  const x = xor(b, G(0, a, b.length));
  const y = xor(a, H(0, x, l));
  const d = xor(x, G(1, y, b.length));
  const c = xor(y, H(1, d, l));
  return concat(c, d);
}

export function f4jumbleInv(m) {
  if (m.length < 48) throw new RangeError('F4Jumble input must be at least 48 bytes');
  const [c, d, l] = split(m);
  const y = xor(c, H(1, d, l));
  const x = xor(d, G(1, y, d.length));
  const a = xor(y, H(0, x, l));
  const b = xor(x, G(0, a, x.length));
  return concat(a, b);
}
