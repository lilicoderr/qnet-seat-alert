// 시험장별 잔여석 계단형 그래프(작은 그래프 여러 개, 같은 시간축/세로축). 글자는 모두 textContent 로 넣는다.
import { kstShort } from './format.js';

const NS = 'http://www.w3.org/2000/svg';
const W = 300, H = 110, L = 28, R = 8, T = 8, B = 18;

export function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  node.append(...children);
  return node;
}
function svg(tag, attrs, text) {
  const node = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

function venueChart(v, { from, to, yMax }) {
  const x = (t) => L + ((t - from) / (to - from)) * (W - L - R);
  const y = (n) => H - B - (n / yMax) * (H - T - B);
  const root = svg('svg', { class: 'chart', viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': `${v.place} ${v.date} 잔여석 변화, 최근 ${v.last}석` });
  for (const n of [0, yMax]) {
    root.append(svg('line', { class: 'grid', x1: L, x2: W - R, y1: y(n), y2: y(n) }), svg('text', { x: L - 5, y: y(n) + 4, 'text-anchor': 'end' }, String(n)));
  }
  root.append(svg('text', { x: L, y: H - 4 }, kstShort(from)), svg('text', { x: W - R, y: H - 4, 'text-anchor': 'end' }, kstShort(to)));
  const pts = v.points;
  let d = `M${x(pts[0][0])},${y(pts[0][1])}`;
  for (let i = 1; i < pts.length; i++) d += `H${x(pts[i][0])}V${y(pts[i][1])}`;
  const lastPt = pts[pts.length - 1];
  root.append(svg('path', { class: 'area', d: `${d}V${y(0)}H${x(pts[0][0])}Z` }), svg('path', { class: 'line', d }), svg('circle', { class: 'dot', cx: x(lastPt[0]), cy: y(lastPt[1]), r: 4 }));
  const cross = svg('line', { class: 'cross', y1: T, y2: H - B, x1: 0, x2: 0, visibility: 'hidden' });
  root.append(cross);
  const tip = el('div', { class: 'tip' });
  tip.hidden = true;
  root.addEventListener('pointermove', (ev) => {
    const box = root.getBoundingClientRect();
    const at = from + (((ev.clientX - box.left) / box.width) * W - L) / (W - L - R) * (to - from);
    const p = pts.reduce((a, b) => (Math.abs(b[0] - at) < Math.abs(a[0] - at) ? b : a));
    cross.setAttribute('x1', x(p[0]));
    cross.setAttribute('x2', x(p[0]));
    cross.setAttribute('visibility', 'visible');
    tip.textContent = `${kstShort(p[0])} KST · ${p[1]}석`;
    tip.hidden = false;
    tip.style.right = '8px';
  });
  root.addEventListener('pointerleave', () => { tip.hidden = true; cross.setAttribute('visibility', 'hidden'); });
  return [root, tip];
}

// 접근성: 그래프와 같은 내용을 표로도 볼 수 있다.
function summaryTable(venues) {
  const head = el('tr', {}, ...['지역', '시험장', '시험일자', '최근', '기간 중 최대', '마지막 기록(KST)'].map((h) => el('th', {}, h)));
  const rows = venues.map((v) => el('tr', {}, ...[v.region, v.place, v.date, `${v.last}석`, `${Math.max(...v.points.map((p) => p[1]))}석`, kstShort(v.lastAt)].map((c) => el('td', {}, c))));
  return el('details', {}, el('summary', {}, '표로 보기'), el('div', { class: 'scroll' }, el('table', {}, el('thead', {}, head), el('tbody', {}, ...rows))));
}

export function renderCharts(container, data) {
  if (!data.watchers.length) {
    container.replaceChildren(el('p', { class: 'muted' }, '아직 이 기간의 기록이 없습니다. 접수 중인 시험을 감시하면 확인할 때마다 쌓입니다.'));
    return;
  }
  const from = data.now - data.hours * 3600000;
  container.replaceChildren(...data.watchers.flatMap((w) => {
    const yMax = Math.max(1, ...w.venues.flatMap((v) => v.points.map((p) => p[1])));
    const cards = w.venues.map((v) => el('figure', {},
      el('figcaption', {}, el('strong', {}, v.place), `${v.region} · ${v.date} · 정원 ${v.capacity ?? '-'} · `, el('span', { class: v.last > 0 ? 'good' : 'muted' }, v.last > 0 ? `● 최근 ${v.last}석` : '최근 마감')),
      ...venueChart(v, { from, to: data.now, yMax })));
    const more = w.total > w.venues.length ? ` (${w.total}곳 중 ${w.venues.length}곳 표시)` : '';
    return [el('h3', {}, `${w.name} · 세로축: 잔여석${more}`), el('div', { class: 'venues' }, ...cards), summaryTable(w.venues)];
  }));
}
