import {chromium} from '../../.tools/browser-check/node_modules/playwright/index.mjs';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
const root='/home/yukino/codex-work';
await fs.mkdir(new URL('../artifacts/',import.meta.url),{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:root+'/.tools/browser-check/browsers/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',env:{...process.env,LD_LIBRARY_PATH:root+'/.tools/browser-check/libs/usr/lib/x86_64-linux-gnu',FONTCONFIG_FILE:root+'/.tools/browser-check/fonts.conf'},args:['--no-sandbox','--disable-dev-shm-usage','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:390,height:844},hasTouch:true,isMobile:true,deviceScaleFactor:1});
const errors=[];page.on('pageerror',e=>errors.push(e.message));
const state=()=>page.evaluate(()=>window.__aether.state);
const snapshot=async name=>page.screenshot({path:new URL('../artifacts/'+name+'.png',import.meta.url).pathname});
const center=async selector=>{const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
const wait=async fn=>page.waitForFunction(fn,null,{timeout:15000});
const cdp=await page.context().newCDPSession(page);
const touch=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
try{
 await page.goto('http://127.0.0.1:4173/?test=1');await wait(()=>window.__aether);await page.locator('#start').tap();
 assert.equal((await state()).flightDebug,true);
 for(const selector of ['#crosshair','#target-label','.shield','.stat-line'])assert.equal(await page.locator(selector).isVisible(),false);
 assert.equal(await page.locator('#touch-controls').isVisible(),true);assert.equal((await state()).defenderViews,0);assert.equal((await state()).stats.defenders,0);
 console.log('combat UI and enemy views hidden');
 let p=await center('#flight-pad'),f=await center('#forward-button');
 // A single diagonal touch lifts and turns, with no forward displacement.
 await touch('touchStart',[{...p,id:1}]);await touch('touchMove',[{x:p.x-38,y:p.y-38,id:1}]);
 await wait(()=>{const s=window.__aether.state;return s.position[1]>66&&s.yaw>.2;});
 let s=await state();assert.ok(Math.abs(s.position[0])<.1&&Math.abs(s.position[2]-142)<.1);assert.equal(s.pitch,0);assert.ok(s.pad.x<-.3&&s.pad.y<-.3);
 assert.ok(s.attitude.pitch>.15&&s.attitude.bank>.12);assert.ok(Math.abs(s.attitude.heading-s.yaw)<.001);
 console.log('diagonal lift and yaw without forward',s.position,s.yaw);
 await touch('touchEnd',[]);await wait(()=>window.__aether.state.speed<.2);assert.deepEqual((await state()).pad,{x:0,y:0});await wait(()=>{const a=window.__aether.state.attitude;return Math.abs(a.pitch)<.03&&Math.abs(a.bank)<.03;});
 await page.locator('#reset').tap();
 // Keyboard layout and charge / aim / cancel transitions.
 await page.keyboard.down('KeyW');await wait(()=>window.__aether.state.position[1]>67);await page.keyboard.up('KeyW');
 await page.keyboard.down('KeyS');await wait(()=>window.__aether.state.position[1]<63);await page.keyboard.up('KeyS');
 await page.locator('#reset').tap();await page.keyboard.press('Digit1');
 assert.equal((await state()).attack,'charge');assert.equal((await state()).beamOn,false);
 const anchor=(await state()).position;
 p=await center('#flight-pad');await touch('touchStart',[{x:p.x+35,y:p.y+30,id:1}]);
 await wait(()=>window.__aether.state.beamOn&&window.__aether.world.shots>0);
 assert.deepEqual((await state()).position,anchor);assert.ok((await state()).yaw<-.1);
 assert.ok(await page.locator('#crosshair').isVisible());await touch('touchEnd',[]);await snapshot('sweeping-laser');
 await page.locator('#laser-button').tap();assert.equal((await state()).attack,'flight');
 await page.locator('#laser-button').tap();await page.locator('#forward-button').tap();assert.equal((await state()).attack,'flight');
 await page.locator('#reset').tap();
 // Head north at the stone gatepost, then through the roof of a wooden house.
 await page.evaluate(()=>window.__aether.teleport(12,22,18));await page.keyboard.press('Digit2');
 await wait(()=>window.__aether.state.attack==='return');assert.ok(await page.evaluate(()=>window.__aether.world.blocks.some(b=>b.mat===1&&b.hp===20)));await wait(()=>window.__aether.state.attack==='flight');
 assert.deepEqual((await state()).position,[12,22,18]);
 await page.evaluate(()=>window.__aether.teleport(22,25,90));await page.locator('#dash-button').tap();
 await wait(()=>window.__aether.state.attack==='flight');assert.ok((await state()).position[2]<48);assert.ok((await state()).stats.destroyed>0);
 const counts=[];
 for(const height of [30,150]){
   await page.locator('#reset').tap();await page.evaluate(y=>window.__aether.teleport(0,y,95),height);
   await page.locator('#rain-button').tap();await page.keyboard.down('Space');
   await wait(()=>window.__aether.state.position[2]<51);await page.keyboard.up('Space');
   await page.keyboard.press('Digit3');counts.push(await page.evaluate(()=>window.__aether.state.drops+window.__aether.world.shots));
   await wait(()=>window.__aether.state.drops===0);assert.ok(await page.evaluate(()=>window.__aether.world.shots>0));
 }
 assert.ok(counts[0]>counts[1]);console.log('laser, ram return / penetration and altitude-dependent drops passed',counts);
 await page.locator('#reset').tap();
 // Two real touch pointers: right thumb throttle plus left thumb diagonal pad.
 p=await center('#flight-pad');f=await center('#forward-button');
 await touch('touchStart',[{...p,id:1},{...f,id:2}]);await touch('touchMove',[{x:p.x-38,y:p.y-38,id:1},{...f,id:2}]);
 await wait(()=>{const s=window.__aether.state;return s.position[1]>66&&s.position[2]<138&&s.yaw>.15;});
 s=await state();assert.equal(await page.locator('#forward-button').getAttribute('aria-pressed'),'true');console.log('multitouch forward + diagonal',s.position,s.yaw);
 assert.ok(s.attitude.bank>.15);
 await snapshot('flight-debug-diagonal');
 await touch('touchEnd',[]);await wait(()=>window.__aether.state.speed<.2);assert.equal(await page.locator('#forward-button').getAttribute('aria-pressed'),'false');
 // Forward movement keeps altitude level; down alone descends in place.
 await page.locator('#reset').tap();f=await center('#forward-button');
 await touch('touchStart',[{...f,id:2}]);await wait(()=>window.__aether.state.position[2]<135);s=await state();assert.ok(Math.abs(s.position[1]-63)<.01);assert.equal(s.pitch,0);
 assert.ok(s.attitude.pitch<-.2);console.log('forward lean',s.attitude);
 await touch('touchEnd',[]);await wait(()=>window.__aether.state.speed<.2);
 const before=(await state()).position;p=await center('#flight-pad');await touch('touchStart',[{x:p.x,y:p.y+48,id:1}]);await wait(()=>window.__aether.state.velocity[1]<-10&&window.__aether.state.attitude.pitch<-.15);
 await touch('touchEnd',[]);await wait(()=>window.__aether.state.speed<.2);s=await state();assert.ok(s.position[1]<before[1]-1);assert.ok(Math.hypot(s.position[0]-before[0],s.position[2]-before[2])<.1);
 console.log('level forward and independent descent passed');
 // Cancellation and pause both release controls, even when held.
 p=await center('#flight-pad');await touch('touchStart',[{x:p.x+45,y:p.y,id:1}]);await touch('touchCancel',[]);await wait(()=>window.__aether.state.pad.x===0);
 f=await center('#forward-button');await touch('touchStart',[{...f,id:2}]);await page.keyboard.press('Escape');assert.equal((await state()).paused,true);assert.deepEqual((await state()).pad,{x:0,y:0});assert.equal(await page.locator('#forward-button').getAttribute('aria-pressed'),'false');await touch('touchEnd',[]);await page.locator('#resume').tap();
 await page.locator('#help').tap();assert.equal(await page.locator('#guide').evaluate(d=>d.open),true);await page.locator('#guide-play').tap();
 // Free-look gestures and the former fire key do not enter an attack mode.
 await page.keyboard.down('KeyF');await page.mouse.move(200,350);await page.mouse.down();await page.waitForTimeout(300);await page.mouse.up();await page.keyboard.up('KeyF');
 s=await state();assert.equal(s.beamOn,false);assert.equal(s.projectiles,0);assert.equal(s.stats.destroyed,0);assert.equal(s.stats.excavated,0);
 await page.setViewportSize({width:844,height:390});await page.waitForTimeout(300);await snapshot('flight-debug-landscape');
 const padBox=await page.locator('#flight-pad').boundingBox(),forwardBox=await page.locator('#forward-button').boundingBox();assert.ok(padBox.x>=0&&padBox.y>=0&&padBox.y+padBox.height<=390);assert.ok(forwardBox.x+forwardBox.width<=844&&forwardBox.y+forwardBox.height<=390);
 // Local bank must follow both turn directions while the independent flight
 // controller continues level. Boost adds forward lean; release eases to hover.
 await page.locator('#reset').tap();await page.keyboard.down('Space');await page.keyboard.down('ArrowLeft');
 await wait(()=>{const s=window.__aether.state;return s.attitude.bank>.4&&s.yaw>.4;});s=await state();assert.ok(Math.abs(s.position[1]-63)<.01);await snapshot('flight-pose-left-bank');console.log('left bank',s.attitude);
 await page.keyboard.up('ArrowLeft');await wait(()=>Math.abs(window.__aether.state.attitude.bank)<.04);
 await page.keyboard.down('ArrowRight');await wait(()=>window.__aether.state.attitude.bank<-.4);await snapshot('flight-pose-right-bank');console.log('right bank',(await state()).attitude);await page.keyboard.up('ArrowRight');
 await page.keyboard.down('ShiftLeft');await wait(()=>window.__aether.state.attitude.pitch<-.65);console.log('accelerated forward lean',(await state()).attitude);await page.keyboard.up('ShiftLeft');await page.keyboard.up('Space');
 await wait(()=>{const s=window.__aether.state;return s.speed<.2&&Math.abs(s.attitude.pitch)<.03&&Math.abs(s.attitude.bank)<.03;});
 // The gate counts a passage through the arch, including both faces.
 await page.locator('#reset').tap();
 await page.evaluate(()=>window.__aether.teleport(0,52,28));await page.keyboard.down('Space');
 await wait(()=>window.__aether.state.position[2]<0);await page.keyboard.up('Space');assert.equal((await state()).courseStage,'gate');
 await page.locator('#reset').tap();
 p=await center('#flight-pad');f=await center('#forward-button');
 await touch('touchStart',[{...f,id:2}]);
 await wait(()=>window.__aether.state.position[2]<110);
 await touch('touchStart',[{...f,id:2},{x:p.x,y:p.y+45,id:1}]);
 await wait(()=>window.__aether.state.position[1]<33);
 await touch('touchMove',[{...f,id:2},{...p,id:1}]);
 await wait(()=>window.__aether.state.position[2]<49);
 await snapshot('castle-gate-approach');
 await wait(()=>window.__aether.state.courseStage==='tower');
 await touch('touchMove',[{...f,id:2},{x:p.x-32,y:p.y-32,id:1}]);
 await wait(()=>window.__aether.state.courseStage==='clear');
 await touch('touchEnd',[]);await snapshot('castle-tower-exit');
 assert.equal((await state()).stats.destroyed,0);console.log('course completed manually with two thumbs');
 await page.locator('#reset').tap();assert.equal((await state()).courseStage,'gate');
 await page.goto('http://127.0.0.1:4173/?test=1&demo=1');await wait(()=>window.__aether?.state.demo);
 await page.waitForFunction(()=>window.__aether.state.courseStage==='clear',null,{timeout:60000});
 s=await state();assert.equal(s.beamOn,false);assert.equal(s.stats.destroyed,0);await page.locator('#take-control').tap();assert.equal(await page.locator('#touch-controls').isVisible(),true);assert.equal((await state()).pitch,0);
 // The experiment is reachable from the flight guide and by a direct link.
 await page.locator('#help').tap();await page.locator('#guide-lab').tap();
 assert.equal(await page.locator('#collapse-panel').isVisible(),true);
 for(const [selector,shot] of [['#lab-roof','collapse-roof'],['#lab-square','collapse-square']]){
   await page.locator(selector).tap();await page.locator('#lab-break').tap();
   await wait(()=>document.querySelector('#lab-result').textContent.includes('最大落下'));
   const result=await page.evaluate(()=>({counts:window.__aether.world.collapse.shattered,drop:window.__aether.world.collapse.maxDrop}));
   console.log(shot,result);const [wood,stone,tile]=result.counts;assert.ok(tile>0);
   if(selector==='#lab-roof'){assert.ok(result.drop<3);assert.equal(wood+stone,0);}
   else{assert.ok(result.drop>=12&&wood>0&&stone>0);}
   await snapshot(shot);
 }
 await page.locator('#lab-break').tap();
 await wait(()=>document.querySelector('#lab-result').textContent.includes('最大落下'));
 await page.locator('#lab-exit').tap();assert.equal(await page.locator('#touch-controls').isVisible(),true);
 assert.equal((await state()).stats.destroyed,0);
 await page.setViewportSize({width:390,height:844});await page.goto('http://127.0.0.1:4173/?test=1&collapse=1');
 await wait(()=>window.__aether);await snapshot('collapse-portrait');
 assert.ok(await page.locator('#lab-break').isVisible());await page.locator('#lab-break').tap();
 await wait(()=>document.querySelector('#lab-result').textContent.includes('最大落下'));
 assert.deepEqual(errors,[]);console.log('PASS: diagonal multitouch, independent flight, left/right bank, climb/descent pitch, speed lean, neutral recovery, cancellation, pause, player attacks, landscape and demo');
}finally{await browser.close();}
