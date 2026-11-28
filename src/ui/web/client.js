// 설정 화면 동작. 세션 열쇠는 주소의 #t= 에서 읽어 이 탭에만 보관한다. 서버 값은 textContent 로만 넣는다.
import { kst, costText } from './format.js';
import { el, renderCharts } from './chart.js';

const $ = (id) => document.getElementById(id);

function takeToken() {
  const m = /^#t=([\w-]+)$/.exec(location.hash);
  if (m) {
    sessionStorage.setItem('qnet-token', m[1]);
    history.replaceState(null, '', location.pathname);
  }
  return sessionStorage.getItem('qnet-token') || '';
}
let token = takeToken();
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#t=')) location.reload(); });

function banner(text) {
  $('banner').textContent = text;
  $('banner').hidden = !text;
}

async function api(path, body) {
  let res;
  try {
    res = await fetch(path, body === undefined
      ? { headers: { 'X-QNet-Token': token } }
      : { method: 'POST', headers: { 'X-QNet-Token': token, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  } catch {
    banner('프로그램에 연결할 수 없습니다. qnet-alert ui 를 실행한 창이 켜져 있는지 확인하세요.');
    throw new Error('연결 실패');
  }
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) banner('열쇠가 맞지 않습니다. qnet-alert ui 를 실행한 창에 나온 주소(#t=... 포함)를 다시 붙여 넣으세요.');
  else banner('');
  if (!res.ok) throw new Error(data.message || `요청 실패 (${res.status} ${data.error || ''})`);
  return data;
}

function say(id, text, kind = '') {
  $(id).textContent = text;
  $(id).className = `msg ${kind}`;
}

// 버튼 하나의 작업: 중복 클릭을 막고 오류를 그 자리에 보여 준다.
async function run(button, msgId, work) {
  if (button) button.disabled = true;
  say(msgId, '처리 중...');
  try { say(msgId, (await work()) || '', 'good'); } catch (e) { say(msgId, e.message, 'bad'); }
  if (button) button.disabled = false;
}

function fill(select, items, placeholder) {
  select.replaceChildren(el('option', { value: '' }, placeholder), ...items.map(([value, label]) => el('option', { value }, label)));
  select.disabled = !items.length;
}

function badge(id, on, yes, no) {
  $(id).textContent = on ? yes : no;
  $(id).className = `badge ${on ? 'good' : 'bad'}`;
}

function showSecrets(s) {
  badge('webhook-state', s.webhookSet, '웹훅 저장됨', '웹훅 없음');
  badge('mention-state', s.mentionCount > 0, `멘션 ${s.mentionCount}명`, '멘션 없음');
}

function showView(v) {
  const s = v.selection;
  $('current').textContent = s ? `저장된 감시: ${s.name} · 종목 ${s.jongmok} · 지역 ${s.region || '전국'} · ${v.intervalMin}분마다` : '저장된 선택이 없습니다.';
  $('interval').value = v.intervalMin > 1 || s ? v.intervalMin : 3;
  $('disclaimer').textContent = v.disclaimer;
  $('sample').hidden = !v.sample;
  showSecrets(v.secrets);
}

async function showCost() {
  const intervalMin = Number($('interval').value);
  try {
    $('cost').textContent = costText(await api('/api/cost', { intervalMin, region: $('region').value || savedRegion }));
  } catch (e) { $('cost').textContent = e.message; }
}
let savedRegion = '';

$('load-exams').addEventListener('click', () => run($('load-exams'), 'options-msg', async () => {
  const r = await api('/api/options/exams', {});
  fill($('exam'), r.exams.map((e) => [e.key, `${e.name} (${e.period})`]), r.exams.length ? '시험을 고르세요' : '접수 중인 시험 없음');
  fill($('jongmok'), [], '시험을 먼저 고르세요');
  fill($('region'), [], '종목을 먼저 고르세요');
  if (r.exams.length) return `접수 중인 시험 ${r.exams.length}개를 불러왔습니다.`;
  const next = r.upcoming.map((e) => `${e.name} (${e.period})`).join(', ');
  return `지금 접수 중인 시험이 없습니다.${next ? ` 접수 예정: ${next}.` : ''} 접수가 열린 뒤 다시 불러오세요.`;
}));

$('exam').addEventListener('change', () => {
  fill($('jongmok'), [], '시험을 먼저 고르세요');
  fill($('region'), [], '종목을 먼저 고르세요');
  const exam = $('exam').value;
  if (!exam) return;
  run(null, 'options-msg', async () => {
    const r = await api('/api/options/jongmok', { exam });
    if ($('exam').value === exam) fill($('jongmok'), r.jongmok.map((n) => [n, n]), '종목을 고르세요');
  });
});

$('jongmok').addEventListener('change', () => {
  fill($('region'), [], '종목을 먼저 고르세요');
  const [exam, jongmok] = [$('exam').value, $('jongmok').value];
  if (!jongmok) return;
  run(null, 'options-msg', async () => {
    const r = await api('/api/options/regions', { exam, jongmok });
    if ($('jongmok').value !== jongmok) return '';
    fill($('region'), [...r.regions.map((n) => [n, n]), ['*', '전국 (요청이 더 많음)']], '지역을 고르세요');
    return '';
  });
});

$('interval').addEventListener('input', showCost);
$('region').addEventListener('change', () => { if ($('region').value) showCost(); });

$('save-settings').addEventListener('click', () => run($('save-settings'), 'settings-msg', async () => {
  const body = { intervalMin: Number($('interval').value) };
  if ($('exam').value) {
    if (!$('jongmok').value || !$('region').value) throw new Error('종목과 지역까지 고르세요.');
    Object.assign(body, { exam: $('exam').value, jongmok: $('jongmok').value, region: $('region').value === '*' ? '' : $('region').value });
  }
  const v = await api('/api/settings', body);
  savedRegion = v.selection?.region || '';
  showView(v);
  $('cost').textContent = costText(v.cost);
  await refresh();
  return '저장했습니다 (config.json).';
}));

// 비밀값은 보낸 뒤 입력칸에서 바로 지운다.
function secrets(button, body, done) {
  return run(button, 'secrets-msg', async () => {
    showSecrets(await api('/api/secrets', body));
    $('webhook').value = '';
    $('mentions').value = '';
    return done;
  });
}
$('save-secrets').addEventListener('click', () => {
  if (!$('webhook').value.trim() && !$('mentions').value.trim()) return say('secrets-msg', '저장할 값을 입력하세요.', 'bad');
  return secrets($('save-secrets'), { webhook: $('webhook').value, mentionUsers: $('mentions').value }, '.env 에 저장했습니다. 값은 다시 표시하지 않습니다.');
});
$('clear-webhook').addEventListener('click', () => { if (confirm('저장한 웹훅 URL 을 지울까요?')) secrets($('clear-webhook'), { clearWebhook: true }, '웹훅을 지웠습니다.'); });
$('clear-mentions').addEventListener('click', () => { if (confirm('저장한 멘션 ID 를 지울까요?')) secrets($('clear-mentions'), { clearMentions: true }, '멘션 ID 를 지웠습니다.'); });

$('test-alert').addEventListener('click', () => run($('test-alert'), 'secrets-msg', async () => {
  const r = await api('/api/test-alert', {});
  if (r.errors.length) throw new Error(`${r.total}개 채널 중 ${r.delivered}개 전송. 오류: ${r.errors.join(' / ')}`);
  return `테스트 알림을 ${r.delivered}개 채널로 보냈습니다. Discord 에서 확인하세요.`;
}));

function showStatus(s) {
  badge('run-state', s.running, s.checking ? '감시 중 (확인하는 중)' : '감시 중', '중지됨');
  $('start').disabled = s.running;
  $('stop').disabled = !s.running;
  $('last-check').textContent = kst(s.lastCheckAt);
  $('next-check').textContent = s.running ? (s.checking ? '확인하는 중' : kst(s.nextCheckAt)) : '-';
  say('watch-msg', s.lastError || '', 'bad');
  const rows = s.results.map((r) => el('tr', {},
    el('td', {}, r.name),
    el('td', { class: r.ok && !r.note ? 'good' : 'bad' }, !r.ok ? '✕ 오류' : r.note ? '! 값 없음' : '✓ 정상'),
    el('td', {}, r.available === null ? '-' : `${r.available}석`),
    el('td', {}, [r.error, r.note, r.alerted ? '알림 보냄' : ''].filter(Boolean).join(' · '))));
  $('status-rows').replaceChildren(...(rows.length ? rows : [el('tr', {}, el('td', { colspan: '4', class: 'muted' }, '아직 확인한 결과가 없습니다.'))]));
  const venues = s.results.flatMap((r) => r.venues || []).sort((a, b) => b.open - a.open);
  $('venue-now').replaceChildren(...(venues.length ? [el('h3', {}, `마지막 확인의 시험장 ${venues.length}곳`), el('div', { class: 'scroll' }, el('table', {},
    el('thead', {}, el('tr', {}, ...['지역', '시험장', '시험일자', '정원', '잔여'].map((h) => el('th', {}, h)))),
    el('tbody', {}, ...venues.map((v) => el('tr', { class: v.open > 0 ? 'open' : '' }, ...[v.region, v.place, v.date, String(v.capacity ?? '-')].map((c) => el('td', {}, c)), el('td', { class: v.open > 0 ? 'good' : 'muted' }, v.open > 0 ? `● ${v.open}석` : '마감'))))))] : []));
}

async function loadHistory() {
  renderCharts($('charts'), await api(`/api/history?hours=${Number($('hours').value)}`));
}

let lastSeen;
async function refresh() {
  const s = await api('/api/status');
  showStatus(s);
  const key = `${s.lastCheckAt}|${s.checking}`;
  if (key !== lastSeen) {
    await loadHistory();
    lastSeen = key;
  }
}

const control = (button, path) => run(button, 'watch-msg', async () => { await api(path, {}); await refresh(); });
$('start').addEventListener('click', async () => { await control($('start'), '/api/watch/start'); $('start').disabled = $('run-state').textContent !== '중지됨'; });
$('stop').addEventListener('click', async () => { await control($('stop'), '/api/watch/stop'); $('stop').disabled = $('run-state').textContent === '중지됨'; });
$('hours').addEventListener('change', () => loadHistory().catch((e) => banner(e.message)));

async function init() {
  const v = await api('/api/state');
  savedRegion = v.selection?.region || '';
  showView(v);
  $('cost').textContent = costText(v.cost);
  showStatus(v.watch);
  await loadHistory();
  // 이 PC 안의 상태만 읽는다 (Q-Net 요청 없음)
  setInterval(() => refresh().catch(() => {}), 3000);
}
init().catch((e) => banner(e.message));
