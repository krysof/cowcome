import {chromium} from '@playwright/test';
import {mkdir} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:true});
const page=await browser.newPage({viewport:{width:1024,height:1024}});
await mkdir('public/portraits/original',{recursive:true});await mkdir('screenshots/original-preview',{recursive:true});
for(const [name,query] of [['niuniu','variant=0'],['stonehoof','variant=1'],['speckle','variant=2'],['super-bull','variant=1&super=1']]){
 await page.goto(`http://localhost:5173/art/preview.html?portrait=1&${query}`);await page.waitForFunction(()=>window.ready);await page.locator('canvas').screenshot({path:`public/portraits/original/${name}.png`});
 await page.goto(`http://localhost:5173/art/preview.html?${query}`);await page.waitForFunction(()=>window.ready);await page.locator('canvas').screenshot({path:`screenshots/original-preview/${name}-body.png`});
}
await browser.close();
