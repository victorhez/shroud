export const enc = new TextEncoder();
export const dec = new TextDecoder();
export const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
export const unhex = (s) => Uint8Array.from(s.match(/../g) ?? [], (h) => parseInt(h, 16));
export const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
export const xor = (a, b) => a.map((v, i) => v ^ b[i]);
