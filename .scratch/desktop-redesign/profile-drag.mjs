// Controlled-provider diagnostic; run with E2E_FRONTEND_PORT=3009 E2E_PROVIDER_PORT=3016 node --import tsx.
import { chromium, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { signIn, currentSession, applicationOrigin } from '../../tests/e2e/auth-support.ts';
const browser = await chromium.launch();
const page = await browser.newPage({ baseURL: applicationOrigin, viewport: { width: 1440, height: 900 } });
try {
 await signIn(page);
 await page.getByRole('link', {name:'Boards',exact:true}).click();
 if(await page.getByRole('button',{name:'Boards',exact:true}).count()) await page.getByRole('button',{name:'Boards',exact:true}).click();
 await page.getByLabel('Board name',{exact:true}).fill('Drag profiling');
 await page.getByRole('button',{name:'Create board',exact:true}).click();
 await page.locator('.tl-container').waitFor();
 await page.getByRole('button',{name:'Repositories',exact:true}).click();
 await page.getByLabel('Search repositories').fill('alice/project');
 await page.getByRole('button',{name:/alice\/project/}).first().click();
 await page.getByLabel('State',{exact:true}).selectOption('all');
 await page.getByRole('button',{name:'Connect repository',exact:true}).click();
 await page.getByRole('button',{name:'Add all matching',exact:true}).click();
 await page.locator('.workspace-card').first().waitFor();
 await page.getByRole('button',{name:'Close Incoming'}).click();
 const id=new URL(page.url()).pathname.split('/').pop();
 const session=await currentSession(page.request);
 const headers={'X-CSRF-Token':session.csrfToken,Origin:applicationOrigin};
 // Wait for real persistence before using this board as the benchmark fixture.
 let source;
 for(let i=0;i<100;i++) { source=await (await page.request.get(`/api/boards/${id}`,{headers})).json(); if(Object.values(source.document.snapshot.store).filter(x=>x.type==='item-card').length===5) break; await page.waitForTimeout(20); }
 const cards=Object.values(source.document.snapshot.store).filter(x=>x.type==='item-card');
 const base=Object.fromEntries(Object.entries(source.document.snapshot.store).filter(([,r])=>r.typeName!=='shape'));
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 const stats=[];
 for(const [kind,mode] of [['item-card','selected'],['item-card','off'],['geo','off']]) {
  const current=await (await page.request.post('/api/boards',{headers,data:{title:`Profile ${kind} ${mode}`}})).json();
  const store={...base};
  for(let i=0;i<30;i++) {
   const original=cards[i%cards.length];
   store[`shape:profile${i}`]={...original,id:`shape:profile${i}`,index:`a${(i+1).toString(36)}`,x:460+(i%4)*300,y:180+Math.floor(i/4)*230,
    ...(kind==='geo'?{type:'geo',props:{w:280,h:200,geo:'rectangle',flipX:false,flipY:false,color:'black',labelColor:'black',fill:'solid',dash:'draw',size:'m',font:'draw',align:'middle',verticalAlign:'middle',growY:0,url:'',scale:1,richText:{type:'doc',content:[{type:'paragraph'}]}}}:{})};
  }
  const response=await page.request.put(`/api/boards/${current.id}`,{headers,data:{expectedRevision:current.revision,incoming:source.incoming,document:{...current.document,snapshot:{...current.document.snapshot,store}}}});
  if(!response.ok()) throw new Error(`Fixture ${kind}: ${response.status()} ${await response.text()}`);
  await page.goto(`/boards/${current.id}`);await page.locator('[data-shape-id="shape:profile0"]').waitFor();
  if(kind==='item-card') await page.locator('.workspace-card-title').first().waitFor();
  await page.getByRole('button',{name:'View',exact:true}).click();await page.getByLabel('Connections',{exact:true}).selectOption(mode);await page.getByRole('button',{name:'Close View',exact:true}).click();
  const shape=page.locator('[data-shape-id="shape:profile0"]');
  const box=await shape.boundingBox();const x=box.x+box.width*.7,y=box.y+40;
  await page.mouse.move(x,y);await page.mouse.down();
  await cdp.send('Profiler.enable');await cdp.send('Profiler.start');
  const before=await cdp.send('Performance.getMetrics');const start=performance.now();
  for(let i=0;i<180;i++) await page.mouse.move(x+Math.sin(i/30)*100,y+Math.cos(i/30)*60);
  await page.mouse.up();const elapsed=performance.now()-start;
  await expect.poll(async () => (await shape.boundingBox())?.x).toBeCloseTo(box.x + Math.sin(179/30)*100, 1);
  await expect.poll(async () => (await shape.boundingBox())?.y).toBeCloseTo(box.y + Math.cos(179/30)*60, 1);
  const after=await cdp.send('Performance.getMetrics');const {profile}=await cdp.send('Profiler.stop');
  await writeFile(`/tmp/gitboard-drag-${kind}-${mode}.cpuprofile`,JSON.stringify(profile));
  const metrics=Object.fromEntries(after.metrics.filter(m=>['TaskDuration','ScriptDuration','LayoutDuration','RecalcStyleDuration'].includes(m.name)).map(m=>[m.name,m.value-(before.metrics.find(b=>b.name===m.name)?.value??0)]));
  stats.push({kind,mode,elapsed,metrics});console.log(JSON.stringify(stats.at(-1)));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await expect(page.locator('.board-save')).toHaveAttribute('data-save-state','saved');
 }
} finally { await browser.close(); }
