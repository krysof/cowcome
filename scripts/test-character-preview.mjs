import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
for(const mobile of (process.env.MOBILE_ONLY?[true]:[false,true])){
 const page=await browser.newPage({viewport:mobile?{width:390,height:844}:{width:1280,height:900},isMobile:mobile,hasTouch:mobile,locale:'zh-CN'});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('niulai-progress-v1',JSON.stringify({memories:['bell','ribbon','photo','hoofprint','radio','snow'],runs:1})));
 await page.goto('http://localhost:5173',{waitUntil:'domcontentloaded',timeout:60000});await page.waitForFunction(()=>window.__NIULAI_TEST__);
 await page.locator('#enterGameBtn').click();
 for(const kind of ['orange','yellow','leopard','super']){
  await page.locator(`[data-character="${kind}"]`).click();
  assert.equal(await page.evaluate(()=>window.__NIULAI_TEST__.progressionState().selectedCharacter),kind);
  assert.equal(await page.locator(`[data-character="${kind}"] img`).evaluate(i=>i.complete&&i.naturalWidth===1024),true);
  await page.locator('#startBtn').click();await page.waitForTimeout(180);
  assert.equal(await page.evaluate(()=>window.__NIULAI_TEST__.playerState().state),'playing');
  await page.keyboard.down('ShiftLeft');await page.keyboard.down('ArrowUp');await page.waitForTimeout(180);await page.keyboard.up('ArrowUp');await page.keyboard.up('ShiftLeft');await page.keyboard.press('KeyE');
  await page.evaluate(()=>document.querySelector('#changeBtn').click());
 }
 await page.locator('[data-character="orange"]').click();
 await page.screenshot({path:`screenshots/original-preview/menu-${mobile?'mobile':'desktop'}.png`});
 await page.locator('#startBtn').click();await page.waitForTimeout(600);
 const before=await page.evaluate(()=>window.__NIULAI_TEST__.playerState());
 await page.keyboard.down('ArrowLeft');await page.waitForTimeout(250);await page.keyboard.up('ArrowLeft');
 const after=await page.evaluate(()=>window.__NIULAI_TEST__.playerState());assert(after.x>before.x);assert.equal(after.state,'playing');
 await page.keyboard.press('KeyE');await page.waitForTimeout(200);
 await page.screenshot({path:`screenshots/original-preview/game-${mobile?'mobile':'desktop'}.png`});
 assert.deepEqual(errors,[]);console.log(mobile?'Mobile preview PASS':'Desktop preview PASS');await page.close();
}
} finally {await browser.close();}
