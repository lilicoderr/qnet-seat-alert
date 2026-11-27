// 설정(config) 검증 — 흔한 실수를 미리 잡는다.

import { isWebhookUrl } from './discord.js';
import { resolveNotifiers, validateNotifier } from './notify.js';
import { didYouMean } from './suggest.js';
import { validateThrottle } from './throttle.js';
import { parseCron } from './cron.js';
import { validateMentions } from './mentions.js';
import { TEMPLATE_VARS, unknownVars } from './template.js';

const WATCHER_TYPES = ['seats', 'jsonseats', 'contains', 'regex'];
const ALERT_ON = ['open', 'increase', 'change', 'available'];
const ALERT_WHEN = ['present', 'absent', 'change'];

export const TOP_KEYS = [
  '$schema', 'comment', 'notifiers', 'webhookUrl', 'username', 'intervalMin', 'politeDelayMs',
  'failureAlertAfter', 'statePath', 'watchers', 'heartbeatHours', 'templates', 'metricsPort', 'metricsHost', 'plugins', 'lang', 'parserAlertAfter', 'digest', 'historyPath', 'quietHours', 'rateLimit', 'jitter', 'mentions',
];
export const WATCHER_KEYS = [
  'name', 'id', 'url', 'linkUrl', 'type', 'alertOn', 'alertWhen', 'include', 'exclude',
  'dateFrom', 'dateTo', 'mention', 'enabled', 'needle', 'pattern', 'fields', 'method',
  'headers', 'body', 'webhookUrl', 'template', 'flags', 'schedule',
];

function checkNumber(config, key, errors, { min = 0 } = {}) {
  if (config[key] == null) return;
  if (typeof config[key] !== 'number' || !Number.isFinite(config[key]) || config[key] < min) {
    errors.push(`${key} 는 ${min} 이상의 숫자여야 합니다. (현재: ${JSON.stringify(config[key])})`);
  }
}

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

  for (const k of Object.keys(config)) {
    if (!TOP_KEYS.includes(k)) warnings.push(`알 수 없는 설정 키 '${k}'.${didYouMean(k, TOP_KEYS)}`);
  }
  const checkTemplate = (tpl, where) => {
    if (tpl == null) return;
    if (typeof tpl !== 'object' || Array.isArray(tpl)) {
      errors.push(`${where}: 객체여야 합니다. ({ "title": "...", "description": "..." })`);
      return;
    }
    for (const k of Object.keys(tpl)) {
      if (!['title', 'description'].includes(k)) warnings.push(`${where}: 알 수 없는 키 '${k}'. (title/description)`);
      else for (const u of unknownVars(tpl[k])) warnings.push(`${where}.${k}: 알 수 없는 변수 {${u}} (${TEMPLATE_VARS.join(', ')})`);
    }
  };
  checkTemplate(config.templates, 'templates');
  checkNumber(config, 'intervalMin', errors);
  checkNumber(config, 'politeDelayMs', errors);
  checkNumber(config, 'failureAlertAfter', errors);
  checkNumber(config, 'heartbeatHours', errors);
  checkNumber(config, 'parserAlertAfter', errors);
  if (config.jitter != null && !(typeof config.jitter === 'number' && config.jitter >= 0 && config.jitter <= 0.5)) errors.push('jitter 는 0~0.5 사이 숫자(간격 대비 비율)여야 합니다.');
  checkNumber(config, 'metricsPort', errors, { min: 1 });
  validateThrottle(config, errors);
  validateMentions(config, errors, warnings);
  if (config.lang != null && !['ko', 'en'].includes(config.lang)) errors.push(`lang 은 'ko' 또는 'en' 이어야 합니다. (현재: ${JSON.stringify(config.lang)})`);
  if (config.digest != null && typeof config.digest !== 'boolean') errors.push('digest 는 true/false 여야 합니다.');
  if (config.watchers != null && !Array.isArray(config.watchers)) {
    errors.push('watchers 는 배열이어야 합니다.');
    return { ok: false, errors, warnings };
  }

  const watchers = config.watchers || [];
  if (watchers.length === 0) warnings.push('watchers 가 비어 있습니다.');

  const ids = new Set();
  watchers.forEach((w, i) => {
    const where = `watchers[${i}] (${w.name || '이름없음'})`;
    if (!w.url) errors.push(`${where}: url 이 없습니다.`);
    else if (!/^https?:\/\//.test(w.url)) errors.push(`${where}: url 이 http(s) 로 시작하지 않습니다.`);
    if (!w.type) warnings.push(`${where}: type 미지정 → 'seats' 로 간주됩니다.`);
    else if (!WATCHER_TYPES.includes(w.type)) {
      errors.push(`${where}: 알 수 없는 type '${w.type}'.${didYouMean(w.type, WATCHER_TYPES)} (${WATCHER_TYPES.join('/')})`);
    }
    for (const k of Object.keys(w)) {
      if (!WATCHER_KEYS.includes(k)) warnings.push(`${where}: 알 수 없는 키 '${k}'.${didYouMean(k, WATCHER_KEYS)}`);
    }
    checkTemplate(w.template, `${where}.template`);
    if (w.alertOn != null && !ALERT_ON.includes(w.alertOn)) {
      errors.push(`${where}: alertOn '${w.alertOn}'.${didYouMean(w.alertOn, ALERT_ON)} (${ALERT_ON.join('/')})`);
    }
    if (w.alertWhen != null && !ALERT_WHEN.includes(w.alertWhen)) {
      errors.push(`${where}: alertWhen '${w.alertWhen}'.${didYouMean(w.alertWhen, ALERT_WHEN)} (${ALERT_WHEN.join('/')})`);
    }
    if (w.type === 'regex' && w.pattern) {
      try {
        new RegExp(w.pattern);
      } catch (e) {
        errors.push(`${where}: pattern 정규식 오류 — ${e.message}`);
      }
    }
    if (w.schedule != null) {
      try { parseCron(w.schedule); } catch (e) { errors.push(`${where}: schedule — ${e.message}`); }
    }
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

  if (config.intervalMin != null && config.intervalMin < 1) {
    warnings.push('intervalMin 이 1분(60초) 미만입니다. 서버 부담/차단을 피하려고 1분으로 올립니다.');
  }

  return { ok: errors.length === 0, errors, warnings };
}
