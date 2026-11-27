// "혹시 ○○ 말씀이세요?" — 오타 제안용 편집거리.

export function editDistance(a, b) {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

// candidates 중 input 과 가장 가까운 것 (거리 ≤ maxDist). 없으면 null.
export function suggest(input, candidates, maxDist = 2) {
  let best = null;
  let bestD = Infinity;
  for (const c of candidates) {
    const d = editDistance(String(input).toLowerCase(), c.toLowerCase());
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return bestD <= maxDist ? best : null;
}

export function didYouMean(input, candidates) {
  const s = suggest(input, candidates);
  return s ? ` 혹시 '${s}' 말씀이세요?` : '';
}
