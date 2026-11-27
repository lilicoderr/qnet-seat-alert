// 알림 문구 템플릿: "{name} 빈자리 {available}석" 처럼 {변수} 치환.
// 모르는 변수는 그대로 두고, 값이 없으면 빈 문자열로 치환한다.

export const TEMPLATE_VARS = [
  'name', 'available', 'applied', 'capacity', 'signal', 'reason', 'url', 'time',
];

export function renderTemplate(tpl, vars) {
  return String(tpl).replace(/\{(\w+)\}/g, (m, key) => {
    if (!TEMPLATE_VARS.includes(key)) return m;
    const v = vars[key];
    return v === null || v === undefined ? '' : String(v);
  });
}

// watcher 결과 → 템플릿 변수
export function varsFor(watcher, r, now = new Date()) {
  const d = r.detail && typeof r.detail === 'object' ? r.detail : {};
  return {
    name: watcher.name || 'Q-Net',
    available: r.available,
    applied: d.applied,
    capacity: d.capacity,
    signal: r.signal,
    reason: r.reason,
    url: watcher.linkUrl || watcher.url,
    time: now.toLocaleString('ko-KR'),
  };
}

// 템플릿에서 쓰인 알 수 없는 변수 목록 (검증용)
export function unknownVars(tpl) {
  const out = [];
  for (const m of String(tpl).matchAll(/\{(\w+)\}/g)) {
    if (!TEMPLATE_VARS.includes(m[1])) out.push(m[1]);
  }
  return out;
}
