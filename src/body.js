// 응답 본문 디코딩(UTF-8 / EUC-KR)과 점검 페이지 감지. Q-Net 은 현재 UTF-8 이지만 옛 페이지는 EUC-KR 일 수 있다.

const charsetOfHeader = (res) => /charset=["']?([\w-]+)/i.exec(res.headers?.get?.('content-type') || '')?.[1];
const charsetOfMeta = (buf) => /<meta[^>]+charset=["']?([\w-]+)/i.exec(Buffer.from(buf.subarray(0, 2048)).toString('latin1'))?.[1];

const normalize = (cs) => (/^(euc-?kr|ks_c_5601|cp949|ms949|x-windows-949)/i.test(cs || '') ? 'euc-kr' : 'utf-8');

// 헤더 charset > <meta charset> > UTF-8 로 시도하고 깨지면 EUC-KR.
export async function readBody(res) {
  if (typeof res.arrayBuffer !== 'function') return res.text();
  const buf = new Uint8Array(await res.arrayBuffer());
  const declared = charsetOfHeader(res) || charsetOfMeta(buf);
  if (declared) return new TextDecoder(normalize(declared)).decode(buf);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); } catch { return new TextDecoder('euc-kr').decode(buf); }
}

// HTTP 200 으로 내려오는 점검 안내(짧고 표가 없으며 점검 문구 포함)
export function isMaintenancePage(text) {
  const s = String(text);
  return s.length < 30000 && !/<table/i.test(s) && /(시스템|서비스|사이트)\s*(정기\s*)?점검|점검\s*중|점검으로\s*인하여|under\s+maintenance/i.test(s);
}
