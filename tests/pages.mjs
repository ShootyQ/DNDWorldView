import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox','--enable-unsafe-swiftshader']});
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[],backend=[];page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().includes('/api/')||r.url().startsWith('ws'))backend.push(r.url());});
 await page.goto(process.env.PAGES_URL||'http://127.0.0.1:4173/DNDWorldView/');
 await page.getByText('Browser workspace',{exact:true}).waitFor();await page.locator('canvas').waitFor();
 await page.locator('.asset').filter({hasText:'Player portrait'}).click();await page.locator('canvas').click({position:{x:480,y:450}});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hearth-world-v1')||'null')?.revision>0);
 const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=16;c.getContext('2d').fillRect(0,0,16,16);return c.toDataURL('image/png');});
 await page.locator('.upload input').setInputFiles({name:'hero.png',mimeType:'image/png',buffer:Buffer.from(image.split(',')[1],'base64')});
 await page.waitForFunction(()=>JSON.parse(localStorage.getItem('hearth-world-v1')).objects.some(o=>o.asset==='marker'&&o.portrait));
 const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('hearth-world-v1')));
 await page.reload();await page.getByText('Browser workspace',{exact:true}).waitFor();assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('hearth-world-v1')).revision),saved.revision);
 const downloading=page.waitForEvent('download');await page.getByRole('button',{name:'Export world and portraits',exact:true}).click();const {readFile}=await import('node:fs/promises');const exported=JSON.parse(await readFile(await (await downloading).path(),'utf8'));assert.equal(Object.keys(exported.portraits).length,1);
 await page.getByRole('button',{name:'Import world',exact:true}).click();await page.locator('.modal input[type=file]').setInputFiles({name:'world.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(exported))});
 await page.waitForFunction(revision=>JSON.parse(localStorage.getItem('hearth-world-v1')).revision>revision,saved.revision);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.waitForFunction(revision=>JSON.parse(localStorage.getItem('hearth-world-v1')).revision>revision+1,saved.revision);
 await page.getByRole('button',{name:'Sharing options',exact:true}).click();await page.getByRole('heading',{name:'Share a snapshot.'}).waitFor();
 assert.deepEqual(errors,[]);assert.deepEqual(backend,[]);console.log('Pages editor passed: subpath assets, browser persistence, portraits, export/import, undo, sharing explanation, no backend requests or runtime errors.');
}finally{await browser.close();}
