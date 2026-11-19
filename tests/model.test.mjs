import test from 'node:test';
import assert from 'node:assert/strict';
import {GateDetails} from '../dist/js/gate-details.js';
import {World} from '../dist/js/model.js';
import {guideMissile, hitDuringFrame, missileCourse, missileSpeed} from '../dist/js/missile.js';
import {DoubleTap,FlightManeuver} from '../dist/js/maneuvers.js';
import {Matrix4,Scene,Vector3} from '../dist/vendor/three.core.js';

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
  const w=fixture(),id=w.building('tower',0,0);for(let y=8;y<=12;y++)w.addBlock(0,y,0,1,id);w.checkSupport();assert.equal(w.destroyed,0);w.remove(w.blocks[0]);w.checkSupport();
  assert.equal(w.destroyed,1);assert.equal(w.collapse.moving.size,1);
  for(let i=0;i<100;i++)w.tick(.025,null);
  assert.equal(w.collapse.moving.size,0);assert.equal(w.collapse.resting.size,1);
  assert.equal(w.destroyed,1);assert.ok(Math.abs(w.blocks[1].y-17)<.01);
  assert.equal(w.solidAt(0,17,0),w.blocks[1]);assert.equal(w.solidAt(0,25,0),null);
});
test('an intact generated town is structurally stable',()=>{
  const w=new World();w.buildings.forEach((b,i)=>w.dirtyBuildings.add(i));w.checkSupport();assert.equal(w.destroyed,0);
});
test('citizens flee an impact and their panic settles later',()=>{
  const w=new World();const h=w.humans[0],x=h.x,z=h.z;w.impact(x-5,h.y,z,3,1);assert.ok(h.panic>0);assert.ok(h.dx>0);w.tick(.3,null);assert.ok(Math.hypot(h.x-x,h.z-z)>0);for(let i=0;i<100;i++)w.tick(.1,null);assert.equal(h.panic,0);
});
test('a low flyby sends pedestrians ahead to opposite sides of the avenue',()=>{
  const w=new World();
  const people=w.humans.slice(0,3);
  people.forEach((h,i)=>Object.assign(h,{x:i===0?-2:2,y:16,z:i===2?74:55}));
  const flight={x:0,y:0,z:-32};
  w.tick(.1,{x:0,y:60,z:70},flight);
  assert.ok(people.every(h=>h.panic===0));
  w.tick(.1,{x:0,y:25,z:70},flight);
  assert.ok(people[0].dx<0&&people[1].dx>0);
  assert.ok(people[0].panic>0&&people[1].panic>0);assert.equal(people[2].panic,0);
});
test('catapults and mages fire and destroying their foundations stops retaliation',()=>{
  const w=new World();for(const d of w.defenders)d.cooldown=0;w.tick(.1,{x:0,y:50,z:60});assert.equal(w.defenders.filter(d=>d.alive).length,6);const shots=w.drainEvents().filter(e=>e.type==='shot');assert.ok(shots.some(e=>e.kind==='catapult'));assert.ok(shots.some(e=>e.kind==='mage'));
  const d=w.defenders[0];for(const id of w.buildings[d.building].blocks)w.remove(w.blocks[id]);d.cooldown=0;w.tick(.1,{x:d.x,y:50,z:d.z});assert.equal(d.alive,false);assert.equal(w.drainEvents().some(e=>e.type==='shot'&&e.x===d.x&&e.z===d.z),false);
});

function land(w){for(let i=0;i<240;i++)w.tick(.025,null);assert.equal(w.collapse.moving.size,0);}
test('actual fall to the first supporting surface selects tile, timber and stone thresholds',()=>{
  for(const [drop,broken] of [[0,[]],[2,[2]],[4,[2]],[6,[0,2]],[10,[0,2]],[12,[0,1,2]]]){
    const w=fixture(),id=w.building('mixed roof',0,0);
    for(let mat=0;mat<3;mat++)w.addBlock(mat,8+drop/2,0,mat,id);
    w.dirtyBuildings.add(id);w.checkSupport();land(w);
    assert.deepEqual(w.blocks.filter(v=>!v.alive).map(v=>v.mat),broken);
  }
});
test('same notch hinges into a roof or falls into the square, retaining surviving stone',()=>{
  for(const catchRoof of [true,false]){
    const w=new World(7419,{catchRoof,defenses:false});w.notchTower();
    const body=[...w.collapse.moving][0];assert.ok(body.hinged);
    const tip=body.parts.at(-1).v,x=tip.x;w.tick(.2,null);assert.ok(tip.x>x);
    land(w);const [wood,stone,tile]=w.collapse.shattered;
    assert.ok(tile>0);assert.ok(w.blocks.some(v=>v.alive&&v.loose&&v.mat===1));
    if(catchRoof){
      assert.ok(w.collapse.maxDrop<3);assert.equal(wood+stone,0);
      const roof=w.buildings.find(b=>b.name==='張り出し屋根');
      for(const id of roof.blocks)w.remove(w.blocks[id]);
      w.tick(.05,null);assert.ok(w.collapse.moving.size>0);land(w);
    }else{assert.ok(w.collapse.maxDrop>=12);assert.ok(wood>0&&stone>0);}
  }
});
test('symmetric loss of an entire band releases a straight-falling component',()=>{
  const w=new World();
  for(const id of w.buildings[w.towerId].blocks)if(w.blocks[id].y===29)w.remove(w.blocks[id]);
  w.checkSupport();const b=[...w.collapse.moving][0];assert.ok(b&&!b.hinged);
  const v=b.parts[0].v,{x,z,y}=v;w.tick(.1,null);assert.equal(v.x,x);assert.equal(v.z,z);assert.ok(v.y<y);
});
test('wide and narrow render intervals produce the same square impact',()=>{
  function result(intervals){
    const w=new World(7419,{defenses:false});w.notchTower();
    for(let frame=0;frame<500&&w.collapse.moving.size;frame++)w.tick(intervals[frame%intervals.length],null);
    assert.equal(w.collapse.moving.size,0);
    return {broken:w.collapse.shattered,height:w.collapse.maxDrop};
  }
  assert.deepEqual(result([.08,.073,.056]),result([1/60]));
});

test('a direct beam strikes once along its visible segment and a nearby resident flees',()=>{
  const w=new World();
  const [hit,near,behind]=w.humans=w.humans.slice(0,3);
  for(const [h,x,z] of [[hit,0,70],[near,4,70],[behind,0,57]])Object.assign(h,{x,y:16,z});
  const from={x:0,y:17,z:80},to={x:0,y:17,z:60};
  w.strikeAlongBeam(from,to);
  assert.equal(hit.struckAt,0);assert.equal(hit.panic,0);
  assert.equal(near.struckAt,null);assert.ok(near.panic>0);
  assert.equal(behind.struckAt,null);
  w.tick(.3,null);
  w.strikeAlongBeam(from,to);
  assert.deepEqual([hit.x,hit.y,hit.z,hit.struckAt],[0,16,70,0]);
});

test('a blast strikes within its 3D radius and leaves bystanders alive',()=>{
  const w=new World();
  const [hit,near]=w.humans=w.humans.slice(0,2);
  Object.assign(hit,{x:0,y:16,z:70});Object.assign(near,{x:8,y:16,z:70});
  w.impact(0,26,70,6,90);
  assert.equal(hit.struckAt,null);
  w.impact(0,16,70,6,90);
  assert.equal(hit.struckAt,0);assert.equal(near.struckAt,null);
  assert.equal(w.getStats().panicking,1);
});

test('double taps require distinct fast strokes and tolerate stick jitter',()=>{
  const taps=new DoubleTap();
  assert.deepEqual([[.7,0],[.4,50],[.8,100],[0,160],[.7,250]].map(([axis,t])=>taps.sample(axis,t)),[0,0,0,0,1]);
  taps.reset();
  assert.deepEqual([[-.8,0],[0,100],[-.8,400],[0,470],[-.65,580]].map(([axis,t])=>taps.sample(axis,t)),[0,0,0,0,-1]);
});

test('a vertical loop gains two radii and exits on the original heading',()=>{
  const origin=new Vector3(12,65,-31),out=new Vector3();
  const loop=new FlightManeuver('loop',origin,.8,62,1);
  assert.ok(Math.abs(loop.point(.5,out).y-origin.y-2*loop.radius)<1e-6);
  assert.ok(loop.point(1,out).distanceTo(origin)<1e-6);
  assert.equal(loop.cameraHeading(.5),.8);
  const high=new FlightManeuver('loop',new Vector3(0,235,0),0,95,1);
  assert.equal(high.point(.5,out).y,240);
});

test('turns reverse in either direction and the chase camera finishes its orbit later',()=>{
  for(const side of [-1,1]){
    const flip=new FlightManeuver('flip',new Vector3(0,40,0),0,18,side);
    assert.equal(flip.heading(.55),side*Math.PI);
    assert.ok(Math.abs(flip.cameraHeading(.55))<Math.PI/2);
    assert.equal(flip.cameraHeading(1),flip.heading(1));
    assert.ok(flip.point(.5,new Vector3()).z<0);
  }
});

test('flip shot starts at the current camera, tracks close to the subject and exits behind the new heading',()=>{
  const out=new Vector3();
  for(const side of [-1,1]){
    const turn=new FlightManeuver('flip',new Vector3(8,68,23),.7,32,side);
    turn.cameraOffset=new Vector3(6,7,17);
    assert.ok(turn.orbitOffset(0,15,out).distanceTo(turn.cameraOffset)<1e-8);
    turn.orbitOffset(.5,15,out);
    assert.ok(Math.abs(Math.hypot(out.x,out.z)-10)<1e-8);
    assert.ok(Math.abs(out.y-1.25)<1e-8);
    assert.equal(turn.orbitWeight(.5),1);
    turn.orbitOffset(1,15,out);
    const exit=.7+side*Math.PI;
    assert.ok(out.distanceTo(new Vector3(15*Math.sin(exit),5.6,15*Math.cos(exit)))<1e-8);
  }
});

test('the siege switches attackers at the gate and losing the tower tip silences the mage',()=>{
  const world=new World(7419,{defenses:'siege'});
  const [mage,catapult]=['mage','catapult'].map(type=>world.defenders.find(d=>d.type===type));
  assert.equal(world.defenders.length,2);
  assert.equal(world.solidAt(mage.x,mage.y-1,mage.z),mage.support);
  const player={x:0,y:26,z:8};
  function shots(phase){
    const events=[];
    for(let i=0;i<40;i++){
      world.tick(.05,player,null,phase);
      events.push(...world.drainEvents().filter(e=>e.type==='shot'));
    }
    return events.map(e=>e.kind);
  }
  assert.deepEqual(shots('catapult'),['catapult']);
  assert.deepEqual(shots('mage'),['mage']);
  world.damage(mage.support,100);
  assert.deepEqual(shots('mage'),[]);
  assert.equal(mage.alive,false);
  assert.equal(catapult.alive,true);
});

test('after warning, a straight flight is intercepted but a vertical loop clears the same shot',()=>{
  for(const dt of [1/60,.08]){
    for(const evade of [false,true]){
      const position=new Vector3(0,24,-23), playerVelocity=new Vector3(0,0,-32);
      const shot=new Vector3(-32,52,-10);
      const velocity=missileCourse(shot,position,playerVelocity,new Vector3()).multiplyScalar(missileSpeed);
      let committed=false, hit=false, move=null, reactionTime=0;
      for(let time=0;time<7;time+=dt){
        const previous=position.clone(), previousShot=shot.clone();
        if(!committed)committed=guideMissile(shot,velocity,position,playerVelocity,dt);
        if(committed)reactionTime+=dt;
        if(evade && committed && reactionTime>=.24 && !move)move=new FlightManeuver('loop',position,0,32,1);
        if(move && move.time<move.duration){
          move.time=Math.min(move.duration,move.time+dt);
          move.point(move.progress,position);
        }else position.addScaledVector(playerVelocity,dt);
        shot.addScaledVector(velocity,dt);
        if(hitDuringFrame(previousShot,shot,previous,position,2.6)){hit=true;break;}
      }
      assert.equal(committed,true);
      assert.equal(hit,!evade);
      if(hit)assert.ok(reactionTime>=.9,'first shot allows time to react after warning');
    }
  }
});

test('a side step crosses six metres relative to heading while carrying entry speed',()=>{
  for(const yaw of [0,.8,-2.4]){
    for(const side of [-1,1]){
      for(const speed of [0,32,97]){
        const origin=new Vector3(4,53,-12), move=new FlightManeuver('step',origin,yaw,speed,side);
        const travel=move.point(1,new Vector3()).sub(origin);
        assert.ok(Math.abs(travel.dot(move.right)-6*side)<1e-8);
        assert.ok(Math.abs(travel.dot(move.forward)-move.duration*speed)<1e-8);
        assert.equal(travel.y,0);
        assert.equal(move.heading(.5),yaw);
      }
    }
  }
});

test('castle starts supported, with an open approach across the moat and two flyable gates',()=>{
  const w=new World(7419,{castle:true});
  assert.equal(w.terrainHeight(0,76),16);
  assert.equal(w.terrainHeight(24,76),0);
  for(const [x,z] of [[0,60],[26,-8]]){
    for(let dz=-5;dz<=5;dz++)assert.equal(w.solidAt(x,27,z+dz),null);
    assert.ok(w.solidAt(x+10,27,z));
  }
  w.buildings.forEach((_,i)=>w.dirtyBuildings.add(i));
  w.checkSupport();
  assert.equal(w.looseCount,0);
  const roof=w.blocks.find(b=>b.mat===2 && b.building===w.buildings.findIndex(t=>t.name==='白鷺天守'));
  w.damage(roof,100);
  assert.equal(roof.alive,false);
});

test('severing one main gate pier tips the roof toward that side after the beam stops',()=>{
  for(const side of [-1,1]){
    const w=new World(7419,{castle:true}),roof=w.solidAt(0,41,66);
    const scene=new Scene(),details=new GateDetails(w,scene),shed=[];
    const updateDetails=()=>{
      for(const id of w.changed)details.update(w.blocks[id],(position,block)=>shed.push({x:position.x,axisZ:block.axisZ}));
      w.changed.clear();
    };
    // Advance the impact point through the timber as the beam opens a cut.
    for(let pulse=0;pulse<8;pulse++){
      let z=68;
      while(z>54 && !w.solidAt(side*11,26,z))z-=.25;
      if(z<=54)break;
      w.impact(side*11,26,z,5.8,53);
      w.tick(.12,null,null);updateDetails();
    }
    for(let i=0;i<20;i++){w.tick(.05,null,null);updateDetails();}
    assert.ok(roof.alive && roof.angle>.15 && side*roof.x>2);
    assert.ok(Math.abs(roof.axisZ+side)<.05);
    assert.ok(w.solidAt(-side*11,26,60));
    assert.ok(shed.length>=4 && shed.every(tile=>side*tile.x>0 && tile.axisZ*side<0));
    const lowerEave=w.blocks.find(b=>b.building===w.entranceBuilding && b.gx===side*8 && b.gz===33 && b.mat===2);
    const caps=details.groups.get(lowerEave.id).pieces.filter(p=>p.cap);
    assert.equal(caps.length,4);
    for(const cap of caps){
      const matrix=new Matrix4();
      details.meshes[cap.batch].getMatrixAt(cap.index,matrix);
      assert.equal(matrix.determinant(),0);
    }
    details.dispose();
    assert.equal(scene.children.length,0);
    assert.ok(w.drainEvents().some(e=>e.type==='debris' && e.building===w.entranceBuilding && e.mat===0));
  }
});
