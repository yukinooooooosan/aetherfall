// Use the same test against the local server or the published Pages project.
import assert from 'node:assert/strict';
const baseURL=process.env.GAME_BASE_URL || 'http://127.0.0.1:4173/';
const testURL=new URL('?test=1',baseURL).href;
const {chromium} = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  executablePath:process.env.CHROMIUM_PATH || undefined,
  args:['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
});
const page = await browser.newPage({viewport:{width:390,height:844}, hasTouch:true, isMobile:true, deviceScaleFactor:.75});
const errors=[];
page.on('pageerror',error=>errors.push(error.message));
const wait=predicate=>page.waitForFunction(predicate,null,{timeout:45000});
const state=()=>page.evaluate(()=>window.__aether.state);
const cdp=await page.context().newCDPSession(page);
const touch=(type,touchPoints,timestamp)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints,timestamp});
async function center(selector,id){
  const {x,y,width,height}=await page.locator(selector).boundingBox();
  return {x:x+width/2,y:y+height/2,id};
}
try{
  await page.goto(testURL);
  await page.locator('#start-siege').tap();
  assert.equal((await state()).defenderViews,2);
  const forward=await center('#forward-button',1), pad=await center('#flight-pad',2);
  await touch('touchStart',[forward]);
  await wait(()=>window.__aether.state.position[2]<110);
  await touch('touchStart',[forward,{...pad,y:pad.y+44}]);
  await wait(()=>window.__aether.state.position[1]<32);
  await touch('touchMove',[forward,pad]);
  await wait(()=>window.__aether.state.courseStage==='tower');
  assert.ok(await page.evaluate(()=>window.__aether.world.defenders.find(d=>d.type==='catapult').fired>0));
  console.log('Stone thrower active on approach; gate crossed');
  await wait(()=>!document.querySelector('#missile-alert').hidden);
  const before=(await state()).health, up={...pad,y:pad.y-43};
  console.log('Warning at', (await state()).position);
  // Timestamp the two physical strokes independently of automation round trips.
  const now=Date.now()/1000;
  await touch('touchMove',[forward,up],now);
  await touch('touchMove',[forward,pad],now+.07);
  await touch('touchMove',[forward,up],now+.15);
  await wait(()=>window.__aether.state.maneuver==='loop');
  await touch('touchMove',[forward,pad]);
  await wait(()=>window.__aether.projectiles.some(p=>p.kind==='mage' && p.passed));
  await wait(()=>!window.__aether.state.maneuver);
  assert.ok((await state()).health>=before);
  await touch('touchEnd',[]);
  console.log('Incoming shot passed during the touch loop without damage');

  // Stage the firing position so this checks the actual beam and tower support
  // without coupling the assertion to precise camera timing on a software GPU.
  await page.evaluate(()=>window.__aether.teleport(-34,55,9));
  await page.locator('#laser-button').tap();
  await wait(()=>window.__aether.state.courseStage==='clear');
  assert.ok(await page.evaluate(()=>!window.__aether.world.defenders.find(d=>d.type==='mage').alive));
  await page.locator('#reset').tap();
  const restarted=await state();
  assert.equal(restarted.courseStage,'gate');
  assert.equal(restarted.stats.defenders,2);
  assert.equal(restarted.projectiles,0);
  console.log('Beam silenced the tower; replay restored both defenders');
  await page.goto(testURL);
  await page.locator('#start').tap();
  assert.equal((await state()).stats.defenders,0);
  assert.equal(await page.locator('#missile-alert').isVisible(),false);
  await page.goto(new URL('?siege=1&test=1',baseURL).href);
  await wait(()=>window.__aether?.state.active && window.__aether.state.defenderViews===2);
  assert.deepEqual(errors,[]);
} catch(error){
  console.error('Flight at failure:', await page.evaluate(()=>{
    const s=window.__aether.state;
    return {stage:s.courseStage, position:s.position, health:s.health, maneuver:s.maneuver, pad:s.pad,
      heading:s.yaw, speed:s.speed, toast:document.querySelector('#toast').textContent, aim:s.aim};
  }));
  throw error;
} finally {
  await browser.close();
}
