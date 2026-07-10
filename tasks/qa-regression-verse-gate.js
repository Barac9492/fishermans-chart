// 회귀 체크: 말씀 새기기(card-seal-box) — 14개소 전역 빈칸 채우기 검증
// 실행: node tasks/qa-regression-verse-gate.js <url>
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

  // ==================== 1. nets (1번 장소) 검증 ====================
  console.log('\n--- 1. [nets] 장소 검증 ---');
  await page.evaluate(() => window.__qa.openMarker('nets'));
  await sleep(400);
  
  let cardOpen = await page.evaluate(() => !document.getElementById('card').classList.contains('hidden'));
  check('nets: 카드 열림', cardOpen);
  
  let sealBoxVisible = await page.evaluate(() => !document.getElementById('card-seal-box').classList.contains('hidden'));
  check('nets: 말씀 새기기 UI 표시됨', sealBoxVisible);

  let closeBtnDisabled = await page.evaluate(() => document.getElementById('card-close').disabled);
  let closeBtnText = await page.evaluate(() => document.getElementById('card-close').textContent);
  check('nets: 닫기 버튼 비활성화 상태', closeBtnDisabled);
  check('nets: 닫기 버튼 문구 확인', closeBtnText === '말씀을 새겨야 완료됩니다', closeBtnText);

  // 붙여넣기 차단 검증
  const pasteBlocked = await page.evaluate(() => {
    const el = document.getElementById('seal-input');
    el.focus(); el.value = '';
    const dt = new DataTransfer();
    dt.setData('text/plain', '사람을');
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
    return el.value === '';
  });
  check('nets: 붙여넣기 차단됨', pasteBlocked);

  // 오답 입력 -> 실패 및 경고 메시지 & 쉐이크 클래스 확인
  await page.evaluate(() => { document.getElementById('seal-input').value = '물고기'; });
  await page.click('#seal-submit');
  await sleep(300);
  
  closeBtnDisabled = await page.evaluate(() => document.getElementById('card-close').disabled);
  check('nets: 오답 시 여전히 닫기 버튼 비활성화', closeBtnDisabled);
  
  let sealMsg = await page.evaluate(() => document.getElementById('seal-msg').textContent);
  check('nets: 오답 메시지 노출 확인', sealMsg.includes('글자가 조금 달라요') || sealMsg.includes('단어와 띄어쓰기를 다시 확인'), sealMsg);

  let hasShake = await page.evaluate(() => document.getElementById('seal-input').classList.contains('shake'));
  check('nets: 오답 시 쉐이크 애니메이션 활성화', hasShake);

  // 정답 입력 -> 통과
  await page.evaluate(() => { document.getElementById('seal-input').value = '사람을'; });
  await page.click('#seal-submit');
  await sleep(400);

  closeBtnDisabled = await page.evaluate(() => document.getElementById('card-close').disabled);
  closeBtnText = await page.evaluate(() => document.getElementById('card-close').textContent);
  check('nets: 정답 입력 후 닫기 버튼 활성화', !closeBtnDisabled);
  check('nets: 정답 입력 후 닫기 버튼 문구 변경', closeBtnText === '계속 걷기', closeBtnText);

  let solvedClass = await page.evaluate(() => document.getElementById('seal-blank').classList.contains('solved'));
  let solvedText = await page.evaluate(() => document.getElementById('seal-blank').textContent);
  check('nets: 빈칸에 정답 채워지고 .solved 적용됨', solvedClass && solvedText === '사람을');

  // 카드 닫기
  await page.click('#card-close');
  await sleep(400);
  cardOpen = await page.evaluate(() => !document.getElementById('card').classList.contains('hidden'));
  check('nets: 카드 성공적으로 닫힘', !cardOpen);

  // 재방문 검증 (말씀 새기기 패널 숨김 및 즉시 닫기 버튼 활성화)
  await page.evaluate(() => window.__qa.openMarker('nets'));
  await sleep(400);
  
  sealBoxVisible = await page.evaluate(() => !document.getElementById('card-seal-box').classList.contains('hidden'));
  closeBtnDisabled = await page.evaluate(() => document.getElementById('card-close').disabled);
  closeBtnText = await page.evaluate(() => document.getElementById('card-close').textContent);
  
  check('nets(재방문): 말씀 새기기 UI 숨겨짐', !sealBoxVisible);
  check('nets(재방문): 닫기 버튼 즉시 활성화됨', !closeBtnDisabled);
  check('nets(재방문): 닫기 버튼 문구 "계속 걷기"', closeBtnText === '계속 걷기');

  await page.click('#card-close');
  await sleep(400);


  // ==================== 2. empty-tomb (8번 장소) 검증 ====================
  console.log('\n--- 2. [empty-tomb] 장소 검증 ---');
  await page.evaluate(() => window.__qa.openMarker('empty-tomb'));
  await sleep(400);

  sealBoxVisible = await page.evaluate(() => !document.getElementById('card-seal-box').classList.contains('hidden'));
  check('empty-tomb: 말씀 새기기 UI 표시됨', sealBoxVisible);

  // 정답 입력 (공백/구두점 다르게 입력하여 정규화 매칭 확인: "  믿더라.  " -> "믿더라.")
  await page.evaluate(() => { document.getElementById('seal-input').value = '  믿더라.  '; });
  await page.click('#seal-submit');
  await sleep(400);

  closeBtnDisabled = await page.evaluate(() => document.getElementById('card-close').disabled);
  check('empty-tomb: 정규화 매칭 정상 작동 및 닫기 버튼 활성화', !closeBtnDisabled);

  await page.click('#card-close');
  await sleep(400);


  // ==================== 3. basilica (14번 장소) 검증 ====================
  console.log('\n--- 3. [basilica] 장소 검증 ---');
  await page.evaluate(() => window.__qa.openMarker('basilica'));
  await sleep(400);

  sealBoxVisible = await page.evaluate(() => !document.getElementById('card-seal-box').classList.contains('hidden'));
  check('basilica: 말씀 새기기 UI 표시됨', sealBoxVisible);

  // 3회 실패 힌트 검증
  for (let i = 0; i < 3; i++) {
    await page.evaluate(() => { document.getElementById('seal-input').value = '틀린답'; });
    await page.click('#seal-submit');
    await sleep(200);
  }
  
  sealMsg = await page.evaluate(() => document.getElementById('seal-msg').textContent);
  check('basilica: 3회 실패 시 글자 수 힌트 표시 확인', sealMsg.includes('정답 5글자'), sealMsg);

  // 정답 입력 ("데려가리라.")
  await page.evaluate(() => { document.getElementById('seal-input').value = '데려가리라.'; });
  await page.click('#seal-submit');
  await sleep(400);

  closeBtnDisabled = await page.evaluate(() => document.getElementById('card-close').disabled);
  check('basilica: 힌트 확인 후 정답 입력하여 통과 성공', !closeBtnDisabled);

  await page.click('#card-close');
  await sleep(400);

  await browser.close();
  console.log(failures === 0 ? '\n모든 체크 통과 (PASS)' : `\n${failures}개 실패 (FAIL)`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
