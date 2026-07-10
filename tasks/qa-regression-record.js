// 회귀 체크: 완주 기록(속도+총점) — 14곳 + 잃은 양 12마리를 모두 채운 순간(둘 중 나중 것)에
// 시간이 새겨지고, 일시정지 메뉴에서 언제든 카드로 다시 볼 수 있는지 검증한다.
// 실행: node tasks/qa-regression-record.js <url>
//   (scratchpad 등 puppeteer-core가 설치된 곳에서 NODE_PATH로 실행하거나, npx 사용)
// window.__qa.openMarker(id)/fillSheep()/closeModal()(js/main.js 끝)로 사전 연출·에필로그·크레딧
// 시퀀스를 건너뛰고, 실제 코드 경로(chartSite/collectSheep이 부르는 checkRecordComplete)를
// 직접 검증한다.
const puppeteer = require('puppeteer-core');

const URL = process.argv[2] || 'http://localhost:3000/';
const CHROME = process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
  if (!ok) failures++;
}

const SITE_IDS = [
  'nets', 'capernaum-house', 'fourth-watch', 'caesarea-philippi', 'gethsemane',
  'first-fire', 'at-a-distance', 'empty-tomb', 'long-night', 'second-fire',
  'three-questions', 'pentecost', 'voyage-to-rome', 'basilica',
];

(async () => {
  const browser = await puppeteer.launch({
    executablePath: CHROME,
    headless: 'new',
    args: ['--window-size=1280,900', '--mute-audio'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  [page error]', e.message));
  await page.setViewport({ width: 1280, height: 900 });

  // ---- 시나리오 A: 사이트를 먼저 다 채우고, 마지막에 양을 채운다 ----
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#start-btn', { timeout: 30000 });
  await sleep(1000);
  await page.click('#start-btn');
  await sleep(800);

  const startedAt1 = await page.evaluate(() => window.__qa.record.startedAt);
  check('시작 시각 기록됨', typeof startedAt1 === 'number' && startedAt1 > 0);

  for (const id of SITE_IDS.slice(0, 13)) {
    await page.evaluate((siteId) => window.__qa.openMarker(siteId), id);
  }
  let rec = await page.evaluate(() => window.__qa.record);
  check('13/14 사이트만으로는 미완성', rec.finishedAt === null, JSON.stringify(rec));

  await page.evaluate(() => window.__qa.fillSheep());
  rec = await page.evaluate(() => window.__qa.record);
  check('양 12마리만으로는(사이트 13/14) 미완성', rec.finishedAt === null, JSON.stringify(rec));

  await page.evaluate((siteId) => window.__qa.openMarker(siteId), SITE_IDS[13]);
  rec = await page.evaluate(() => window.__qa.record);
  check('시나리오 A: 14번째 사이트에서 완성', typeof rec.finishedAt === 'number' && rec.finishedAt > 0, JSON.stringify(rec));

  // openMarker는 카드를 열어 둔 채로 두므로(에필로그/크레딧 사이드이펙트 없이) modal을 되돌린다 —
  // 이 테스트는 기록 카드 자체를 검증하는 것이지 에필로그·크레딧 시퀀스를 검증하는 게 아니다.
  await page.evaluate(() => window.__qa.closeModal());

  let pauseVisible = await page.evaluate(() => {
    document.getElementById('pause-btn').click();
    return !document.getElementById('pause-record').classList.contains('hidden');
  });
  check('완주 후 일시정지 메뉴에 기록 버튼이 보임', pauseVisible);

  await page.click('#pause-record');
  await sleep(500);
  let recordVisible = await page.evaluate(() => !document.getElementById('record').classList.contains('hidden'));
  check('기록 카드 오버레이가 열림', recordVisible);
  const hasImg = await page.evaluate(() => !!document.querySelector('#record-wrap img.souvenir-img[src]'));
  check('기록 카드에 이미지가 그려짐', hasImg);
  const hasShareBtn = await page.evaluate(() => !!document.querySelector('#record-wrap .souvenir-btn'));
  check('기록 카드에 저장·공유 버튼이 있음', hasShareBtn);

  await page.click('#record-close');
  await sleep(300);
  const modalAfterClose = await page.evaluate(() => window.__qa.flags.modal);
  check('기록 카드 닫은 뒤 modal 해제', modalAfterClose === false, `modal=${modalAfterClose}`);

  const moveAfter = await (async () => {
    const p0 = await page.evaluate(() => window.__qa.pos);
    await page.keyboard.down('w'); await sleep(700); await page.keyboard.up('w'); await sleep(250);
    const p1 = await page.evaluate(() => window.__qa.pos);
    return Math.hypot(p1.x - p0.x, p1.z - p0.z);
  })();
  check('기록 카드 닫은 뒤 이동 정상', moveAfter > 0.3, `${moveAfter.toFixed(2)} units`);

  // ---- 시나리오 B: 순서를 반대로 — 양을 먼저 다 채우고, 마지막에 사이트를 채운다 ----
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#start-btn', { timeout: 30000 });
  await sleep(1000);
  await page.click('#start-btn');
  await sleep(800);

  for (const id of SITE_IDS.slice(0, 13)) {
    await page.evaluate((siteId) => window.__qa.openMarker(siteId), id);
  }
  await page.evaluate(() => window.__qa.fillSheep());
  await page.evaluate((siteId) => window.__qa.openMarker(siteId), SITE_IDS[13]);
  rec = await page.evaluate(() => window.__qa.record);
  check('시나리오 B: 순서 무관하게 완성', typeof rec.finishedAt === 'number' && rec.finishedAt > 0, JSON.stringify(rec));

  // ---- 미완성 상태에서는 기록 버튼이 숨어 있어야 한다 ----
  await page.evaluate(() => localStorage.clear());
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#start-btn', { timeout: 30000 });
  await sleep(1000);
  await page.click('#start-btn');
  await sleep(800);
  pauseVisible = await page.evaluate(() => {
    document.getElementById('pause-btn').click();
    return document.getElementById('pause-record').classList.contains('hidden');
  });
  check('미완성 상태에서는 기록 버튼이 숨어 있음', pauseVisible);

  await browser.close();
  console.log(failures === 0 ? '\n모든 체크 통과' : `\n${failures}개 실패`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
