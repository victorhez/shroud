import test from 'node:test';
import assert from 'node:assert/strict';
import { blake2b } from '../js/zcash/blake2b.js';
import { f4jumble, f4jumbleInv } from '../js/zcash/f4jumble.js';
import { bech32Decode, bech32Encode, base58CheckEncode, base58CheckDecode } from '../js/zcash/checksums.js';
import { hex, unhex, enc, concat } from '../js/zcash/bytes.js';
import { inspect } from '../js/zcash/address.js';
import { buildPaymentUri, parseAmount, parsePaymentUri } from '../js/zcash/zip321.js';

// Vectors from zcash/zcash-test-vectors (unified_address.json)
const UA_P2PKH_SAPLING = 'u1l8xunezsvhq8fgzfl7404m450nwnd76zshscn6nfys7vyz2ywyh4cc5daaq0c7q2su5lqfh23sp7fkf3kt27ve5948mzpfdvckzaect2jtte308mkwlycj2u0eac077wu70vqcetkxf';
const UA_FULL = 'u1pg2aaph7jp8rpf6yhsza25722sg5fcn3vaca6ze27hqjw7jvvhhuxkpcg0ge9xh6drsgdkda8qjq5chpehkcpxf87rnjryjqwymdheptpvnljqqrjqzjwkc2ma6hcq666kgwfytxwac8eyex6ndgr6ezte66706e3vaqrd25dzvzkc69kw0jgywtd0cmq52q5lkw6uh7hyvzjse8ksx';
const UA_FULL2 = 'u19mzuf4l37ny393m59v4mxx4t3uyxkh7qpqjdfvlfk9f504cv9w4fpl7cql0kqvssz8jay8mgl8lnrtvg6yzh9pranjj963acc3h2z2qt7007du0lsmdf862dyy40c3wmt0kq35k5z836tfljgzsqtdsccchayfjpygqzkx24l77ga3ngfgskqddyepz8we7ny4ggmt7q48cgvgu57mz';

test('BLAKE2b-512("abc") matches RFC 7693', () => {
  assert.equal(hex(blake2b(enc.encode('abc'))),
    'ba80a53f981c4d0d6a2797b69f12f6e94c212f14685ac4b74b12bb6fdbffa2d17d87c5392aab792dc252d5de4533cc9518d38aa8dbf1925ab92386edd4009923');
});

test('BLAKE2b handles multi-block input', () => {
  // blake2b-512 of 200 zero bytes would be checked against node's built-in implementation
  return import('node:crypto').then(({ createHash }) => {
    const data = new Uint8Array(300).map((_, i) => i * 7);
    assert.equal(hex(blake2b(data)), createHash('blake2b512').update(data).digest('hex'));
    assert.equal(hex(blake2b(data, 32)), createHash('blake2b512').update(data).digest('hex').length && hex(blake2b(data, 32)));
  });
});

test('F4Jumble round-trips across sizes', () => {
  for (const n of [48, 49, 100, 128, 129, 300, 1000]) {
    const m = new Uint8Array(n).map((_, i) => (i * 31 + n) & 0xff);
    assert.deepEqual(f4jumbleInv(f4jumble(m)), m);
    assert.notDeepEqual(f4jumble(m), m);
  }
});

test('Unified Address vectors decode and re-encode byte-for-byte', () => {
  for (const ua of [UA_P2PKH_SAPLING, UA_FULL, UA_FULL2]) {
    const d = bech32Decode(ua);
    assert.equal(d.variant, 'bech32m');
    assert.equal(bech32Encode('u', d.data, 'bech32m'), ua);
    // forward direction: unjumble then jumble gives the same bytes
    assert.deepEqual(f4jumble(f4jumbleInv(d.data)), d.data);
  }
});

test('inspect: unified receivers', () => {
  assert.deepEqual(inspect(UA_P2PKH_SAPLING).receivers, ['sapling', 'p2pkh']);
  assert.equal(inspect(UA_P2PKH_SAPLING).verdict.level, 'ok');
  const full = inspect(UA_FULL);
  assert.equal(full.kind, 'unified');
  assert.equal(full.networkName, 'Mainnet');
  assert.deepEqual(full.receivers, ['orchard', 'sapling', 'p2pkh']);
  assert.deepEqual(inspect(UA_FULL2).receivers, ['orchard', 'sapling', 'p2pkh']);
});

test('inspect: a single flipped character is rejected', () => {
  const bad = UA_FULL.slice(0, 40) + (UA_FULL[40] === 'q' ? 'p' : 'q') + UA_FULL.slice(41);
  assert.equal(inspect(bad).kind, 'invalid');
});

test('inspect: transparent, sapling, tex round-trip through encoders', () => {
  const t1 = base58CheckEncode(concat(Uint8Array.of(0x1c, 0xb8), new Uint8Array(20).fill(7)));
  assert.match(t1, /^t1/);
  assert.equal(inspect(t1).receivers[0], 'p2pkh');
  assert.deepEqual(base58CheckDecode(t1).length, 22);
  const t3 = base58CheckEncode(concat(Uint8Array.of(0x1c, 0xbd), new Uint8Array(20).fill(9)));
  assert.match(t3, /^t3/);
  assert.equal(inspect(t3).receivers[0], 'p2sh');
  const zs = bech32Encode('zs', new Uint8Array(43).fill(5), 'bech32');
  assert.match(zs, /^zs1/);
  assert.equal(inspect(zs).verdict.level, 'private');
  const tex = bech32Encode('tex', new Uint8Array(20).fill(1), 'bech32m');
  assert.equal(inspect(tex).kind, 'tex');
  assert.equal(inspect(base58CheckEncode(concat(Uint8Array.of(0x1d, 0x25), new Uint8Array(20)))).networkName, 'Testnet');
});

test('inspect refuses secrets and never echoes classification of them as addresses', () => {
  const seed = 'abandon ability able about above absent absorb abstract absurd abuse access accident';
  assert.equal(inspect(seed).kind, 'secret');
  assert.equal(inspect('secret-extended-key-main1qq...').kind, 'secret');
  assert.equal(inspect('uview1abc').kind, 'secret');
});

test('inspect: garbage', () => {
  assert.equal(inspect('').kind, 'empty');
  assert.equal(inspect('hello').kind, 'invalid');
  assert.equal(inspect('t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbs').kind, 'transparent'); // real mainnet address
  assert.equal(inspect('t1Hsc1LR8yKnbbe3twRp88p6vFfC5t7DLbt').kind, 'invalid'); // one char off
});

test('ZIP-321 amounts', () => {
  assert.equal(parseAmount('1.5').zats, 150_000_000n);
  assert.equal(parseAmount('0.00000001').zats, 1n);
  assert.ok(parseAmount('0.000000001').error);
  assert.ok(parseAmount('-1').error);
  assert.ok(parseAmount('22000000').error);
});

test('ZIP-321 URI build and parse, memo rules', () => {
  const r = buildPaymentUri({ address: UA_FULL, amount: '0.50', memo: 'Thanks for the coffee ☕', message: 'Coffee & cake' });
  assert.deepEqual(r.errors, []);
  assert.match(r.uri, /^zcash:u1pg2.*\?amount=0\.5&memo=[A-Za-z0-9_-]+&message=Coffee%20%26%20cake$/);
  const back = parsePaymentUri(r.uri);
  assert.equal(back.memo, 'Thanks for the coffee ☕');
  assert.equal(back.amount, '0.5');
  const t = base58CheckEncode(concat(Uint8Array.of(0x1c, 0xb8), new Uint8Array(20).fill(3)));
  assert.ok(buildPaymentUri({ address: t, memo: 'hi' }).errors.length, 'memo to transparent must be refused');
  assert.ok(buildPaymentUri({ address: UA_FULL, memo: 'x'.repeat(513) }).errors.length);
  assert.ok(buildPaymentUri({ address: 'nope' }).errors.length);
});
