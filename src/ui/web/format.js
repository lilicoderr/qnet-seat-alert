// 화면 표시용 순수 함수 (브라우저와 테스트에서 함께 쓴다).
const PARTS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });

const parts = (ms) => Object.fromEntries(PARTS.formatToParts(new Date(ms)).map((p) => [p.type, p.value]));

export function kst(ms) {
  if (!ms) return '-';
  const p = parts(ms);
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}:${p.second} KST`;
}

export function kstShort(ms) {
  const p = parts(ms);
  return `${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

export function costText(c) {
  const others = c.others ? ` 그 밖에 저장돼 있는 감시 ${c.others}개의 요청(체크당 ${c.others}회)을 포함했습니다.` : '';
  return `예상 Q-Net 요청: 확인 1회에 보통 ${c.perCheckTypical}회(결과가 여러 쪽이면 최대 ${c.perCheckMax}회), 1시간에 약 ${c.perHourTypical}회(최대 ${c.perHourMax}회), 하루 종일 켜 두면 약 ${c.perDayTypical.toLocaleString('ko-KR')}회. 접수 중인 시험이 없으면 5분에 1회입니다.${others}`;
}
