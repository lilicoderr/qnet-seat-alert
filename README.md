# qnet-seat-alert

Q-Net(큐넷) 원서접수 **빈자리(잔여석)** 가 생기면 **Discord 로 알려주는** 도구.
**알림 전용** — 자동 접수/매크로가 아니다. 접수는 사람이 직접 한다. 의존성 없음(Node 내장 `fetch`만).

> ⚠️ **주의**: Q-Net 자동 조회는 사이트 이용약관에 저촉될 수 있습니다. **개인 확인 용도로만**, 폴링 간격을 넉넉히(3~10분) 두고 쓰세요. 로그인/자동접수는 하지 않습니다. 실제 잔여석 열람에 로그인이 필요한 페이지라면, 열람 가능한 URL 을 `watchers[].url` 에 넣어야 동작합니다.

## 동작

1. 설정한 **워처(watcher)** 들을 주기적으로 가져온다.
2. 페이지/JSON 에서 **잔여석 신호**를 뽑는다(정원−접수인원, "잔여 N석", 특정 문구 등장 등).
3. 이전 상태와 비교해 **빈자리가 열리면** Discord 웹훅으로 알림. **중복 알림은 억제**(한 번 열리면 한 번만).

## 설치 · 실행

```bash
cp config.example.json config.json   # webhookUrl 과 watchers[].url 채우기
node bin/qnet-alert.js --once         # 1회 검사
node bin/qnet-alert.js                # intervalMin 간격 반복 (기본 5분, 최소 2분)
```

## 설정 (`config.json`)

```json
{
  "webhookUrl": "https://discord.com/api/webhooks/.../...",
  "intervalMin": 5,
  "statePath": "state.json",
  "watchers": [
    {
      "name": "전기기능사 필기 OO지역",
      "type": "seats",          // seats | jsonseats | contains | regex
      "alertOn": "open",        // open(0→>0, 기본) | increase | change | available
      "url": "https://www.q-net.or.kr/... (열람 가능한 접수현황 URL)",
      "linkUrl": "https://www.q-net.or.kr/rcv003.do?gSite=Q&id=rcv00301"
    }
  ]
}
```

- `config.json`, `state.json` 은 **비밀/로컬 파일** → `.gitignore` 로 커밋 제외.
- `webhookUrl` 은 Discord 채널 설정 → 연동 → 웹훅에서 발급.

### 워처 타입

| type | 설명 |
|---|---|
| `seats` | HTML 텍스트에서 "정원/접수인원" 또는 "잔여 N석" 을 찾아 빈자리 계산 |
| `jsonseats` | JSON 응답의 정원/접수/잔여 필드로 계산 (`fields` 로 키 지정 가능) |
| `contains` | 특정 문구(예: `접수하기`) 등장/사라짐 감지 |
| `regex` | 정규식 1번 그룹 값 변화 감지 |

### 알림 조건(seats)

| alertOn | 알림 시점 |
|---|---|
| `open` | 빈자리가 0(또는 미확인)에서 **1석 이상으로 열릴 때** (기본) |
| `increase` | 빈자리가 **늘어날 때마다** |
| `change` | 빈자리 수가 **바뀔 때마다** |
| `available` | 폴링 시 빈자리가 있으면 (주의: 매번 알림) |

## 구조

```
qnet-seat-alert/
├─ bin/qnet-alert.js   CLI (--once / 반복)
├─ src/
│  ├─ extract.js       잔여석/문구/정규식 추출
│  ├─ watcher.js       이전↔현재 비교 → 알림 여부
│  ├─ discord.js       웹훅 전송(임베드)
│  ├─ store.js         마지막 신호 저장(중복 억제)
│  ├─ engine.js        폴링 1회 실행
│  └─ qnet.js          Q-Net 프리셋/주의사항
└─ test/               node:test (13개)
```

## 테스트

```bash
npm test
```

네트워크 없이 검증(`fetch` 주입): 추출·비교·중복 억제·웹훅 페이로드.
실제 CLI 는 로컬 페이지 → 추출 → 디스코드 POST 까지 end-to-end 로 확인했다.

## 한계

- Q-Net 의 정확한 잔여석 엔드포인트는 로그인/세션이 필요하거나 구조가 자주 바뀐다. 이 도구는 **열람 가능한 URL 과 추출 규칙을 사용자가 지정**하는 범용 감시기다.
- 자동 접수는 하지 않는다(의도적). 알림을 받으면 직접 접수한다.
