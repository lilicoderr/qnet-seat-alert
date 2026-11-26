// 설정(config) 검증 — 흔한 실수를 미리 잡는다.

import { isWebhookUrl } from './discord.js';
import { resolveNotifiers, validateNotifier } from './notify.js';

const WATCHER_TYPES = ['seats', 'jsonseats', 'contains', 'regex'];

export function validateConfig(config, { requireWebhook = true } = {}) {
  const errors = [];
  const warnings = [];

  for (const [i, n] of (config.notifiers || []).entries()) {
    const e = validateNotifier(n);
    if (e) errors.push(`notifiers[${i}]: ${e}`);
  }
  if (config.webhookUrl && !isWebhookUrl(config.webhookUrl)) {
    errors.push('webhookUrl 이 Discord 웹훅 형식이 아닙니다. (https://discord.com/api/webhooks/...)');
  }
  if (requireWebhook) {
    const everyWatcherHasOwn = (config.watchers || []).length > 0 && config.watchers.every((w) => w.webhookUrl);
    if (!everyWatcherHasOwn && resolveNotifiers(config).length === 0) {
      errors.push('알림 채널이 없습니다. webhookUrl / notifiers 를 설정하거나 QNET_DISCORD_WEBHOOK 등 환경변수를 지정하세요.');
    }
  }

  const watchers = config.watchers || [];
  if (watchers.length === 0) warnings.push('watchers 가 비어 있습니다.');

  const ids = new Set();
  watchers.forEach((w, i) => {
    const where = `watchers[${i}] (${w.name || '이름없음'})`;
    if (!w.url) errors.push(`${where}: url 이 없습니다.`);
    else if (!/^https?:\/\//.test(w.url)) errors.push(`${where}: url 이 http(s) 로 시작하지 않습니다.`);
    if (!w.type) warnings.push(`${where}: type 미지정 → 'seats' 로 간주됩니다.`);
    else if (!WATCHER_TYPES.includes(w.type)) errors.push(`${where}: 알 수 없는 type '${w.type}'. (${WATCHER_TYPES.join('/')})`);
    if (w.type === 'contains' && !w.needle) errors.push(`${where}: contains 타입은 needle 이 필요합니다.`);
    if (w.type === 'regex' && !w.pattern) errors.push(`${where}: regex 타입은 pattern 이 필요합니다.`);
    if (w.webhookUrl && !isWebhookUrl(w.webhookUrl)) errors.push(`${where}: webhookUrl 형식이 올바르지 않습니다.`);
    for (const k of ['include', 'exclude']) {
      if (w[k] != null && !Array.isArray(w[k])) errors.push(`${where}: ${k} 는 문자열 배열이어야 합니다.`);
    }
    for (const k of ['dateFrom', 'dateTo']) {
      if (w[k] != null && !/^\d{4}-\d{2}-\d{2}$/.test(w[k])) errors.push(`${where}: ${k} 는 YYYY-MM-DD 형식이어야 합니다.`);
    }
    if (w.dateFrom && w.dateTo && w.dateFrom > w.dateTo) errors.push(`${where}: dateFrom 이 dateTo 보다 늦습니다.`);
    const key = w.id || w.name || w.url;
    if (ids.has(key)) warnings.push(`${where}: 같은 식별자(${key})가 중복됩니다. id 를 지정하세요.`);
    ids.add(key);
  });

  if (config.intervalMin != null && config.intervalMin < 2) {
    warnings.push('intervalMin 이 2분 미만입니다. 서버 부담/차단을 피하려면 2분 이상 권장 (최소 2분으로 올림).');
  }

  return { ok: errors.length === 0, errors, warnings };
}
