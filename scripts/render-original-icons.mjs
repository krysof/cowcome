import {chromium} from '@playwright/test';
import {readdir} from 'node:fs/promises';
const b=await chromium.launch();try{const page=await b.newPage();
for(const name of await readdir('public/icons')){
 if(!name.endsWith('.png'))continue;
 const size=name.includes('favicon')?32:name.includes('apple-touch')?180:Number(name.match(/(1024|512|192)/)?.[1]||512);
 await page.setViewportSize({width:size,height:size});
 await page.goto('http://localhost:5173/art/preview.html?portrait=1&variant=0');await page.waitForFunction(()=>window.ready);
 await page.locator('canvas').screenshot({path:`public/icons/${name}`});
}
}finally{await b.close();}
