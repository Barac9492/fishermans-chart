// 회귀 체크: 벽 충돌 방향 버그 — wallSegment()가 회전(rotY)을 무시하고 축맞춤 상자를
// 등록하던 버그. 세로 벽(예루살렘 동/서 성벽, 첫 번째 불 뜰의 옆벽)은 실제로는 거의 판정이
// 없이 뚫렸고, 그 대신 성벽 한가운데(z≈114) 근처 도심 한복판에 아무 이유 없이 가로로 긴
// 유령 벽이 생겼었다("왜 자꾸 어떤 장면에서는 벽을 뚫고 지나가고, 어떤 장면은 아무것도
// 없는데 앞으로 못 가고" 리포트에 대응).
// 실행: node tasks/qa-regression-wall-collision.js <url>
//   (scratchpad 등 puppeteer-core가 설치된 곳에서 NODE_PATH로 실행하거나, npx 사용)
const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://localhost:3000/';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}
(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new', args: ['--window-size=1280,900', '--mute-audio'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('[page error]', e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#start-btn');
  await sleep(1000);
  await page.click('#start-btn');
  await sleep(800);

  // 지도 안쪽 임의 지점(예전 유령 벽 자리, x=0,z=114 근방)으로 워프해 확인 — 실제 이동으로는
  // 너무 멀어 시간이 걸리므로, keys를 흉내내지 않고 실제 게임의 collide 함수를 그대로 검증한다.
  const openNow = await page.evaluate(() => {
    const cs = window.__qa.colliders;
    const insideAny = (x, z) => cs.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
    return !insideAny(0, 114) && !insideAny(-30, 114) && !insideAny(30, 114);
  });
  check('예전 유령 벽 자리(도시 중앙, z=114 대) 모두 열림', openNow);

  const wallsBlocked = await page.evaluate(() => {
    const cs = window.__qa.colliders;
    const insideAny = (x, z) => cs.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1);
    // 동/서 성벽을 z 여러 지점에서 표본 검사 — 성벽 전체 길이에 걸쳐 막혀야 한다
    const zs = [95, 105, 115, 125, 135];
    return zs.every((z) => insideAny(42, z) && insideAny(-42, z));
  });
  check('동/서 성벽이 z 전체 구간(95~135)에서 고르게 막힘', wallsBlocked);

  await browser.close();
  console.log(failures === 0 ? '\n모든 체크 통과' : `\n${failures}개 실패`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
