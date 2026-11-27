// 예시 플러그인: 알림을 콘솔에 출력한다. config.json 에
//   "plugins": ["./examples/console-notifier.js"],
//   "notifiers": [{ "type": "console", "prefix": "[seat]" }]
export default {
  type: 'console',
  validate(n) {
    return n.prefix != null && typeof n.prefix !== 'string' ? 'console: prefix 는 문자열이어야 합니다.' : null;
  },
  async send(n, payload) {
    console.log(`${n.prefix || ''} ${payload.title} — ${payload.description || ''} ${payload.url || ''}`.trim());
  },
};
