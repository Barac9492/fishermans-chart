// 회귀 체크: 일시정지 → 재개 후 이동 입력 · M 지도 토글 (2026-07-06 QA 리포트 대응)
// 실행: node tasks/qa-regression-pause-input.js <url>
//   (scratchpad 등 puppeteer-core가 설치된 곳에서 NODE_PATH로 실행하거나, npx 사용)
// 게임의 window.__qa 훅(js/main.js 끝)을 읽어 실제 플레이어 좌표로 판정한다.
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
    headless: 'new',
    args: ['--window-size=1280,800', '--mute-audio'],
  });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#start-btn', { timeout: 30000 });
  await sleep(1200);
  await page.click('#start-btn');
  await sleep(1000);

  const qa = () => page.evaluate(() => ({ pos: window.__qa.pos, flags: window.__qa.flags }));
  const holdW = async (ms = 1000) => {
    const { pos: p0 } = await qa();
    await page.keyboard.down('w');
    await sleep(ms);
    await page.keyboard.up('w');
    await sleep(250);
    const { pos: p1 } = await qa();
    return Math.hypot(p1.x - p0.x, p1.z - p0.z);
  };

  check('QA 훅 존재', await page.evaluate(() => !!window.__qa));

  // 1. 기준 이동
  const base = await holdW();
  check('기준 이동 (W 1초)', base > 0.5, `${base.toFixed(2)} units`);

  // 2. Esc로 쉬어가기 → '계속 걷기' 클릭 → 이동 살아있나 (QA 리포트의 주 시나리오)
  await page.keyboard.press('Escape');
  await sleep(300);
  let s = await qa();
  check('Esc로 일시정지 열림', s.flags.paused === true);
  const btn = await page.$('#pause-resume');
  const box = await btn.boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await sleep(300);
  s = await qa();
  check('계속 걷기 클릭으로 재개', s.flags.paused === false);
  const afterClick = await holdW();
  check('재개 후 이동 (버튼 클릭 경로)', afterClick > 0.5, `${afterClick.toFixed(2)} units`);

  // 3. Esc → Esc 재개 경로
  await page.keyboard.press('Escape');
  await sleep(250);
  await page.keyboard.press('Escape');
  await sleep(250);
  const afterEsc = await holdW();
  check('재개 후 이동 (Esc 재개 경로)', afterEsc > 0.5, `${afterEsc.toFixed(2)} units`);

  // 4. 짧은 키 100연타로도 움직이나 (QA가 쓴 판정 방식)
  {
    const { pos: p0 } = await qa();
    for (let i = 0; i < 100; i++) { await page.keyboard.press('w'); }
    await sleep(400);
    const { pos: p1 } = await qa();
    const d = Math.hypot(p1.x - p0.x, p1.z - p0.z);
    check('W 100연타 이동', d > 0.5, `${d.toFixed(2)} units`);
  }

  // 5. M 지도 토글: street → chart → street 왕복
  await page.keyboard.press('m');
  await sleep(300);
  s = await qa();
  check('M 1회: 지도(chart) 뷰', s.flags.view === 'chart', `view=${s.flags.view}`);
  await page.keyboard.press('m');
  await sleep(300);
  s = await qa();
  check('M 2회: 거리(street) 뷰 복귀', s.flags.view === 'street', `view=${s.flags.view}`);

  // 6. M 왕복 후에도 이동
  const afterMap = await holdW();
  check('지도 왕복 후 이동', afterMap > 0.5, `${afterMap.toFixed(2)} units`);

  await browser.close();
  console.log(failures === 0 ? '\n모든 체크 통과' : `\n${failures}개 실패`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
