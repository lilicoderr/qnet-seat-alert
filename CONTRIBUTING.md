# Contributing

버그 제보·PR 환영합니다. **알림 전용** 이라는 방향은 유지합니다(자동 로그인/접수 기능은 받지 않아요).

## 개발

```bash
node --version   # 20 이상
npm test         # node --test, 외부 의존성 없음
node bin/qnet-alert.js --dry --config config.json
```

- 네트워크는 `fetchImpl` 주입으로 테스트합니다. 실제 Q-Net 이나 웹훅을 호출하는 테스트는 넣지 마세요.
- 새 알림 채널: `src/notify.js` 의 `validateNotifier` / `sendTo` 에 추가하고 `test/notify.test.js` 에 테스트를 더합니다.
- 새 추출 규칙: `src/extract.js` + 픽스처 기반 테스트.

## 보안

웹훅 URL·봇 토큰·`config.json`·`.env`·`state.json` 은 **절대 커밋 금지** 입니다. 이슈에 설정을 붙일 때도 비밀값을 지우세요.

## 커밋 메시지

`feat(scope): ...`, `fix(scope): ...`, `docs: ...` 형식을 사용합니다.
