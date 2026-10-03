import test from 'node:test';
import assert from 'node:assert/strict';
import { analyze, PRESETS } from '../js/leaklab.js';

const sevs = (r) => r.findings.map((f) => f.severity);

test('classic mistake is critical and graded F', () => {
  const r = analyze(PRESETS.mistake.steps);
  assert.ok(sevs(r).includes('critical'));
  assert.equal(r.grade, 'F');
});

test('careful path scores well', () => {
  const r = analyze(PRESETS.careful.steps);
  assert.ok(r.score >= 75, `score ${r.score}: ${JSON.stringify(r.findings.map((f) => f.title))}`);
});

test('staying shielded is an A and hides every sender, recipient and amount', () => {
  const r = analyze(PRESETS.staying.steps);
  assert.equal(r.grade, 'A');
  assert.ok(r.stayedShielded);
  const sendRow = r.observer.find((o) => o.type === 'send');
  assert.ok(sendRow.hidden.some((h) => h.startsWith('Amount')));
  assert.ok(!sendRow.visible.some((v) => /ZEC/.test(v)));
});

test('leaky preset trips pool crossing, transparent send and loop detection', () => {
  const titles = analyze(PRESETS.leaky.steps).findings.map((f) => f.title).join('|');
  assert.match(titles, /crosses pools/);
  assert.match(titles, /fully public/);
  assert.match(titles, /returns to the address/);
});

test('amount gap lowers severity', () => {
  const mk = (gap) => analyze([
    { type: 'shield', amount: 4, hour: 0, pool: 'orchard', addr: 'A' },
    { type: 'unshield', amount: 4 - 0.0001, hour: gap, pool: 'orchard', addr: 'B' },
  ]).findings.find((f) => /matches/.test(f.title)).severity;
  assert.equal(mk(0.2), 'critical');
  assert.equal(mk(10), 'high');
  assert.equal(mk(100), 'medium');
  assert.equal(mk(400), 'low');
});

test('overspending is flagged and empty plan is safe', () => {
  const r = analyze([{ type: 'shield', amount: 1, hour: 0, pool: 'orchard', addr: 'A' }, { type: 'send', amount: 5, hour: 50, pool: 'orchard', addr: '' }]);
  assert.ok(r.findings.some((f) => /exceeds/.test(f.title)));
  assert.equal(analyze([]).findings.length, 0);
});
