import { $, $$, el, store } from './dom.js';
import { initTools, showTab } from './tools.js';

/* Theme ------------------------------------------------------------------ */
const root = document.documentElement;
const savedTheme = store.get('shroud.theme', null);
if (savedTheme) root.dataset.theme = savedTheme;
$('#theme').addEventListener('click', () => {
  const dark = (root.dataset.theme ?? (matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')) === 'dark';
  root.dataset.theme = dark ? 'light' : 'dark';
  store.set('shroud.theme', root.dataset.theme);
});

/* Hero ledger: what a transparent chain shows vs a shielded one --------- */
const PUB = [
  ['t1Xq…9fKd → t3Vz…ojdA', '12.4000'], ['t1Hs…DLbs → t1Qm…r7Wp', '0.8500'], ['t3Kd…2mNx → t1Ab…c4Ze', '240.0000'],
  ['t1Rf…8uTy → t3Pw…k1Lc', '3.1415'], ['t1Zn…5vBq → t1Gd…m9Xs', '57.2500'], ['t3Hy…0aQe → t1Lc…w3Rj', '1.0000'],
];
const PRIV_W = [[7, 7, 6], [9, 6, 5], [6, 9, 7], [8, 8, 5], [7, 6, 6], [9, 7, 7]];
function fillLedger() {
  const build = (kind) => {
    const frag = document.createDocumentFragment();
    const rows = kind === 'pub' ? PUB : PRIV_W;
    for (let rep = 0; rep < 2; rep++) rows.forEach((r) => {
      if (kind === 'pub') frag.append(el('div', { class: 'row' }, el('span', { text: r[0] }), el('b', { text: r[1] + ' ZEC' })));
      else {
        const bar = (w) => { const b = el('span', { class: 'bars' }); b.style.width = w + 'ch'; return b; };
        frag.append(el('div', { class: 'row' }, el('span', {}, bar(r[0]), ' → ', bar(r[1])), bar(r[2])));
      }
    });
    return frag;
  };
  $$('[data-rows]').forEach((n) => n.append(build(n.dataset.rows)));
}
fillLedger();

/* Course progress -------------------------------------------------------- */
const boxes = $$('#chapters input[type=checkbox]');
const saved = new Set(store.get('shroud.progress', []));
boxes.forEach((b) => { b.checked = saved.has(b.dataset.id); });
const chapters = $$('.chapter');
const railNav = $('#railnav');
chapters.forEach((c, i) => {
  railNav.append(el('li', {}, el('a', { href: '#' + c.id, 'data-for': c.id }, el('small', { text: String(i + 1).padStart(2, '0') }), c.dataset.title)));
});
const C = 2 * Math.PI * 52;
const fg = $('#ringfg');
fg.style.strokeDasharray = String(C);

function refreshProgress() {
  const done = boxes.filter((b) => b.checked);
  store.set('shroud.progress', done.map((b) => b.dataset.id));
  const pct = Math.round((done.length / boxes.length) * 100);
  fg.style.strokeDashoffset = String(C * (1 - pct / 100));
  $('#ringnum').textContent = pct + '%';
  chapters.forEach((c) => {
    const mine = $$('input', c);
    $(`[data-for="${c.id}"]`).classList.toggle('done', mine.length > 0 && mine.every((b) => b.checked));
  });
  $('#grad').hidden = pct < 100;
}
boxes.forEach((b) => b.addEventListener('change', refreshProgress));
refreshProgress();

const spy = new IntersectionObserver((entries) => {
  for (const e of entries) if (e.isIntersecting) {
    $$('#railnav a').forEach((a) => a.classList.toggle('on', a.dataset.for === e.target.id));
  }
}, { rootMargin: '-35% 0px -55% 0px' });
chapters.forEach((c) => spy.observe(c));

/* Reveal on scroll ------------------------------------------------------- */
const rev = new IntersectionObserver((entries) => entries.forEach((e) => {
  if (e.isIntersecting) { e.target.classList.add('in'); rev.unobserve(e.target); }
}), { threshold: 0.08 });
$$('.reveal').forEach((n) => rev.observe(n));

/* Tools and deep links --------------------------------------------------- */
initTools();
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-tab]');
  if (a) showTab(a.dataset.tab);
});
const hashTab = { '#lab': 'lab', '#inspect': 'inspect', '#request': 'request' }[location.hash];
if (hashTab) showTab(hashTab);

/* Live proof that nothing leaves the page -------------------------------- */
function countExternal() {
  const n = performance.getEntriesByType('resource').filter((r) => new URL(r.name, location.href).origin !== location.origin).length;
  $('#extreq').textContent = String(n);
}
countExternal();
if ('PerformanceObserver' in window) {
  try { new PerformanceObserver(countExternal).observe({ type: 'resource', buffered: true }); } catch { /* unsupported */ }
}
