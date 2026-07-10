// 회귀 체크: 말씀 새기기(verse-gate) — 부르심·고백·부인·회복 네 고비에서 손으로 옮겨
// 적어야 다음으로 갈 수 있는지 검증한다.
// 실행: node tasks/qa-regression-verse-gate.js <url>
//   (scratchpad 등 puppeteer-core가 설치된 곳에서 NODE_PATH로 실행하거나, npx 사용)
// window.__qa.openMarker(id)(js/main.js 끝)로 사전 연출(그물 던지기 등)을 건너뛰고 카드를
// 바로 연다 — 이는 openCard() 자체를 호출하는 실제 경로이므로, 검증 대상인 카드-이후 로직
// (말씀 새기기)에는 영향이 없다. 연출 자체(그물 던지기 미니게임, 대화 선택)는 이 스크립트가
// 손대지 않은 기존 코드이며 별도로 손 검증했다.
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
    args: ['--window-size=1280,900', '--mute-audio'],
  });
  const page = await browser.newPage();
  page.on('pageerror', (e) => console.log('  [page error]', e.message));
  await page.setViewport({ width: 1280, height: 900 });
  await page.goto(URL, { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('#start-btn', { timeout: 30000 });
  await sleep(1200);
  await page.click('#start-btn');
  await sleep(1000);

  check('QA 훅 존재', await page.evaluate(() => !!window.__qa && typeof window.__qa.openMarker === 'function'));

  // ---- 1) nets (마 4:18-22) ----
  await page.evaluate(() => window.__qa.openMarker('nets'));
  await sleep(400);
  let cardOpen = await page.evaluate(() => !document.getElementById('card').classList.contains('hidden'));
  check('nets: 장소 카드 열림', cardOpen);

  await page.click('#card-close');
  await sleep(400);
  let gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('nets: 말씀 새기기 게이트 뜸', gateOpen);
  const ref1 = await page.evaluate(() => document.getElementById('verse-gate-ref').textContent);
  check('nets: 참조가 마 4:18-22', ref1.includes('마태복음 4:18'), ref1);

  // 붙여넣기 차단
  const pasteBlocked = await page.evaluate(() => {
    const el = document.getElementById('verse-gate-input');
    el.focus(); el.value = '';
    const dt = new DataTransfer();
    dt.setData('text/plain', '이것은 붙여넣기 테스트입니다');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return el.value === '';
  });
  check('붙여넣기(paste 이벤트) 차단됨', pasteBlocked);

  // 완전히 틀린 답 -> 실패
  await page.evaluate(() => { document.getElementById('verse-gate-input').value = '아무말이나 적어봅니다'; });
  await page.click('#verse-gate-submit');
  await sleep(300);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('nets: 틀린 답은 통과 못 함', gateOpen);
  const msg1 = await page.evaluate(() => document.getElementById('verse-gate-msg').textContent);
  check('nets: 실패 메시지 표시', msg1.length > 0, msg1);

  // 정확한 개역개정 본문 -> 통과
  const NETS_CORRECT = '갈릴리 해변에 다니시다가 두 형제 곧 베드로라 하는 시몬과 그의 형제 안드레가 바다에 그물 던지는 것을 보시니 그들은 어부라 '
    + '말씀하시되 나를 따라오라 내가 너희를 사람을 낚는 어부가 되게 하리라 하시니 그들이 곧 그물을 버려 두고 예수를 따르니라 '
    + '거기서 더 가시다가 다른 두 형제 곧 세베대의 아들 야고보와 그의 형제 요한이 그의 아버지 세베대와 함께 배에서 그물 깁는 것을 보시고 부르시니 '
    + '그들이 곧 배와 아버지를 버려 두고 예수를 따르니라';
  await page.evaluate((txt) => { document.getElementById('verse-gate-input').value = txt; }, NETS_CORRECT);
  await page.click('#verse-gate-submit');
  await sleep(400);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('nets: 정확한 본문 입력 시 통과', !gateOpen);
  let modalState = await page.evaluate(() => window.__qa.flags.modal);
  check('nets: 통과 후 modal 해제', modalState === false, `modal=${modalState}`);

  // 유령 키 없이 이동 정상
  const p0 = await page.evaluate(() => window.__qa.pos);
  await page.keyboard.down('w'); await sleep(700); await page.keyboard.up('w'); await sleep(250);
  const p1 = await page.evaluate(() => window.__qa.pos);
  const moved = Math.hypot(p1.x - p0.x, p1.z - p0.z);
  check('nets: 통과 후 이동 정상 (유령 키 없음)', moved > 0.3, `${moved.toFixed(2)} units`);

  // 재방문 시 게이트가 다시 뜨지 않아야 한다
  await page.evaluate(() => window.__qa.openMarker('nets'));
  await sleep(300);
  await page.click('#card-close');
  await sleep(400);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('nets: 재방문 시 게이트 재등장 안 함', !gateOpen);

  // ---- 2) caesarea-philippi (마 16:13-18) — 살짝 오타(공백만 다름) 정도는 관대해야 한다 ----
  await page.evaluate(() => window.__qa.openMarker('caesarea-philippi'));
  await sleep(400);
  await page.click('#card-close');
  await sleep(400);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('caesarea-philippi: 게이트 뜸', gateOpen);
  const ref2 = await page.evaluate(() => document.getElementById('verse-gate-ref').textContent);
  check('caesarea-philippi: 참조가 마 16:13-18', ref2.includes('마태복음 16:13'), ref2);

  const CP_TYPO = '예수께서 빌립보 가이사랴 지방에 이르러 제자들에게 물어 이르시되 사람들이 인자를누구라 하느냐 '
    + '이르되 더러는 세례 요한 더러는 엘리야 어떤 이는 예레미야나 선지자중의 하나라 하나이다 '
    + '이르시되 너희는 나를 누구라 하느냐 '
    + '시몬 베드로가 대답하여 이르되 주는 그리스도시요 살아계신 하나님의 아들이시니이다 '
    + '예수께서 대답하여 이르시되 바요나 시몬아 네가 복이 있도다 이를 네게 알게한 이는 혈육이 아니요 하늘에 계신 내 아버지시니라 '
    + '또 내가 네게 이르노니 너는 베드로라 내가 이 반석 위에 내 교회를 세우리니 음부의 권세가 이기지못하리라';
  await page.evaluate((txt) => { document.getElementById('verse-gate-input').value = txt; }, CP_TYPO);
  await page.click('#verse-gate-submit');
  await sleep(400);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('caesarea-philippi: 구두점/띄어쓰기 정도 오차는 통과', !gateOpen);

  // ---- 3) first-fire (눅 22:55-62) — 너무 짧은 시도는 반드시 거부되어야 한다 ----
  await page.evaluate(() => window.__qa.openMarker('first-fire'));
  await sleep(400);
  await page.click('#card-close');
  await sleep(400);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('first-fire: 게이트 뜸', gateOpen);
  await page.evaluate(() => { document.getElementById('verse-gate-input').value = '베드로가 부인하였다'; });
  await page.click('#verse-gate-submit');
  await sleep(300);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('first-fire: 짧은 요약은 통과 못 함', gateOpen);
  // 다음 사이트를 테스트하려면 이 게이트를 마저 통과시켜야 한다 (열어 둔 채 넘어가면 안 됨)
  const FIRST_FIRE_CORRECT = '사람들이 뜰 가운데 불을 피우고 함께 앉았는지라 베드로도 그 가운데 앉았더니 '
    + '한 여종이 베드로의 불빛을 향하여 앉은 것을 보고 주목하여 이르되 이 사람도 그와 함께 있었느니라 하니 '
    + '베드로가 부인하여 이르되 이 여자여 내가 그를 알지 못하노라 하더라 '
    + '조금 후에 다른 사람이 보고 이르되 너도 그 도당이라 하거늘 베드로가 이르되 이 사람아 나는 아니로라 하더라 '
    + '한 시간쯤 있다가 또 한 사람이 장담하여 이르되 이는 갈릴리 사람이니 참으로 그와 함께 있었느니라 '
    + '베드로가 이르되 이 사람아 나는 네가 하는 말을 알지 못하노라고 아직 말하고 있을 때에 닭이 곧 울더라 '
    + '주께서 돌이켜 베드로를 보시니 베드로가 주의 말씀 곧 오늘 닭 울기 전에 네가 세 번 나를 부인하리라 하심이 생각나서 '
    + '밖에 나가서 심히 통곡하니라';
  await page.evaluate((txt) => { document.getElementById('verse-gate-input').value = txt; }, FIRST_FIRE_CORRECT);
  await page.click('#verse-gate-submit');
  await sleep(400);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('first-fire: 정확한 본문 입력 시 통과', !gateOpen);

  // ---- 4) three-questions (요 21:15-17) ----
  await page.evaluate(() => window.__qa.openMarker('three-questions'));
  await sleep(400);
  await page.click('#card-close');
  await sleep(400);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('three-questions: 게이트 뜸', gateOpen);
  const ref4 = await page.evaluate(() => document.getElementById('verse-gate-ref').textContent);
  check('three-questions: 참조가 요 21:15-17', ref4.includes('요한복음 21:15'), ref4);
  const TQ_CORRECT = '그들이 조반 먹은 후에 예수께서 시몬 베드로에게 이르시되 요한의 아들 시몬아 네가 이 사람들보다 나를 더 사랑하느냐 하시니 '
    + '이르되 주님 그러하나이다 내가 주님을 사랑하는 줄 주님께서 아시나이다 이르시되 내 어린 양을 먹이라 '
    + '또 두 번째 이르시되 요한의 아들 시몬아 네가 나를 사랑하느냐 하시니 이르되 주님 그러하나이다 내가 주님을 사랑하는 줄 주님께서 아시나이다 이르시되 내 양을 치라 '
    + '세 번째 이르시되 요한의 아들 시몬아 네가 나를 사랑하느냐 하시니 주께서 세 번째 네가 나를 사랑하느냐 하시므로 베드로가 근심하여 이르되 주님 모든 것을 아시오매 내가 주님을 사랑하는 줄을 주님께서 아시나이다 예수께서 이르시되 내 양을 먹이라';
  await page.evaluate((txt) => { document.getElementById('verse-gate-input').value = txt; }, TQ_CORRECT);
  await page.click('#verse-gate-submit');
  await sleep(400);
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('three-questions: 정확한 본문 입력 시 통과', !gateOpen);

  // ---- 5) 게이트가 없는 일반 사이트(가버나움)는 그대로 즉시 닫혀야 한다 ----
  await page.evaluate(() => window.__qa.openMarker('capernaum-house'));
  await sleep(400);
  await page.click('#card-close');
  await sleep(400);
  cardOpen = await page.evaluate(() => !document.getElementById('card').classList.contains('hidden'));
  gateOpen = await page.evaluate(() => !document.getElementById('verse-gate').classList.contains('hidden'));
  check('capernaum-house: 게이트 없는 사이트는 카드가 그냥 닫힘', !cardOpen && !gateOpen);
  modalState = await page.evaluate(() => window.__qa.flags.modal);
  check('capernaum-house: modal 정상 해제', modalState === false);

  await browser.close();
  console.log(failures === 0 ? '\n모든 체크 통과' : `\n${failures}개 실패`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
