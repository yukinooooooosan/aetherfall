import test from 'node:test';
import assert from 'node:assert/strict';
import {World} from '../dist/js/model.js';

function fixture(){const w=new World(1);w.blocks=[];w.grid.clear();w.spatial.clear();w.buildings=[];w.humans=[];w.defenders=[];w.burning.clear();w.changed.clear();w.dirtyBuildings.clear();w.destroyed=0;w.events=[];return w;}
test('a seeded island has reproducible terrain, buildings, citizens and six defenders',()=>{
  const a=new World(7),b=new World(7);assert.deepEqual(a.heights,b.heights);assert.equal(a.blocks.length,b.blocks.length);assert.ok(a.blocks.length>4000);assert.equal(a.humans.length,56);assert.equal(a.defenders.length,6);
});
test('terrain excavation removes multiple surface blocks and persists without changing other columns',()=>{
  const w=new World(),far=w.terrainHeight(55,75),before=w.terrainHeight(0,78);const removed=w.carve(0,before,78,9);assert.ok(removed>0);assert.ok(w.terrainHeight(0,78)<before);assert.equal(w.terrainHeight(55,75),far);assert.equal(w.excavated,removed);
});
test('the same light destroys wood before stone and stone never catches fire',()=>{
  const w=fixture(),id=w.building('test',0,0);w.addBlock(0,8,0,0,id);w.addBlock(3,8,0,1,id);w.impact(3,17,0,8,60);assert.equal(w.blocks[0].alive,false);assert.equal(w.blocks[1].alive,true);w.blocks[1].heat=100000;w.ignite(w.blocks[1]);assert.equal(w.burning.has(1),false);
});
test('fire spreads between neighbouring wooden voxels and consumes them over time',()=>{
  const w=fixture(),id=w.building('wood',0,0);w.addBlock(0,8,0,0,id);w.addBlock(1,8,0,0,id);w.ignite(w.blocks[0]);for(let i=0;i<35;i++)w.tick(.1,null);assert.ok(w.ignited>=2);for(let i=0;i<60;i++)w.tick(.1,null);assert.equal(w.blocks.filter(b=>b.alive).length,0);
});
test('removing the foundation collapses unsupported upper blocks',()=>{
  const w=fixture(),id=w.building('tower',0,0);for(let y=8;y<=12;y++)w.addBlock(0,y,0,1,id);w.checkSupport();assert.equal(w.destroyed,0);w.remove(w.blocks[0]);w.checkSupport();assert.equal(w.destroyed,5);
});
test('an intact generated town is structurally stable',()=>{
  const w=new World();w.buildings.forEach((b,i)=>w.dirtyBuildings.add(i));w.checkSupport();assert.equal(w.destroyed,0);
});
test('citizens flee an impact and their panic settles later',()=>{
  const w=new World();const h=w.humans[0],x=h.x,z=h.z;w.impact(x-5,h.y,z,3,1);assert.ok(h.panic>0);assert.ok(h.dx>0);w.tick(.3,null);assert.ok(Math.hypot(h.x-x,h.z-z)>0);for(let i=0;i<100;i++)w.tick(.1,null);assert.equal(h.panic,0);
});
test('catapults and mages fire and destroying their foundations stops retaliation',()=>{
  const w=new World();for(const d of w.defenders)d.cooldown=0;w.tick(.1,{x:0,y:50,z:60});assert.equal(w.defenders.filter(d=>d.alive).length,6);const shots=w.drainEvents().filter(e=>e.type==='shot');assert.ok(shots.some(e=>e.kind==='catapult'));assert.ok(shots.some(e=>e.kind==='mage'));
  const d=w.defenders[0];for(const id of w.buildings[d.building].blocks)w.remove(w.blocks[id]);d.cooldown=0;w.tick(.1,{x:d.x,y:50,z:d.z});assert.equal(d.alive,false);assert.equal(w.drainEvents().some(e=>e.type==='shot'&&e.x===d.x&&e.z===d.z),false);
});
