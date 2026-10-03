import { $, $$, el, copy, toast } from './dom.js';
import { inspect, RECEIVER } from './zcash/address.js';
import { buildPaymentUri, MAX_MEMO_BYTES } from './zcash/zip321.js';
import { base58CheckEncode } from './zcash/checksums.js';
import { concat } from './zcash/bytes.js';
import { analyze, PRESETS, STEP_TYPES } from './leaklab.js';

/* Tabs ------------------------------------------------------------------- */
const TABS = ['lab', 'inspect', 'request'];
export function showTab(name) {
  TABS.forEach((t) => {
    const on = t === name;
    $('#t-' + t).setAttribute('aria-selected', String(on));
    $('#p-' + t).hidden = !on;
  });
  $$('.nav a[data-tab]').forEach((a) => a.classList.toggle('on', a.dataset.tab === name));
}

// Public ZIP-316 test vector (zcash-test-vectors) and a synthetic transparent address.
const SAMPLE_UA = 'u1pg2aaph7jp8rpf6yhsza25722sg5fcn3vaca6ze27hqjw7jvvhhuxkpcg0ge9xh6drsgdkda8qjq5chpehkcpxf87rnjryjqwymdheptpvnljqqrjqzjwkc2ma6hcq666kgwfytxwac8eyex6ndgr6ezte66706e3vaqrd25dzvzkc69kw0jgywtd0cmq52q5lkw6uh7hyvzjse8ksx';
const SAMPLE_T = base58CheckEncode(concat(Uint8Array.of(0x1c, 0xb8), new Uint8Array(20).fill(0x42)));

/* Address Inspector ------------------------------------------------------ */
function initInspector() {
  const input = $('#addr'), out = $('#inspect-out');
  const run = () => {
    const info = inspect(input.value);
    out.className = 'result ' + (info.kind === 'empty' ? 'empty' : info.verdict?.level ?? info.kind);
    out.replaceChildren();
    if (info.kind === 'empty') { out.append(el('p', { text: 'Paste an address to take it apart.' })); return; }
    if (info.kind === 'secret') {
      out.append(el('h4', { text: 'Stop. That’s ' + info.what + '.' }), el('p', { text: info.detail }),
        el('p', { text: 'We cleared it from the box and did not store it. Never paste secrets into any website, including this one.' }));
      input.value = '';
      return;
    }
    if (info.kind === 'invalid') {
      out.append(el('h4', { text: 'Not a valid address' }), el('p', { class: 'recv-note', text: info.error }));
      return;
    }
    out.append(
      el('h4', { text: info.title }),
      el('div', { class: 'meta', text: [info.networkName, info.receivers.length ? `${info.receivers.length} receiver${info.receivers.length > 1 ? 's' : ''}` : 'legacy'].join(' · ') }),
    );
    if (info.receivers.length) {
      out.append(el('div', { class: 'chips' }, info.receivers.map((r) => el('span', { class: 'chip ' + (RECEIVER[r].shielded ? 's' : 't'), text: RECEIVER[r].label }))));
      info.receivers.forEach((r) => out.append(el('p', { class: 'recv-note', text: RECEIVER[r].label + ': ' + RECEIVER[r].note })));
    }
    if (info.unknown?.length) out.append(el('p', { class: 'recv-note', text: `Also contains ${info.unknown.length} receiver type(s) this tool doesn’t know yet (typecode ${info.unknown.join(', ')}). That’s normal for newer addresses.` }));
    out.append(el('p', { class: 'msg ' + (info.verdict.level === 'private' ? '' : info.verdict.level === 'ok' ? 'warn' : 'err'), text: info.verdict.text }));
    if (info.network !== 'main') out.append(el('p', { class: 'msg warn', text: 'This is not a mainnet address. Funds sent here are not real ZEC.' }));
  };
  input.addEventListener('input', run);
  $('#sample-u').addEventListener('click', () => { input.value = SAMPLE_UA; run(); });
  $('#sample-t').addEventListener('click', () => { input.value = SAMPLE_T; run(); });
  $('#clear-addr').addEventListener('click', () => { input.value = ''; run(); input.focus(); });
}

/* Request Builder + QR --------------------------------------------------- */
function drawQr(canvas, text) {
  const make = (level) => { const q = globalThis.qrcode(0, level); q.addData(text, 'Byte'); q.make(); return q; };
  let q;
  try { q = make('M'); } catch { try { q = make('L'); } catch { return false; } }
  const n = q.getModuleCount(), px = 8, margin = 4, size = (n + margin * 2) * px;
  canvas.width = canvas.height = size;
  const g = canvas.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, size, size);
  g.fillStyle = '#000';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) g.fillRect((c + margin) * px, (r + margin) * px, px, px);
  return true;
}

function initRequest() {
  const f = { addr: $('#rq-addr'), amt: $('#rq-amt'), memo: $('#rq-memo'), msg: $('#rq-msg') }, out = $('#rq-out');
  const run = () => {
    const bytes = new TextEncoder().encode(f.memo.value).length;
    $('#memo-count').textContent = `${bytes} / ${MAX_MEMO_BYTES} bytes`;
    out.replaceChildren();
    if (!f.addr.value.trim()) { out.append(el('p', { class: 'hint', text: 'Fill in an address to generate a ZIP-321 link and QR code.' })); return; }
    const r = buildPaymentUri({ address: f.addr.value, amount: f.amt.value.trim(), memo: f.memo.value, message: f.msg.value });
    r.errors.forEach((e) => out.append(el('p', { class: 'msg err', text: e })));
    if (!r.uri) return;
    const canvas = el('canvas', { 'aria-label': 'QR code for the payment request', role: 'img' });
    if (drawQr(canvas, r.uri)) out.append(el('div', { class: 'qr-box' }, canvas));
    else out.append(el('p', { class: 'msg warn', text: 'Too long for a QR code. Shorten the memo or label, or share the link instead.' }));
    out.append(
      el('div', { class: 'uri mono', text: r.uri }),
      el('div', { class: 'actions' },
        el('button', { class: 'btn small primary', type: 'button', text: 'Copy link', onclick: () => copy(r.uri, 'Payment link copied') }),
        el('button', { class: 'btn small', type: 'button', text: 'Download QR', onclick: () => canvas.toBlob((b) => {
          const a = el('a', { href: URL.createObjectURL(b), download: 'zcash-payment-request.png' });
          a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000); toast('QR saved');
        }) })),
    );
    r.warnings.forEach((w) => out.append(el('p', { class: 'msg warn', text: w })));
  };
  Object.values(f).forEach((i) => i.addEventListener('input', run));
  $('#rq-sample').addEventListener('click', () => { f.addr.value = SAMPLE_UA; run(); });
  run();
}

/* Leak Lab --------------------------------------------------------------- */
const POOLS = [['orchard', 'Orchard'], ['sapling', 'Sapling']];
const ADDRS = ['A', 'B', 'C', 'D'];
const SEV_LABEL = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low' };
const GAUGE_C = 2 * Math.PI * 48;

function initLab() {
  let steps = structuredClone(PRESETS.mistake.steps), active = 'mistake';
  const stepsEl = $('#steps');

  const presetBar = $('#presets');
  Object.entries(PRESETS).forEach(([key, p]) => {
    presetBar.append(el('button', { class: 'preset', type: 'button', 'aria-pressed': String(key === active), title: p.blurb, 'data-key': key, text: p.name, onclick: () => {
      steps = structuredClone(p.steps); active = key;
      $$('.preset').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.key === key)));
      renderSteps(); renderResults();
    } }));
  });

  const select = (opts, value, label, onchange) => {
    const s = el('select', { 'aria-label': label }, opts.map(([v, t]) => el('option', { value: v, text: t })));
    s.value = value; s.addEventListener('change', () => onchange(s.value)); return s;
  };
  const num = (value, label, min, step, onchange) => {
    const i = el('input', { type: 'number', min, step, value, 'aria-label': label });
    i.addEventListener('input', () => onchange(i.value)); return i;
  };

  function renderSteps() {
    stepsEl.replaceChildren();
    steps.forEach((s, i) => {
      const touch = () => { active = null; $$('.preset').forEach((b) => b.setAttribute('aria-pressed', 'false')); renderResults(); };
      const needsAddr = s.type !== 'send';
      const opt = el('div', { class: 'opt' });
      const mkOpt = () => {
        opt.replaceChildren();
        if (s.type !== 'tsend') opt.append(select(POOLS, s.pool, 'Shielded pool', (v) => { s.pool = v; touch(); }));
        else opt.append(el('span'));
        if (needsAddr) opt.append(select(ADDRS.map((a) => [a, 'Transparent addr ' + a]), s.addr || 'A', 'Transparent address', (v) => { s.addr = v; touch(); }));
      };
      mkOpt();
      stepsEl.append(el('div', { class: 'step' },
        el('span', { class: 'idx', text: String(i + 1) }),
        select(Object.entries(STEP_TYPES).map(([k, v]) => [k, v.label]), s.type, 'Action', (v) => { s.type = v; if (v !== 'send' && !s.addr) s.addr = 'A'; renderSteps(); touch(); }),
        num(s.amount, 'Amount in ZEC', '0', 'any', (v) => { s.amount = Number(v); touch(); }),
        num(s.hour, 'Hours after the first step', '0', 'any', (v) => { s.hour = Number(v); touch(); }),
        el('button', { class: 'x', type: 'button', 'aria-label': 'Remove step', text: '×', onclick: () => { steps.splice(i, 1); renderSteps(); touch(); } }),
        opt,
      ));
    });
    if (!steps.length) stepsEl.append(el('p', { class: 'hint', text: 'No steps yet. Add one or pick a scenario above.' }));
  }

  $('#addstep').addEventListener('click', () => {
    const last = steps.at(-1);
    steps.push({ type: 'send', amount: 1, hour: (last?.hour ?? 0) + 24, pool: last?.pool ?? 'orchard', addr: 'A' });
    active = null; $$('.preset').forEach((b) => b.setAttribute('aria-pressed', 'false'));
    renderSteps(); renderResults();
  });

  function renderResults() {
    const r = analyze(steps);
    const color = r.score >= 75 ? 'var(--good)' : r.score >= 55 ? 'var(--gold)' : 'var(--bad)';
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg'); svg.setAttribute('viewBox', '0 0 112 112'); svg.setAttribute('aria-hidden', 'true');
    const bg = document.createElementNS(svgNS, 'circle'), fgc = document.createElementNS(svgNS, 'circle');
    [bg, fgc].forEach((c) => { c.setAttribute('cx', '56'); c.setAttribute('cy', '56'); c.setAttribute('r', '48'); svg.append(c); });
    bg.setAttribute('class', 'bg'); fgc.setAttribute('class', 'fg');
    fgc.style.strokeDasharray = String(GAUGE_C);
    fgc.style.strokeDashoffset = String(GAUGE_C * (1 - r.score / 100));
    fgc.style.stroke = color;
    const headline = !steps.length ? 'Nothing planned' : r.stayedShielded && !r.findings.length ? 'Fully inside the pool' : r.score >= 90 ? 'Looks clean' : r.score >= 75 ? 'Mostly fine' : r.score >= 55 ? 'Linkable in places' : 'Easy to trace';
    const sub = !steps.length ? 'Add a step to begin.' : `${r.findings.length} finding${r.findings.length === 1 ? '' : 's'} · privacy score ${r.score}/100`;
    const g = el('div', { class: 'g', text: steps.length ? r.grade : '–' }); g.style.color = color;
    $('#score').replaceChildren(el('div', { class: 'gauge', role: 'img', 'aria-label': `Grade ${r.grade}` }, svg, g), el('div', {}, el('h4', { text: headline }), el('p', { text: sub })));

    $('#timeline').replaceChildren(...r.observer.map((o) => el('div', { class: 'obs' },
      el('h5', {}, el('span', { text: `${o.n + 1}. ${STEP_TYPES[o.type].label}` }), el('span', { text: `t+${Number(o.hour.toFixed(1))}h` })),
      el('ul', {}, o.visible.map((v) => el('li', { class: 'v', text: v })), o.hidden.map((h) => el('li', { class: 'h', text: h }))))));

    const fe = $('#findings');
    fe.replaceChildren();
    if (!r.findings.length && steps.length) fe.append(el('p', { class: 'clean', text: '✓ No linkage patterns found for this plan.' }));
    r.findings.forEach((f) => fe.append(el('div', { class: 'find ' + f.severity },
      el('b', {}, el('span', { class: 'sev', text: SEV_LABEL[f.severity] }), f.title),
      el('p', { text: f.why }), el('p', { class: 'fix', text: 'Fix: ' + f.fix }))));
  }

  renderSteps(); renderResults();
}

export function initTools() {
  initLab(); initInspector(); initRequest();
  TABS.forEach((t) => $('#t-' + t).addEventListener('click', () => showTab(t)));
  $('.tabs').addEventListener('keydown', (e) => {
    const i = TABS.findIndex((t) => $('#t-' + t).getAttribute('aria-selected') === 'true');
    const next = e.key === 'ArrowRight' ? i + 1 : e.key === 'ArrowLeft' ? i - 1 : null;
    if (next == null) return;
    const t = TABS[(next + TABS.length) % TABS.length]; showTab(t); $('#t-' + t).focus();
  });
}
