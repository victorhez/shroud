// Leak Lab: a transparent, rule-based model of what a chain observer can learn from a plan.
// It models *public* protocol facts (what a transaction reveals) plus well-known linkage heuristics
// (amount matching, timing, address reuse). It does NOT model network-layer leaks or exchange KYC.
// The result is a hygiene check, never a guarantee.

export const FEE = 0.0001; // typical ZIP-317 fee for a small shielded tx, in ZEC
const AMOUNT_TOLERANCE = 0.002; // observers match amounts within a few fees

export const STEP_TYPES = {
  shield:   { label: 'Shield',        hint: 'Move transparent ZEC into a shielded pool' },
  send:     { label: 'Send privately', hint: 'Shielded to shielded' },
  unshield: { label: 'Unshield',      hint: 'Move shielded ZEC out to a transparent address' },
  tsend:    { label: 'Send publicly', hint: 'Transparent to transparent' },
};

export const PRESETS = {
  mistake: {
    name: 'The classic mistake',
    blurb: 'Shield, then pull the exact same amount back out to the same place, minutes later.',
    steps: [
      { type: 'shield', amount: 10, hour: 0, pool: 'orchard', addr: 'A' },
      { type: 'unshield', amount: 10, hour: 0.5, pool: 'orchard', addr: 'A' },
    ],
  },
  careful: {
    name: 'A careful path',
    blurb: 'Shield, let it sit, spend privately, and only unshield a different amount to a fresh address.',
    steps: [
      { type: 'shield', amount: 10, hour: 0, pool: 'orchard', addr: 'A' },
      { type: 'send', amount: 3.17, hour: 80, pool: 'orchard', addr: '' },
      { type: 'unshield', amount: 1.25, hour: 190, pool: 'orchard', addr: 'B' },
    ],
  },
  staying: {
    name: 'Stay shielded',
    blurb: 'Receive transparently once, shield it, then never leave the pool.',
    steps: [
      { type: 'shield', amount: 2.5, hour: 0, pool: 'orchard', addr: 'A' },
      { type: 'send', amount: 0.4, hour: 30, pool: 'orchard', addr: '' },
      { type: 'send', amount: 0.9, hour: 120, pool: 'orchard', addr: '' },
    ],
  },
  leaky: {
    name: 'Death by a thousand leaks',
    blurb: 'Transparent hops, a pool switch and a split unshield. Every step gives something away.',
    steps: [
      { type: 'tsend', amount: 5, hour: 0, pool: 'orchard', addr: 'A' },
      { type: 'shield', amount: 5, hour: 1, pool: 'sapling', addr: 'A' },
      { type: 'send', amount: 5 - FEE, hour: 2, pool: 'orchard', addr: '' },
      { type: 'unshield', amount: 2, hour: 3, pool: 'orchard', addr: 'A' },
      { type: 'unshield', amount: 2.9, hour: 4, pool: 'orchard', addr: 'A' },
    ],
  },
};

const SEVERITY = { critical: 40, high: 25, medium: 12, low: 5 };
const fmt = (n) => Number(n.toFixed(8)).toString();
const gapText = (h) => (h < 1 ? `${Math.round(h * 60)} minutes` : h < 48 ? `${Math.round(h)} hours` : `${Math.round(h / 24)} days`);
const near = (a, b) => Math.abs(a - b) <= AMOUNT_TOLERANCE;

/** @param {{type:string, amount:number, hour:number, pool:string, addr:string}[]} rawSteps */
export function analyze(rawSteps) {
  const steps = rawSteps
    .map((s, i) => ({ ...s, amount: Number(s.amount), hour: Number(s.hour), id: i }))
    .filter((s) => s.amount > 0 && Number.isFinite(s.hour))
    .sort((a, b) => a.hour - b.hour || a.id - b.id);

  const observer = [], findings = [], shields = [];
  let shielded = 0, pool = null;
  const add = (severity, step, title, why, fix) => findings.push({ severity, step: step.n, title, why, fix });

  steps.forEach((s, n) => {
    s.n = n;
    const row = { n, type: s.type, hour: s.hour, visible: [], hidden: [], balance: 0 };
    const where = `${STEP_TYPES[s.type].label} ${fmt(s.amount)} ZEC`;

    if (s.type === 'tsend') {
      row.visible.push(`Sender and recipient addresses`, `Exact amount: ${fmt(s.amount)} ZEC`, 'Timestamp');
      add('critical', s, `${where}: fully public`,
        'Transparent transactions publish who paid whom and how much. Anyone can follow the coin forward.',
        'If privacy matters for this coin, shield it first and pay from the shielded pool.');
    }

    if (s.type === 'shield') {
      row.visible.push(`Source transparent address "${s.addr || '?'}"`, `Amount entering the pool: ${fmt(s.amount)} ZEC`, `Pool: ${s.pool}`, 'Timestamp');
      row.hidden.push('Which shielded address received it', 'Anything you do with it afterwards');
      shielded += s.amount - FEE; pool = s.pool;
      shields.push(s);
      if (Number(s.amount.toFixed(8)) !== Math.round(s.amount * 1000) / 1000) {
        add('low', s, `${where}: unusually precise amount`,
          'A rare, precise amount is easy to spot again later when it re-emerges. Round amounts blend into more transactions.',
          'Prefer common amounts when entering and leaving, and split the remainder inside the pool.');
      }
    }

    if (s.type === 'send') {
      if (shielded + 1e-9 < s.amount + FEE) {
        add('medium', s, `${where}: exceeds your shielded balance`, `Only ${fmt(Math.max(0, shielded))} ZEC is shielded at this point.`, 'Shield more first or reduce the amount.');
      }
      row.visible.push('That a shielded transaction happened', 'Approximate size and the fee');
      row.hidden.push('Sender', 'Recipient', `Amount (${fmt(s.amount)} ZEC)`, 'Memo contents');
      if (pool && s.pool !== pool) {
        row.visible.push(`Net value crossing ${pool} to ${s.pool}: ${fmt(s.amount)} ZEC`);
        row.hidden = row.hidden.filter((h) => !h.startsWith('Amount'));
        add('high', s, `${where}: crosses pools (${pool} to ${s.pool})`,
          'Moving value between shielded pools reveals the amount that crossed at the boundary, which can be matched to other activity.',
          'Stay inside one pool (Orchard is the best default), or move whole round amounts and then wait.');
        pool = s.pool;
      }
      shielded -= s.amount + FEE;
    }

    if (s.type === 'unshield') {
      if (shielded + 1e-9 < s.amount + FEE) {
        add('medium', s, `${where}: exceeds your shielded balance`, `Only ${fmt(Math.max(0, shielded))} ZEC is shielded at this point.`, 'Shield more first or reduce the amount.');
      }
      row.visible.push(`Recipient transparent address "${s.addr || '?'}"`, `Amount leaving the pool: ${fmt(s.amount)} ZEC`, `Pool: ${s.pool}`, 'Timestamp');
      row.hidden.push('Which shielded address it came from', 'Everything that happened inside the pool');
      if (pool && s.pool !== pool) pool = s.pool;
      shielded -= s.amount + FEE;

      // heuristic: single-shield exact amount match
      const matches = shields.filter((sh) => sh.hour <= s.hour && near(sh.amount, s.amount));
      for (const m of matches) {
        const gap = s.hour - m.hour;
        const sev = gap < 1 ? 'critical' : gap < 24 ? 'high' : gap < 168 ? 'medium' : 'low';
        add(sev, s, `${where}: matches the ${fmt(m.amount)} ZEC shield ${gapText(gap)} earlier`,
          'An observer sees value enter and the same value leave. With a small gap and few other transactions, the two are trivially linked.',
          'Unshield a different amount, wait much longer, or split across several smaller withdrawals at unrelated times.');
      }
      // heuristic: combination of up to 3 shields sums to this amount
      if (!matches.length) {
        const prior = shields.filter((sh) => sh.hour <= s.hour);
        for (let i = 0; i < prior.length; i++) for (let j = i + 1; j < prior.length; j++) {
          const sum2 = prior[i].amount + prior[j].amount;
          const sum3 = prior.slice(j + 1).map((k) => sum2 + k.amount);
          const hit = near(sum2, s.amount) ? [prior[i], prior[j]] : sum3.some((v) => near(v, s.amount)) ? [prior[i], prior[j]] : null;
          if (hit) add('medium', s, `${where}: equals the sum of earlier shields`,
            'Amounts that add up cleanly are a classic subset-sum link.', 'Avoid withdrawing the exact total of earlier deposits.');
        }
      }
      // heuristic: round trip to the same transparent address
      const loop = shields.find((sh) => sh.addr && sh.addr === s.addr && sh.hour <= s.hour);
      if (loop) {
        add('critical', s, `${where}: returns to the address that funded the shield ("${s.addr}")`,
          'This closes the loop on-chain. The pool in the middle changes nothing about who you are.',
          'Always unshield to a fresh transparent address, or better, never unshield at all.');
      }
      // heuristic: timing proximity without amount match
      if (!matches.length && shields.some((sh) => s.hour - sh.hour >= 0 && s.hour - sh.hour < 2)) {
        add('medium', s, `${where}: leaves within 2 hours of a shield`,
          'Quick in-and-out timing correlates deposits and withdrawals even when amounts differ.', 'Let funds rest. Days, not minutes.');
      }
      if (n > 0 && steps[n - 1].type === 'unshield' && s.hour - steps[n - 1].hour < 6 && s.addr === steps[n - 1].addr) {
        add('medium', s, `${where}: split withdrawal to the same address`,
          'Splitting one exit into pieces to the same address and time just re-merges them for the observer.', 'Space exits out and use different addresses.');
      }
    }

    row.balance = Math.max(0, shielded);
    observer.push(row);
  });

  // dedupe near-identical findings
  const seen = new Set();
  const unique = findings.filter((f) => { const k = f.step + f.title; if (seen.has(k)) return false; seen.add(k); return true; });
  const penalty = unique.reduce((sum, f) => sum + SEVERITY[f.severity], 0);
  const score = Math.max(0, 100 - penalty);
  const grade = score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 55 ? 'C' : score >= 30 ? 'D' : 'F';
  const stayed = steps.length > 0 && !steps.some((s) => s.type === 'unshield' || s.type === 'tsend');
  return { steps, observer, findings: unique.sort((a, b) => SEVERITY[b.severity] - SEVERITY[a.severity]), score, grade, stayedShielded: stayed };
}
