import * as THREE from '../vendor/three.module.js';
import { DoubleTap, FlightManeuver } from './maneuvers.js?v=step1';
import { StormCompanion } from './companion.js?v=0.9.1';
import { Heroine } from './heroine.js?v=step1';
import {guideMissile, hitDuringFrame, missileCourse, missileSpeed} from './missile.js';
import {GateDetails} from './gate-details.js';
import {castleGates,castleHints,courtyardColor} from './castle.js?v=gate2';
import { World, MATERIALS, damageStage, BLOCK, random, gate, gateClearance, westTower } from './model.js?v=gate2';

const $=s=>document.querySelector(s),clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const canvas=$('#world'),keys=new Set(),rng=random(829);
// Independent vertical lift is used in both flight courses.
const FLIGHT_DEBUG=true;
const padInput={x:0,y:0,pointerId:null};
const verticalTaps=new DoubleTap(), horizontalTaps=new DoubleTap();
const flightKeys=new Set(['KeyA','KeyD','KeyW','KeyS','ArrowLeft','ArrowRight','ArrowUp','ArrowDown']);
function resetFlightTaps(){verticalTaps.reset();horizontalTaps.reset();}
let maneuver=null,touchForward=false,loopRecovery=null;
function resetControls(){resetFlightTaps();touchForward=false;keys.clear();pointerDown=false;rightDown=false;padInput.x=padInput.y=0;padInput.pointerId=null;$('#pad-knob').style.transform='translate(-50%, -50%)';$('#flight-pad').classList.remove('engaged');for(const b of document.querySelectorAll('[data-key]')){b.classList.remove('pressed');b.setAttribute('aria-pressed','false');}}
let renderer,scene,camera,world,terrain,blockMesh,gateDetails,forest,treeTrunks,treeLeaves,humans=[],defenderViews=[],treeViews=[],effects=[],projectiles=[];
let active=false,paused=false,demo=false,demon=false,beamOn=false,pointerDown=false,rightDown=false,audioOn=false;
let pausedBeforeGuide=false,lab=false,catchRoof=true,labDropped=false;
let elapsed=0,fireClock=0,simClock=0,hudClock=0,toastClock=0,hitClock=0,frameCount=0,fps=60,lastHudTime=0;
let yaw=0,pitch=-.08,health=100,velocity=new THREE.Vector3(),speed=0,aim=new THREE.Vector3(),aimHit=null;
const playerPos=new THREE.Vector3(0,63,142),forward=new THREE.Vector3(),temp=new THREE.Object3D(),v3=new THREE.Vector3(),ray=new THREE.Raycaster();
const startPosition=playerPos.clone(),lastPosition=new THREE.Vector3();
let siege=false, castle=false;
const castleStart=new THREE.Vector3(0,27,122);
let courseStage='gate',insideGate=false,towerArc=0;
const courseHints={
  gate:['南の城門をくぐる','大通りに沿って、赤い屋根の高さまで下降。'],
  tower:['青緑の塔を左に回る','塔を左手に、左上の斜め入力で屋根を越えよう。'],
  clear:['城門コースを完走','↻ でもう一度。続けて自由に飛べます。']
};
const siegeHints={
  gate:['投石をかわして城門をくぐる','赤い屋根の高さまで下降。岩は発射後に曲がりません。'],
  tower:['青緑の塔の魔導師に反撃','誘導弾は ↑ ↑ で回避。光線で塔の頂を壊そう。'],
  clear:['城門迎撃戦を突破','魔導師の足場を破壊。↻ でもう一度。']
};
const demoRoute=new THREE.CatmullRomCurve3([
  startPosition,[0,45,99],[0,28,58],[0,25,19],[0,25,5],[-4,29,-10],
  [-16,37,-29],[-36,49,-34],[-54,58,-24],[-63,63,-1],
  [-74,69,64],[-49,74,137],[-14,69,160]
].map(p=>p.isVector3?p:new THREE.Vector3(...p)),true);
const demoLength=demoRoute.getLength(),demoTangent=new THREE.Vector3(),demoNext=new THREE.Vector3();
let avatar,avatarPose,heroine,beam,beamCore,impactGlow,windLines,audioCtx,windGain,beamGain,windFilter;
const particleCapacity=900,particleData=[],particleGeo=new THREE.BoxGeometry(1,1,1),particleMat=new THREE.MeshLambertMaterial({color:0xffffff});
let particles;const beamMaterial=new THREE.MeshBasicMaterial({color:0xffd388,transparent:true,opacity:.19,depthWrite:false,blending:THREE.AdditiveBlending});
const beamCoreMaterial=new THREE.MeshBasicMaterial({color:0xfff5cb,transparent:true,opacity:.95,depthWrite:false});

function fatal(error){$('#fatal').hidden=false;$('#fatal-message').textContent=String(error?.message||error);$('#intro').hidden=true;console.error(error);}
function toast(msg){$('#toast').textContent=msg;$('#toast').classList.add('visible');toastClock=3.5;}
function material(color,opts={}){return new THREE.MeshLambertMaterial({color,...opts});}
function mesh(geometry,mat,parent=scene){const m=new THREE.Mesh(geometry,mat);parent.add(m);return m;}
function box(w,h,d,color,parent){return mesh(new THREE.BoxGeometry(w,h,d),material(color),parent);}

function init(){
  renderer=new THREE.WebGLRenderer({canvas,antialias:true,powerPreference:'high-performance'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));renderer.setSize(innerWidth,innerHeight);
  renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=1.25;
  scene=new THREE.Scene();scene.background=new THREE.Color(0xb7c5bd);scene.fog=new THREE.FogExp2(0xb7c5bd,.0027);
  camera=new THREE.PerspectiveCamera(60,innerWidth/innerHeight,.3,1800);
  scene.add(new THREE.HemisphereLight(0xf5e9cb,0x415653,1.8));
  const sun=new THREE.DirectionalLight(0xffdfad,2.1);sun.position.set(-100,180,70);scene.add(sun);
  const sky=mesh(new THREE.SphereGeometry(1500,24,12),new THREE.ShaderMaterial({side:THREE.BackSide,depthWrite:false,uniforms:{top:{value:new THREE.Color(0x88aeb6)},bottom:{value:new THREE.Color(0xf1d6b6)}},vertexShader:'varying vec3 vPos;void main(){vPos=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:'uniform vec3 top;uniform vec3 bottom;varying vec3 vPos;void main(){float h=normalize(vPos).y;gl_FragColor=vec4(mix(bottom,top,smoothstep(-.08,.65,h)),1.);\n#include <colorspace_fragment>\n}'}));sky.renderOrder=-10;
  const sea=mesh(new THREE.PlaneGeometry(12000,12000),material(0x87a6a4,{transparent:true,opacity:.97}));sea.renderOrder=-8;sea.rotation.x=-Math.PI/2;sea.position.y=-.6;
  // Distant land masses are scenery, outside the playable destructible island.
  for(let i=0;i<24;i++){
    const a=i/24*Math.PI*2,r=430+rng()*300,h=40+rng()*125;
    const m=mesh(new THREE.ConeGeometry(70+rng()*110,h,5),material(new THREE.Color().setHSL(.43,.13,.41+rng()*.12)));
    m.position.set(Math.sin(a)*r,h/2-4,Math.cos(a)*r);m.rotation.y=rng()*6;
  }
  for(let i=0;i<17;i++){
    const c=new THREE.Group(),mat=material(0xf5e7cc,{transparent:true,opacity:.29,depthWrite:false});
    for(let j=0;j<4;j++){const puff=mesh(new THREE.IcosahedronGeometry(1,0),mat,c);puff.position.set(j*18,rng()*4,0);puff.scale.set(26,6+rng()*4,14);}
    c.position.set((rng()-.5)*1300,100+rng()*80,(rng()-.5)*1100);scene.add(c);
  }
  particles=new THREE.InstancedMesh(particleGeo,particleMat,particleCapacity);particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);particles.frustumCulled=false;particles.count=0;scene.add(particles);
  beam=mesh(new THREE.CylinderGeometry(1.6,.35,1,8,1,true),beamMaterial);beamCore=mesh(new THREE.CylinderGeometry(.22,.07,1,6,1,true),beamCoreMaterial);
  const glowGeo=new THREE.SphereGeometry(1,12,8);impactGlow=mesh(glowGeo,new THREE.MeshBasicMaterial({color:0xffdc91,transparent:true,opacity:.55,depthWrite:false,blending:THREE.AdditiveBlending}));
  beam.visible=beamCore.visible=impactGlow.visible=false;
  avatar=createAvatar();scene.add(avatar);
  companion=new StormCompanion(new THREE.TextureLoader().load(new URL('../assets/companion-orbit-8dir48.png',import.meta.url).href,undefined,undefined,()=>fatal('相棒の画像を読み込めませんでした。')));
  scene.add(companion);
  createDashWings();
  createWind();rebuildWorld(false);resize();
  camera.position.copy(playerPos).add(new THREE.Vector3(17,15,29));camera.lookAt(0,24,-20);
  $('#loading').textContent='WORLD READY  /  '+world.initialBlocks.toLocaleString()+' BLOCKS';
  requestAnimationFrame(loop);
}

function rebuildWorld(notify=true){
  if(terrain){scene.remove(terrain);terrain.geometry.dispose();terrain.material.dispose();terrain=null;}
  gateDetails?.dispose();gateDetails=null;
  if(blockMesh){scene.remove(blockMesh);blockMesh.dispose();blockMesh.geometry.dispose();blockMesh.material.dispose();}
  for(const h of humans){scene.remove(h.sprite);h.sprite.material.dispose();}
  for(const d of defenderViews){scene.remove(d.group);d.group.traverse(o=>{if(o.isMesh || o.isSprite){if(o.isMesh)o.geometry.dispose();o.material.dispose();}});}
  if(forest){scene.remove(forest);forest.traverse(o=>{if(o.isMesh){if(o.isInstancedMesh)o.dispose();o.geometry.dispose();o.material.dispose();}});}
  for(const p of projectiles){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();}
  for(const e of effects){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}
  effects=[];projectiles=[];particleData.length=0;humans=[];defenderViews=[];treeViews=[];
  world=new World(7419,{castle,catchRoof:lab&&catchRoof,defenses:siege ? 'siege' : !FLIGHT_DEBUG});
  buildTerrain();buildBlocks();
  if(castle)gateDetails=new GateDetails(world,scene);
  buildHumans();if(world.defenders.length)buildDefenders();buildTrees();
  health=100;playerPos.copy(castle ? castleStart : startPosition);velocity.set(0,0,0);yaw=0;pitch=FLIGHT_DEBUG?0:-.08;speed=0;fireClock=0;hitClock=0;resetControls();beamOn=false;
  $('#missile-alert').hidden=true;
  resetCourse();resetAttacks();heroine.reset();
  if(active){elapsed=0;camera.position.copy(playerPos).add(new THREE.Vector3(0,6,17));}
  avatar.rotation.set(0,0,0);avatarPose.rotation.set(0,0,0);
  if(notify){toastClock=0;$('#toast').classList.remove('visible');}
}

function showCourse(stage){
  courseStage=stage;
  const hints=castle ? castleHints : siege ? siegeHints : courseHints;
  const [title,hint]=hints[stage];
  $('#course-title').textContent=title;$('#course-hint').textContent=hint;
}
function resetCourse(){
  insideGate=false;towerArc=0;showCourse('gate');
}
function crossedOpening(before,after,z){
  if(before.z<=z||after.z>z)return false;
  const t=(before.z-z)/(before.z-after.z);
  const x=lerp(before.x,after.x,t),altitude=lerp(before.y,after.y,t)-gate.ground;
  return altitude>=2&&altitude+.6<gateClearance(x);
}
function updateCastleCourse(before,after){
  const arch=castleGates[courseStage];
  function crosses(z,minX,maxX,minY,maxY){
    if(before.z<=z || after.z>z)return false;
    const t=(before.z-z)/(before.z-after.z);
    const x=lerp(before.x,after.x,t), y=lerp(before.y,after.y,t);
    return x>minX && x<maxX && y>=minY && y<maxY;
  }
  if(arch){
    const left=arch.x-arch.halfWidth,right=arch.x+arch.halfWidth;
    if(crosses(arch.z+5,left,right,18,arch.ceiling-.6))insideGate=true;
    if(insideGate && crosses(arch.z-5,left,right,18,arch.ceiling-.6)){
      insideGate=false;showCourse(arch.next);
    }else if(after.z>arch.z+5 || after.x<=left || after.x>=right || after.y+.6>=arch.ceiling)insideGate=false;
  }else if(courseStage==='climb' && crosses(-65,-56,56,52,Infinity))showCourse('clear');
}
function updateCourse(before,after){
  if(castle){updateCastleCourse(before,after);return;}
  if(siege && courseStage!=='gate'){
    if(courseStage==='tower' && !world.defenders.some(d=>d.type==='mage' && d.alive))showCourse('clear');
    return;
  }
  const entry=gate.z+gate.halfDepth,exit=gate.z-gate.halfDepth;
  if(crossedOpening(before,after,entry))insideGate=true;
  if(insideGate){
    if(crossedOpening(before,after,exit)){insideGate=false;towerArc=0;showCourse('tower');}
    else if(after.z>entry||after.y+.6>=gate.ground+gateClearance(after.x))insideGate=false;
  }
  if(siege || courseStage!=='tower')return;
  const x=after.x-westTower.x,z=after.z-westTower.z;
  const radius=Math.hypot(x,z);
  if(radius<8||radius>60){towerArc=0;return;}
  const px=before.x-westTower.x,pz=before.z-westTower.z;
  const angle=Math.atan2(pz*x-px*z,px*x+pz*z);
  towerArc=Math.max(0,towerArc+angle);
  if(x<0&&towerArc>=1.9&&after.y>westTower.peak)showCourse('clear');
}

function buildTerrain(){
  const pos=[],colors=[],indices=[];const color=new THREE.Color();
  function face(points,col){const start=pos.length/3;color.setHex(col);for(const p of points){pos.push(...p);colors.push(color.r,color.g,color.b);}indices.push(start,start+1,start+2,start,start+2,start+3);}
  for(let z=0;z<world.size;z++)for(let x=0;x<world.size;x++){
    const i=z*100+x,h=world.heights[i];if(!h)continue;const x0=x*4-200,z0=z*4-200,x1=x0+4,z1=z0+4,y=h*4;
    const noise=((x*137+z*331)%11)/11;let c=new THREE.Color().setHSL(.25+noise*.025,.21+noise*.08,.35+noise*.06).getHex();
    if(h>9)c=new THREE.Color().setHSL(.2,.10,.48+noise*.12).getHex();
    if(h===1)c=0xb4ab7a;
    const wx=x0+2,wz=z0+2,turnRadius=Math.hypot(wx-westTower.x,wz-westTower.z);
    const avenue=Math.abs(wx)<8&&wz>=-10&&wz<102;
    const bend=wz<westTower.z&&Math.abs(turnRadius-32)<6;
    if(castle)c=courtyardColor(wx,wz)??c;
    else if(avenue||bend||Math.abs(z0-16)<3&&Math.abs(x0)<66)c=(x+z)%3===0?0xa99372:0xb19e7d;
    if(h<world.originalHeights[i])c=world.originalHeights[i]-h<3?0x887655:0x7f8177;
    face([[x0,y,z0],[x0,y,z1],[x1,y,z1],[x1,y,z0]],c);
    const dirs=[[1,0],[0,1],[-1,0],[0,-1]];
    for(const [dx,dz] of dirs){const nh=x+dx<0||z+dz<0||x+dx>=100||z+dz>=100?0:world.heights[(z+dz)*100+x+dx];
      for(let level=nh;level<h;level++){const by=level*4,ty=by+4,side=level<h-3?0x7e8175:level===h-1?0x777d50:0x8b7a56;
        if(dx===1)face([[x1,by,z1],[x1,by,z0],[x1,ty,z0],[x1,ty,z1]],side);
        if(dx===-1)face([[x0,by,z0],[x0,by,z1],[x0,ty,z1],[x0,ty,z0]],side);
        if(dz===1)face([[x0,by,z1],[x1,by,z1],[x1,ty,z1],[x0,ty,z1]],side);
        if(dz===-1)face([[x1,by,z0],[x0,by,z0],[x0,ty,z0],[x1,ty,z0]],side);
      }
    }
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  if(terrain){terrain.geometry.dispose();terrain.geometry=g;}else terrain=mesh(g,material(0xffffff,{vertexColors:true}));
  world.terrainDirty=false;
}
function patchFace(ctx,color,points){
  ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(...points[0]);
  for(const point of points.slice(1))ctx.lineTo(...point);
  ctx.closePath();ctx.fill();
}
function drawWoodSplit(ctx,stage){
  // Long tapered splinters follow the grain; narrow bands expose the torn lip.
  const end=[0,60,100,134][stage],gap=[0,3,7,12][stage];
  patchFace(ctx,'#794e36',[[-3,54],[30,56],[48,52],[end,55],[46,56+gap],[29,58+gap],[-3,60+gap]]);
  patchFace(ctx,'#251e17',[[-3,56],[33,58],[48,54],[end,55],[47,55+gap*.55],[31,59+gap*.55],[-3,59+gap*.55]]);
  if(stage>=2){
    patchFace(ctx,'#966e43',[[15,73],[51,69],[42,73],[stage===3?118:88,67],[46,79]]);
    patchFace(ctx,'#36291e',[[15,75],[54,71],[43,75],[stage===3?112:80,70],[47,78]]);
  }
  if(stage===3){
    patchFace(ctx,'#67472e',[[48,50],[69,45],[61,45],[126,34],[75,47],[84,47]]);
    patchFace(ctx,'#3b2b1f',[[5,85],[44,81],[35,84],[73,80],[39,87]]);
  }
}
function drawTileChips(ctx,stage){
  // Angular chips grow inward from the rim, leaving flat facets below the glaze.
  const chip=(x,y,size,flip)=>{
    ctx.save();ctx.translate(x,y);ctx.scale(size*flip,size);
    patchFace(ctx,'#392924',[[0,0],[44,0],[36,10],[29,11],[18,26],[8,21],[0,33]]);
    patchFace(ctx,'#bb9278',[[0,0],[38,0],[28,9],[17,21],[8,15],[0,25]]);
    patchFace(ctx,'#846654',[[0,0],[21,0],[17,9],[8,15],[0,11]]);
    ctx.restore();
  };
  chip(0,0,[0,.64,1.06,1.52][stage],1);
  if(stage>=2)chip(128,0,stage===2?.48:.89,-1);
  if(stage===3){
    ctx.save();ctx.translate(128,128);ctx.rotate(Math.PI);chip(0,0,.95,1);ctx.restore();
    patchFace(ctx,'#725446',[[27,31],[35,23],[50,20],[61,14],[52,23],[38,26]]);
  }
}
function createDamageAtlas(){
  const tile=128,canvas=document.createElement('canvas');
  canvas.width=4*tile;canvas.height=12*tile;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='white';ctx.fillRect(0,0,canvas.width,canvas.height);
  for(let row=0;row<4;row++){
    const jitter=random(321+row);
    const point=(x,y)=>[x+(jitter()-.5)*13,y+(jitter()-.5)*13];
    const main=[point(30,-5),point(39,24),point(53,37),point(47,52),point(66,65),point(61,86),point(79,103),point(75,134)];
    const fork=[main[3],point(69,46),point(85,50),point(100,31),point(131,24)];
    const lower=[main[5],point(39,88),point(29,104),point(-4,109)];
    const twig=[fork[2],point(92,64),point(109,71)];
    for(let stage=1;stage<=3;stage++){
      for(const mat of [0,2]){
        ctx.save();ctx.translate(stage*tile,((2-mat)*4+row)*tile);
        ctx.beginPath();ctx.rect(0,0,tile,tile);ctx.clip();
        ctx.translate(tile/2,tile/2);
        if(mat===2)ctx.rotate(row*Math.PI/2);
        else{ctx.scale(row%2?-1:1,1);ctx.translate(0,(row-1.5)*7);}
        ctx.translate(-tile/2,-tile/2);
        if(mat===0)drawWoodSplit(ctx,stage);else drawTileChips(ctx,stage);
        ctx.restore();
      }
      ctx.save();ctx.translate(stage*tile,(row+4)*tile);
      ctx.beginPath();ctx.rect(0,0,tile,tile);ctx.clip();
      ctx.translate(tile/2,tile/2);ctx.rotate(row*Math.PI/2);ctx.translate(-tile/2,-tile/2);
      function fissure(points,width){
        for(const [weight,color] of [[width+2.5,'#a39989'],[width,'#322e2c']]){
          ctx.beginPath();ctx.moveTo(...points[0]);
          for(const p of points.slice(1))ctx.lineTo(...p);
          ctx.lineWidth=weight;ctx.strokeStyle=color;ctx.lineJoin='bevel';ctx.stroke();
        }
      }
      fissure(main.slice(0,[0,4,6,8][stage]),stage*1.8+.8);
      if(stage>=2)fissure(fork.slice(0,stage===2?3:5),stage+1);
      if(stage===3){fissure(lower,3.5);fissure(twig,2);}
      ctx.restore();
    }
  }
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
const damageAtlas=createDamageAtlas();
function damageTile(block){
  const stage=damageStage(block);
  return stage?(block.mat*4+block.id%4)*4+stage:0;
}
function buildBlocks(){
  const geometry=new THREE.BoxGeometry(1.94,1.94,1.94);
  const tiles=new THREE.InstancedBufferAttribute(Float32Array.from(world.blocks,damageTile),1);
  geometry.setAttribute('crackTile',tiles.setUsage(THREE.DynamicDrawUsage));
  const surface=material(0xffffff,{map:damageAtlas});
  surface.onBeforeCompile=shader=>{
    shader.vertexShader='attribute float crackTile;\n'+shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
      vMapUv=(vec2(mod(crackTile,4.0),floor(crackTile/4.0))+mix(vec2(.02),vec2(.98),vMapUv))/vec2(4.0,12.0);`);
  };
  blockMesh=new THREE.InstancedMesh(geometry,surface,world.blocks.length);blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);blockMesh.frustumCulled=false;
  const color=new THREE.Color();for(const b of world.blocks){temp.position.set(b.x,b.y,b.z);temp.scale.setScalar(b.alive?1:0);temp.rotation.set(0,0,0);temp.updateMatrix();blockMesh.setMatrixAt(b.id,temp.matrix);color.setHex(b.color??MATERIALS[b.mat].color).multiplyScalar(.84+((b.id*137)%17)/60);blockMesh.setColorAt(b.id,color);}
  blockMesh.instanceMatrix.needsUpdate=true;blockMesh.instanceColor.needsUpdate=true;scene.add(blockMesh);
}
function updateBlocks(){
  const tiles=blockMesh.geometry.attributes.crackTile;
  for(const id of world.changed){const b=world.blocks[id],tile=damageTile(b);
    gateDetails?.update(b,shedGateTile);
    if(tiles.getX(id)!==tile){tiles.setX(id,tile);tiles.needsUpdate=true;}
    if(!b.alive){temp.position.set(b.x,-1000,b.z);temp.scale.setScalar(0);temp.updateMatrix();blockMesh.setMatrixAt(id,temp.matrix);}else{
    temp.position.set(b.x,b.y,b.z);temp.scale.setScalar(1);temp.rotation.set(0,0,0);
    if(b.angle)temp.quaternion.setFromAxisAngle(v3.set(b.axisX,0,b.axisZ),b.angle);
    temp.updateMatrix();blockMesh.setMatrixAt(id,temp.matrix);
    if(b.burn)blockMesh.setColorAt(id,new THREE.Color(0x55341e));
  }}
  if(world.changed.size){blockMesh.instanceMatrix.needsUpdate=true;blockMesh.instanceColor.needsUpdate=true;world.changed.clear();}
}

const spriteTextures=[];
function humanTexture(frame,mage=false){
  const c=document.createElement('canvas');c.width=12;c.height=18;const ctx=c.getContext('2d');
  const rect=(x,y,w,h,col)=>{ctx.fillStyle=col;ctx.fillRect(x,y,w,h);};
  if(mage){rect(4,1,4,2,'#dbc3af');rect(3,0,6,2,'#414065');rect(4,3,4,4,'#e3ba97');rect(3,7,6,7,'#71618a');rect(2,11,8,4,'#71618a');rect(9,4,1,12,'#b5976a');rect(9,2,2,2,'#e8bbea');}
  else{
    rect(4,1,4,3,'#5d4236');rect(4,3,4,4,'#e5c6a0');rect(5,4,1,1,'#493b32');rect(3,7,6,6,'#d0b58e');rect(3,8,2,4,'#637b75');rect(8,8,2,4,'#637b75');
    rect(frame?3:4,13,2,4,'#4b4a47');rect(frame?7:6,13,2,frame?3:4,'#4b4a47');rect(frame?2:8,8,2,3,'#dec19b');
  }
  const texture=new THREE.CanvasTexture(c);texture.magFilter=THREE.NearestFilter;texture.minFilter=THREE.NearestFilter;texture.generateMipmaps=false;texture.colorSpace=THREE.SRGBColorSpace;return texture;
}
spriteTextures.push(humanTexture(0),humanTexture(1),humanTexture(0,true));
function buildHumans(){for(const h of world.humans){const s=new THREE.Sprite(new THREE.SpriteMaterial({map:spriteTextures[0],transparent:true,alphaTest:.15,depthWrite:false}));s.scale.set(1.2,1.8,1);s.position.set(h.x,h.y+.9,h.z);scene.add(s);humans.push({sprite:s,data:h});}}
function buildDefenders(){
  for(const d of world.defenders){const group=new THREE.Group();group.position.set(d.x,d.y,d.z);scene.add(group);
    if(d.type==='catapult'){
      const body=box(4,.5,5,0x5d4835,group);body.position.y=.6;
      for(const x of [-2,2])for(const z of [-1.7,1.7]){const wheel=mesh(new THREE.CylinderGeometry(.8,.8,.38,8),material(0x453b32),group);wheel.rotation.z=Math.PI/2;wheel.position.set(x,.5,z);}
      for(const x of [-1,1]){const post=box(.45,2.6,.5,0x8d6746,group);post.position.set(x,1.6,0);post.rotation.z=x*.2;}
      const arm=box(.3,.35,5.6,0xa07c52,group);arm.position.set(0,2.5,-.3);arm.rotation.x=-.55;d.arm=arm;
      const scoop=mesh(new THREE.SphereGeometry(.7,6,4),material(0x7b7668),group);scoop.position.set(0,4,-2.5);
    }else{
      const spr=new THREE.Sprite(new THREE.SpriteMaterial({map:spriteTextures[2],alphaTest:.15,transparent:true}));spr.scale.set(1.4,2.1,1);spr.position.y=1.1;group.add(spr);
      const ring=mesh(new THREE.TorusGeometry(2.2,.06,4,24),new THREE.MeshBasicMaterial({color:0xc5a4d4,transparent:true,opacity:.7}),group);ring.rotation.x=-Math.PI/2;ring.position.y=.1;d.ring=ring;
    }
    defenderViews.push({group,data:d});
  }
}
function buildTrees(){
  const r=random(131),points=[];
  for(let i=0;i<155;i++){const x=(r()-.5)*330,z=(r()-.5)*320,y=world.terrainHeight(x,z);if(y<8||y>48||Math.abs(x)<69&&z>-70&&z<103)continue;
    points.push({x,y,z,h:5+r()*6,alive:true,id:points.length});
  }
  forest=new THREE.Group();treeTrunks=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),material(0x675a3a),points.length);treeLeaves=new THREE.InstancedMesh(new THREE.ConeGeometry(1,1,5),material(0xffffff),points.length*2);forest.add(treeTrunks,treeLeaves);scene.add(forest);
  for(const p of points){temp.rotation.set(0,0,0);temp.position.set(p.x,p.y+p.h/2,p.z);temp.scale.set(.65,p.h,.65);temp.updateMatrix();treeTrunks.setMatrixAt(p.id,temp.matrix);
    for(let j=0;j<2;j++){temp.rotation.y=r()*6;temp.position.set(p.x,p.y+p.h*.65+j*p.h*.26,p.z);temp.scale.set(2.4-j*.6,p.h*.65,2.4-j*.6);temp.updateMatrix();treeLeaves.setMatrixAt(p.id*2+j,temp.matrix);treeLeaves.setColorAt(p.id*2+j,new THREE.Color(j?0x526c51:0x3e5e4a));}
  }
  treeViews=points;treeTrunks.instanceMatrix.needsUpdate=true;treeLeaves.instanceMatrix.needsUpdate=true;treeLeaves.instanceColor.needsUpdate=true;
}

function createAvatar(){
  const root=new THREE.Group();
  avatarPose=new THREE.Group();root.add(avatarPose);
  const atlas=new THREE.TextureLoader().load(new URL('../assets/heroine-flight-v1.png?v=0.8.0',import.meta.url).href,undefined,undefined,()=>fatal('主人公の画像を読み込めませんでした。'));
  heroine=new Heroine(atlas);root.add(heroine);
  return root;
}
function updateAvatarPose(dt,horizontalSpeed,verticalSpeed,turn){
  const cruise=clamp(horizontalSpeed/32,0,1),fast=clamp((horizontalSpeed-32)/65,0,1);
  const travelAngle=Math.atan2(verticalSpeed,Math.max(horizontalSpeed,10));
  const targetPitch=clamp(-cruise*.56-fast*.24+clamp(travelAngle*.7,-.7,.7),-1.26,.7);
  const targetBank=clamp(turn*.93*(.35+.65*cruise),-1.05,1.05);
  // Respond quickly to a new lean, then ease back as motion and turn settle.
  avatarPose.rotation.x=lerp(avatarPose.rotation.x,targetPitch,1-Math.exp(-dt*7));
  avatarPose.rotation.z=lerp(avatarPose.rotation.z,targetBank,1-Math.exp(-dt*(Math.abs(targetBank)>.02?9:4.8)));
  avatar.rotation.set(0,yaw,0);
}
function setCharacter(dark){demon=dark;heroine.setDark(dark);beamMaterial.color.setHex(dark?0xa56de0:0xffd388);beamCoreMaterial.color.setHex(dark?0xf0c7ff:0xfff5cb);$('#god').setAttribute('aria-pressed',!dark);$('#demon').setAttribute('aria-pressed',dark);toast(dark?'闇の悪魔に姿を変えました':'光の神に姿を変えました');}
function createWind(){const arr=new Float32Array(42*2*3);windLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf7edce,transparent:true,opacity:0}));windLines.geometry.setAttribute('position',new THREE.BufferAttribute(arr,3));scene.add(windLines);}

function castAim(){
  ray.setFromCamera(new THREE.Vector2(0,0),camera);const o=ray.ray.origin,d=ray.ray.direction;
  for(let t=.4;t<650;t+=.75){const x=o.x+d.x*t,y=o.y+d.y*t,z=o.z+d.z*t;
    const b=world.solidAt(x,y,z);
    if(b){aim.set(x,y,z);return {type:'block',block:b};}
    if(y<=world.terrainHeight(x,z)&&world.terrainHeight(x,z)>0){aim.set(x,y,z);return {type:'terrain'};}
    if(y<0){aim.set(x,0,z);return {type:'sea'};}
  }aim.copy(o).addScaledVector(d,420);return null;
}
function beamBetween(m,from,to){const d=v3.copy(to).sub(from),length=d.length();m.position.copy(from).addScaledVector(d,.5);m.scale.set(1,length,1);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
function emit(x,y,z,color,amount=1,force=7,kind='debris'){
  for(let i=0;i<amount;i++){
    if(particleData.length>=particleCapacity)particleData.shift();
    if(kind==='ash'){
      particleData.push({x:x+(rng()-.5)*.7,y:y+rng()*1.6,z:z+(rng()-.5)*.4,vx:(rng()-.5)*2,vy:1+rng()*2,vz:(rng()-.5)*2,life:.35+rng()*.36,size:.1+rng()*.14,color,kind,rotation:rng()*6});
      continue;
    }
    const f=force*(.3+rng());particleData.push({x,y,z,vx:(rng()-.5)*f,vy:kind==='fire'?4+rng()*5:rng()*f,vz:(rng()-.5)*f,life:kind==='fire'?.6+rng()*.6:1.2+rng()*1.2,max:2,size:kind==='fire'?.35+rng()*.65:.2+rng()*.6,color,kind,rotation:rng()*6});
  }
}
function shedGateTile(position,block,face,color){
  if(particleData.length>=particleCapacity)particleData.shift();
  const speed=3+rng()*3;
  particleData.push({x:position.x,y:position.y,z:position.z,vx:-block.axisZ*speed,vy:-1,
    vz:block.axisX*speed+face*(2+rng()*2),kind:'tile',size:.65+rng()*.2,rotation:rng(),color,life:2.6});
}
function impactRing(x,y,z,r,color=demon?0xd19deb:0xffe7a9){const m=mesh(new THREE.RingGeometry(.8,1,32),new THREE.MeshBasicMaterial({color,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,Math.max(y+.2,world.terrainHeight(x,z)+.15),z);effects.push({mesh:m,life:.55,max:.55,r});}
function playImpact(){if(!audioCtx||!audioOn)return;const osc=audioCtx.createOscillator(),g=audioCtx.createGain();osc.type='sine';osc.frequency.setValueAtTime(120,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(35,audioCtx.currentTime+.18);g.gain.setValueAtTime(.09,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.23);osc.connect(g).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.25);}
function warnMissile(){
  if(!audioCtx || !audioOn)return;
  const tone=audioCtx.createOscillator(), gain=audioCtx.createGain(), now=audioCtx.currentTime;
  tone.frequency.setValueAtTime(620,now);tone.frequency.setValueAtTime(880,now+.12);
  gain.gain.setValueAtTime(.055,now);gain.gain.exponentialRampToValueAtTime(.001,now+.32);
  tone.connect(gain).connect(audioCtx.destination);tone.start(now);tone.stop(now+.32);
}
function shoot(e){
  const mage=e.kind==='mage',mat=new THREE.MeshBasicMaterial({color:mage?0xd4a0f5:0x827766});
  const m=mesh(mage?new THREE.IcosahedronGeometry(.65,1):new THREE.IcosahedronGeometry(1,0),mat);m.position.set(e.x,e.y,e.z);
  const p={mesh:m,kind:e.kind,velocity:new THREE.Vector3(),age:0,trail:0,committed:false,passed:false};
  if(mage)missileCourse(m.position,e.target,velocity,p.velocity).multiplyScalar(missileSpeed);
  else{const distance=Math.hypot(e.target.x-e.x,e.target.z-e.z),t=clamp(distance/28,1.8,4.2);p.velocity.set((e.target.x-e.x)/t,(e.target.y-e.y+6*t*t)/t,(e.target.z-e.z)/t);}
  projectiles.push(p);
  toast(mage?'塔から誘導弾！':'門の左から投石！');
}
function processEvents(){
  let debrisCount=0;
  for(const e of world.drainEvents()){
    if(e.type==='debris'&&debrisCount++<95){
      const materialDebris=e.reason==='landing' || e.building===world.entranceBuilding;
      const kind=materialDebris?['splinter','dust','tile'][e.mat]:'debris';
      const color=kind==='dust'?0xbeaf94:kind==='splinter'?0xc28e60:e.color;
      emit(e.x,e.y,e.z,color,materialDebris?4:1,e.reason==='landing'?7:10,kind);
    }
    if(e.type==='impact'&&e.effect==='lightning'){
      emit(e.x,e.y+.12,e.z,0x9aeaff,14,10,'spark');impactRing(e.x,e.y,e.z,e.r*.7,0x63dcff);playImpact();
    }else if(e.type==='impact'){emit(e.x,e.y,e.z,demon?0xd3a5ed:0xffdea1,9,14,'spark');impactRing(e.x,e.y,e.z,e.r);playImpact();}
    if(e.type==='shot' && siege)shoot(e);
  }
}
const shotFrom=new THREE.Vector3(), separation=new THREE.Vector3();
function updateProjectiles(dt){
  let warning=false;
  for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.age+=dt;p.trail+=dt;
    shotFrom.copy(p.mesh.position);
    if(p.kind==='mage'){
      if(!p.committed && guideMissile(shotFrom,p.velocity,lastPosition,velocity,dt)){
        p.committed=true;
        p.mesh.material.color.setHex(0xffdf94);
        warnMissile();
      }
    }else p.velocity.y-=12*dt;
    p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*2;p.mesh.rotation.z+=dt;
    if(p.trail>.07){p.trail=0;emit(p.mesh.position.x,p.mesh.position.y,p.mesh.position.z,p.kind==='mage'?0xbe8be3:0xaa9a7e,1,1,'fire');}
    const ppos=p.mesh.position,hit=hitDuringFrame(shotFrom,ppos,lastPosition,playerPos,p.kind==='mage'?2.6:3.5),ground=ppos.y<=world.terrainHeight(ppos.x,ppos.z);
    if(p.committed && !p.passed && !hit && !ground){
      if(separation.subVectors(playerPos,ppos).dot(p.velocity)<0){
        p.passed=true;
        toast('誘導弾を回避！　塔の頂へ反撃');
      }else warning=true;
    }
    if(hit||ground||p.age>13){
      if(hit&&hitClock<=0&&active){health=Math.max(0,health-(p.kind==='mage'?12:22));hitClock=.8;$('#damage-flash').style.opacity='.6';setTimeout(()=>$('#damage-flash').style.opacity='0',180);toast('反撃を受けた — 加速・旋回して回避');}
      if(ground&&p.kind==='catapult')world.impact(ppos.x,ppos.y,ppos.z,2.5,12);
      emit(ppos.x,ppos.y,ppos.z,p.kind==='mage'?0xc699e6:0xb9a48a,8,9,'spark');scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();projectiles.splice(i,1);
    }
  }
  $('#missile-alert').hidden=!warning;
  if(health<=0){rebuildWorld();toast('神威が尽きた。城門の手前から再挑戦');}
}

function clipCameraBoom(){
  // Pull the camera inside the arch when masonry would hide the avatar.
  const boom=camera.position.clone().sub(playerPos),length=boom.length();
  boom.normalize();
  for(let d=1;d<length+.75;d+=.75){
    const sample=v3.copy(playerPos).addScaledVector(boom,Math.min(d,length));
    if(world.solidAt(sample.x,sample.y,sample.z)||sample.y<world.terrainHeight(sample.x,sample.z)+.45){
      camera.position.copy(playerPos).addScaledVector(boom,Math.max(.65,d-1.25));break;
    }
  }
}

const stepCameraLag=new THREE.Vector3();
const chaseVelocity=new THREE.Vector3(),previousCameraPosition=new THREE.Vector3();
function updateLoopCamera(move,dt){
  // Carry the incoming camera velocity briefly, then let the heroine travel
  // inside a dead zone. Predict its boundary crossing to avoid a late snap.
  const drift=(Math.exp(-Math.max(0,move.time-dt)/.14)-Math.exp(-move.time/.14))*.14;
  camera.position.addScaledVector(move.entryCameraVelocity,drift);
  const lookAhead=Math.min(.19,move.time);
  const future=move.point(Math.min(1,(move.time+lookAhead)/move.duration),move.cameraSpace);
  future.sub(camera.position).applyQuaternion(move.inverseView);
  const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov*.5));
  const depth=Math.max(10,-future.z);
  const halfHeight=depth*tangent*.49;
  const halfWidth=halfHeight*camera.aspect;
  future.set(future.x-clamp(future.x,-halfWidth,halfWidth),future.y-clamp(future.y,-halfHeight,halfHeight),Math.max(0,future.z+11));
  // A modest pullback at the edge reduces how far the landscape must rise
  // and fall on the larger boost loop.
  future.z+=Math.min(7,Math.abs(future.y)*.28);
  future.applyQuaternion(camera.quaternion);
  camera.position.addScaledVector(future,1-Math.exp(-dt*5.2));
  clipCameraBoom();
}

function updateChaseCamera(dt,distance,height,response,headingYaw=yaw){
  const heading=new THREE.Vector3(-Math.sin(headingYaw),0,-Math.cos(headingYaw));
  const rear=playerPos.clone().addScaledVector(heading,-distance);rear.y+=height;
  const releasing=releaseRemaining>0;
  if(releasing){
    releaseRemaining=Math.max(0,releaseRemaining-dt);
    const progress=1-releaseRemaining/releaseDuration;
    const angle=Math.atan2(-8-height,29+distance);
    laserAimRotation.setFromEuler(laserAngles.set(angle,yaw,0));
    laserOffset.copy(rear).sub(playerPos).applyQuaternion(inverseCameraRotation.copy(laserAimRotation).invert());
    blendLaserCamera(THREE.MathUtils.smoothstep(progress,0,1));
  }else if(maneuver?.kind==='flip'){
    maneuver.orbitOffset(maneuver.progress,distance,camera.position).add(playerPos);
  }else{
    if(loopRecovery){
      const t=loopRecovery.time;
      camera.position.addScaledVector(loopRecovery.velocity,.16*(Math.exp(-t/.16)-Math.exp(-(t+dt)/.16)));
      response*=.10+.90*THREE.MathUtils.smoothstep(t,0,.80);
    }
    camera.position.lerp(rear,1-Math.exp(-dt*response));
  }
  clipCameraBoom();
  // Aim along the camera-to-player bearing, so follow lag during a turn does
  // not push the character to either side of the screen.
  if(releasing)return;
  stepCameraLag.multiplyScalar(Math.exp(-dt*9));
  const focus=playerPos.clone();
  // Let the heroine lead the view briefly. Keep her visible in portrait and near walls.
  const halfWidth=camera.position.distanceTo(playerPos)*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect;
  stepCameraLag.clampLength(0,halfWidth*.32);
  focus.sub(stepCameraLag);
  const viewForward=focus.clone().sub(camera.position);viewForward.y=0;viewForward.normalize();
  const target=focus.addScaledVector(viewForward,29);target.y-=8;
  if(maneuver?.kind==='flip'){
    // Ease the gaze from the flight path onto the heroine through the side view.
    target.lerp(playerPos,maneuver.orbitWeight(maneuver.progress));
  }
  camera.lookAt(target);
  if(loopRecovery){
    loopRecovery.time+=dt;
    camera.quaternion.slerp(loopRecovery.start,1-THREE.MathUtils.smoothstep(loopRecovery.time,0,.80));
    if(loopRecovery.time>=.80)loopRecovery=null;
  }
}
const chargeDuration=.7,returnDuration=.72,fullReleaseDuration=.54;
let releaseDuration=fullReleaseDuration,releaseRemaining=0,firstReleaseFrame=0;
let attack='flight',attackTime=0,sightYaw=0,sightPitch=0,dashDistance=0;
const laserStartRotation=new THREE.Quaternion(),laserAimRotation=new THREE.Quaternion();
const laserStartOffset=new THREE.Vector3(),laserOffset=new THREE.Vector3(),beamOrigin=new THREE.Vector3();
const inverseCameraRotation=new THREE.Quaternion();
const laserAngles=new THREE.Euler(0,0,0,'YXZ');
const dashStart=new THREE.Vector3(),dashEnd=new THREE.Vector3(),dashDir=new THREE.Vector3();
let companion;

const wingReach=12;
const dashWings=new THREE.Group(),dashHits=new Set();
const wingSide=new THREE.Vector3(),wingUp=new THREE.Vector3(),wingBack=new THREE.Vector3();
const wingColor=new THREE.Color(),wingDelta=new THREE.Vector3();
const wingHeight=u=>.3+1.35*Math.sin(Math.PI*u)-.35*u;
const wingTrail=u=>.2+2.6*u*u;
const wingChord=u=>2.5*(1-u);

function createDashWings(){
  const positions=[],colors=[],trailingEdges=[];
  function vertex(side,u,trailing,glow){
    positions.push(side*u*wingReach,wingHeight(u)-trailing*.19,wingTrail(u)+trailing);
    colors.push(glow,glow,glow);
    if(trailing>0)trailingEdges.push({index:colors.length/3-1,u,trailing});
  }
  for(const side of [-1,1])for(let i=0;i<10;i++){
    const a=i/10,b=(i+1)/10;
    // A bright leading edge with ten tapered, overlapping flight feathers.
    const tip=Math.min(1,b+.07);
    vertex(side,a,0,1);vertex(side,b,0,1);vertex(side,tip,wingChord(b),.52);
    vertex(side,a,0,1);vertex(side,tip,wingChord(b),.52);vertex(side,a,wingChord(a)*.55,.74);
  }
  const geometry=new THREE.BufferGeometry();
  geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
  geometry.computeBoundingSphere();
  geometry.boundingSphere.radius+=.5;
  dashWings.userData.trailingEdges=trailingEdges;
  const light=new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,opacity:.88,depthWrite:false,toneMapped:false});
  const plumage=mesh(geometry,light,dashWings);
  plumage.renderOrder=-2;
  const aura=mesh(geometry,new THREE.MeshBasicMaterial({side:THREE.DoubleSide,transparent:true,opacity:.24,depthWrite:false,blending:THREE.AdditiveBlending}),dashWings);
  aura.renderOrder=-3;
  aura.scale.set(1.045,1.12,1.16);
  dashWings.visible=false;scene.add(dashWings);
}
function spreadDashWings(){
  dashHits.clear();dashWings.position.copy(playerPos);
  wingSide.set(-dashDir.z,0,dashDir.x);
  if(wingSide.lengthSq()<.0001)wingSide.set(Math.cos(yaw),0,-Math.sin(yaw));
  wingSide.normalize();wingBack.copy(dashDir).negate();wingUp.crossVectors(wingBack,wingSide).normalize();
  dashWings.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(wingSide,wingUp,wingBack));
  wingColor.setHex(demon?0xefb2ff:0xffe7a3);
  for(const layer of dashWings.children)layer.material.color.copy(wingColor);
  dashWings.scale.setScalar(.18);
}
function dashDamage(block){
  if(dashHits.has(block.id))return;
  dashHits.add(block.id);world.damage(block,80);
  if(block.alive)emit(block.x,block.y,block.z,wingColor.getHex(),2,5,'spark');
}
function sweepDashWings(){
  const t=Math.min(1,dashDistance/8);
  const scale=.18+.82*t*(2-t),reach=wingReach*scale;
  dashWings.position.copy(playerPos);dashWings.scale.setScalar(scale);
  function touchesWing(x,y,z,padding,verticalPadding){
    wingDelta.set(x-playerPos.x,y-playerPos.y,z-playerPos.z);
    const lateral=Math.abs(wingDelta.dot(wingSide));
    if(lateral>reach+padding)return false;
    const u=Math.min(1,lateral/reach),height=wingDelta.dot(wingUp),depth=wingDelta.dot(wingBack);
    const front=wingTrail(u)*scale,chord=wingChord(u)*scale,top=wingHeight(u)*scale;
    return depth>=front-padding&&depth<=front+chord+padding&&height>=top-.19*chord-verticalPadding&&height<=top+verticalPadding;
  }
  world.nearby(playerPos.x,playerPos.y,playerPos.z,reach+2,block=>{
    if(!dashHits.has(block.id)&&touchesWing(block.x,block.y,block.z,1,1))dashDamage(block);
  });
  for(const h of world.humans){
    if(h.struckAt!==null)continue;
    const y=h.y+1.2;
    // Allow a low pass at the normal flight floor to clip a standing sprite.
    const bodyHit=Math.abs(y-playerPos.y)<=1.6&&Math.hypot(h.x-playerPos.x,h.z-playerPos.z)<=1;
    if(bodyHit||touchesWing(h.x,y,h.z,.6,2.6))world.strikeHuman(h);
  }
}

function setAttack(mode){
  stepCameraLag.set(0,0,0);
  loopRecovery=null;
  resetFlightTaps();
  releaseRemaining=0;
  attack=mode;attackTime=0;dashWings.visible=mode==='dash';
  const aiming=mode==='charge'||mode==='laser';
  $('#laser-button').setAttribute('aria-pressed',aiming);
  $('#laser-button').textContent=mode==='charge'?'溜め中':mode==='laser'?'照射中':'光線';
  $('#crosshair').hidden=!aiming;
  if(!aiming){beamOn=false;beam.visible=beamCore.visible=impactGlow.visible=false;}
}
function resetAttacks(){
  chaseVelocity.set(0,0,0);
  maneuver=null;
  setAttack('flight');companion.reset();$('#rain-button').setAttribute('aria-pressed','false');
  $('#rain-button').textContent='落雷 OFF';
}
function captureLaserCamera(){
  laserStartRotation.copy(camera.quaternion);
  laserStartOffset.copy(camera.position).sub(playerPos).applyQuaternion(laserAimRotation.copy(laserStartRotation).invert());
}
function blendLaserCamera(blend){
  camera.quaternion.slerpQuaternions(laserStartRotation,laserAimRotation,blend);
  camera.position.lerpVectors(laserStartOffset,laserOffset,blend).applyQuaternion(camera.quaternion).add(playerPos);
}
function finishLaser(){
  captureLaserCamera();
  firstReleaseFrame=attack==='charge'?Math.max(1,3-Math.floor(attackTime/chargeDuration*3)):0;
  releaseDuration=attack==='charge'?.16+.28*Math.min(1,attackTime/chargeDuration):fullReleaseDuration;
  setAttack('flight');
  releaseRemaining=releaseDuration;
}
function forwardPressed(){
  if(attack==='laser'||attack==='charge')finishLaser();
}
function useAttack(action){
  if(!active||paused||demo||lab)return;
  if(action==='rain'){
    const on=companion.toggle();$('#rain-button').setAttribute('aria-pressed',on);
    $('#rain-button').textContent=on?'落雷 ON':'落雷 OFF';return;
  }
  if(maneuver||attack==='dash'||attack==='return')return;
  if(action==='laser'){
    if(attack!=='flight'){finishLaser();return;}
    captureLaserCamera();
    sightYaw=yaw;sightPitch=-.37;velocity.set(0,0,0);speed=0;setAttack('charge');
    document.body.classList.remove('boosting');
    if(windGain)windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.15);
  }else if(action==='dash'){
    dashStart.copy(playerPos);dashDistance=0;
    dashDir.set(-Math.sin(yaw),0,-Math.cos(yaw));
    if(velocity.length()>3)dashDir.copy(velocity).normalize();
    spreadDashWings();velocity.set(0,0,0);setAttack('dash');
  }
}
function steerLaser(dt,turn,lift){
  attackTime+=dt;sightYaw+=turn*dt*1.55;sightPitch=clamp(sightPitch+lift*dt*1.15,-1.45,1.35);
  yaw=sightYaw;
  const halfWidthPerMeter=camera.aspect*Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  const distance=Math.max(10,3.8/halfWidthPerMeter);
  const shoulderOffset=Math.min(4.2,distance*halfWidthPerMeter*.33);
  // In portrait the caster occupies the left third, leaving room for the right hand and beam.
  laserOffset.set(camera.aspect<1?shoulderOffset:-shoulderOffset,1.2*Math.cos(sightPitch),distance-1.2*Math.sin(sightPitch));
  laserAimRotation.setFromEuler(laserAngles.set(sightPitch,yaw,0));
  const t=attack==='charge'?Math.min(1,attackTime/.28):1;
  const blend=t*t*(3-2*t);
  blendLaserCamera(blend);
  camera.updateMatrixWorld();
  avatar.position.copy(playerPos);avatar.rotation.set(0,yaw,0);
  const windup=attack==='charge'?Math.sin(Math.min(1,attackTime/chargeDuration)*Math.PI/2):.25;
  avatarPose.rotation.set(.18*windup,0,0);
  if(attack==='charge'&&attackTime>=chargeDuration)setAttack('laser');
  aimHit=castAim();
}
function updateDash(dt){
  attackTime+=dt;
  if(attack==='return'){
    const t=Math.min(1,attackTime/returnDuration),ease=t*t*(3-2*t);
    playerPos.lerpVectors(dashEnd,dashStart,ease);playerPos.y+=Math.sin(Math.PI*t)*3;
    avatarPose.rotation.set(Math.PI*2*t,0,0);
    if(t===1){playerPos.copy(dashStart);avatarPose.rotation.set(0,0,0);setAttack('flight');}
  }else{
    const travel=Math.min(95*dt,44-dashDistance),steps=Math.max(1,Math.ceil(travel/.5));
    avatarPose.rotation.set(-1.2,0,0);
    for(let i=0;i<steps;i++){
      const next=v3.copy(playerPos).addScaledVector(dashDir,travel/steps);
      const block=world.solidAt(next.x,next.y,next.z);
      if(block)dashDamage(block);
      if((block?.mat===1&&block.alive)||next.y<world.terrainHeight(next.x,next.z)+1||Math.abs(next.x)>550||Math.abs(next.z)>550||next.y>240||next.y<2){
        dashEnd.copy(playerPos);emit(next.x,next.y,next.z,0xffdd99,12,8,'spark');playImpact();setAttack('return');break;
      }
      playerPos.copy(next);dashDistance+=travel/steps;
      sweepDashWings();
    }
    if(attack==='dash'&&dashDistance>=43.999)setAttack('flight');
  }
  avatar.position.copy(playerPos);speed=attack==='dash'?95:0;
  updateChaseCamera(dt,17,5.6,7);
}
function turnInput(){
  return clamp((keys.has('KeyA')||keys.has('ArrowLeft')?1:0)-(keys.has('KeyD')||keys.has('ArrowRight')?1:0)-padInput.x,-1,1);
}
function liftInput(){
  return clamp((keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0)-padInput.y,-1,1);
}
function sampleFlightTap(time){
  if(!active||paused||demo||lab||attack!=='flight'||maneuver)return;
  const lift=liftInput(), turn=turnInput();
  const vertical=verticalTaps.sample(lift,time);
  const sideways=Math.abs(turn)>Math.abs(lift)+.1;
  if(!sideways && Math.abs(lift)>.5)horizontalTaps.reset();
  const horizontal=horizontalTaps.sample(sideways ? -turn : 0,time);
  if(!vertical&&!horizontal)return;
  const kind=vertical ? (vertical>0?'loop':'flip') : 'step';
  const side=kind==='step' ? horizontal : (turn>.15?1:-1);
  const next=new FlightManeuver(kind,playerPos,yaw,Math.hypot(velocity.x,velocity.z),side);
  if(next.kind==='loop'&&next.radius<.75){toast('宙返りする高さが足りません');return;}
  loopRecovery=null;stepCameraLag.set(0,0,0);
  if(next.kind==='loop'){
    next.entryCameraVelocity=chaseVelocity.clone();
    next.inverseView=camera.quaternion.clone().invert();
    next.cameraSpace=new THREE.Vector3();
  }else if(next.kind==='flip')next.cameraOffset=camera.position.clone().sub(playerPos);
  maneuver=next;releaseRemaining=0;avatarPose.rotation.set(0,0,0);
}
function updateManeuver(dt){
  const move=maneuver;
  const end=Math.min(move.duration,move.time+dt);
  const from=playerPos.clone(),next=new THREE.Vector3();
  // Sample the arc itself so low frame rates cannot skip terrain or a thin wall.
  const steps=Math.max(1,Math.ceil((end-move.time)*move.collisionSampleSpeed/.5));
  const start=move.time;
  let blocked=false;
  for(let i=1;i<=steps;i++){
    const time=THREE.MathUtils.lerp(start,end,i/steps);
    move.point(time/move.duration,next);
    const floor=Math.max(4,world.terrainHeight(next.x,next.z)+2.4);
    if(Math.abs(next.x)>550||Math.abs(next.z)>550||next.y<floor-.001||
      world.solidAt(next.x,next.y-.6,next.z)||world.solidAt(next.x,next.y+.6,next.z)){blocked=true;break;}
    playerPos.copy(next);move.time=time;
  }
  yaw=move.heading(move.progress);pitch=0;
  avatar.position.copy(playerPos);avatar.rotation.set(0,yaw,0);
  velocity.subVectors(playerPos,from).divideScalar(dt);speed=velocity.length();
  if(move.kind==='step'){
    stepCameraLag.addScaledVector(move.right,velocity.dot(move.right)*dt);
    avatarPose.rotation.z=-move.side*.55*Math.sin(Math.PI*move.progress);
  }
  if(move.kind==='loop')updateLoopCamera(move,dt);
  else updateChaseCamera(dt,14+move.entrySpeed*.035,5.6,5);
  if(blocked||end===move.duration){
    if(move.kind==='loop')loopRecovery={start:camera.quaternion.clone(),velocity:camera.position.clone().sub(previousCameraPosition).divideScalar(dt).clampLength(0,100),time:0};
    const exitSpeed=blocked?0:move.entrySpeed;
    velocity.set(-Math.sin(yaw)*exitSpeed,0,-Math.cos(yaw)*exitSpeed);speed=exitSpeed;
    maneuver=null;resetFlightTaps();
  }
}
function updateFlight(dt){
  if(maneuver){updateManeuver(dt);return;}
  const turn=turnInput(),lift=liftInput();
  if(attack==='laser'||attack==='charge'){steerLaser(dt,turn,lift);return;}
  if(attack==='dash'||attack==='return'){updateDash(dt);return;}
  yaw+=turn*dt*1.35;pitch=0;
  const boost=keys.has('ShiftLeft')||keys.has('ShiftRight'),move=keys.has('Space')||touchForward?1:0;
  forward.set(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  const desired=forward.clone().multiplyScalar(move*(boost?97:32));desired.y+=lift*(boost?48:24);
  velocity.lerp(desired,1-Math.exp(-dt*(move||lift?3.2:FLIGHT_DEBUG?6:2.3)));if(velocity.length()<.12&&desired.lengthSq()===0)velocity.set(0,0,0);
  const steps=Math.max(1,Math.ceil(velocity.length()*dt/.8));
  for(let step=0;step<steps;step++){
    playerPos.addScaledVector(velocity,dt/steps);
    for(const y of [-.6,.6]){if(world.solidAt(playerPos.x,playerPos.y+y,playerPos.z)){playerPos.addScaledVector(velocity,-dt/steps);velocity.multiplyScalar(-.2);break;}}
  }
  playerPos.x=clamp(playerPos.x,-550,550);playerPos.z=clamp(playerPos.z,-550,550);const floor=world.terrainHeight(playerPos.x,playerPos.z);
  playerPos.y=clamp(playerPos.y,Math.max(4,floor+2.4),240);
  speed=velocity.length();document.body.classList.toggle('boosting',boost&&move!==0);
  const hoverBlend=1-releaseRemaining/releaseDuration;
  avatar.position.copy(playerPos);avatar.position.y+=Math.sin(elapsed*2.8)*.12*hoverBlend;
  updateAvatarPose(dt,Math.hypot(velocity.x,velocity.z),velocity.y,turn);
  updateChaseCamera(dt,14+speed*.035,5.6,5);
  camera.fov=lerp(camera.fov,boost&&move?73:60,1-Math.exp(-dt*3));camera.updateProjectionMatrix();
  if(windGain){const muted=paused||!audioOn;windGain.gain.setTargetAtTime(muted?0:.012+speed*.00055,audioCtx.currentTime,.15);windFilter.frequency.setTargetAtTime(240+speed*15,audioCtx.currentTime,.1);}
}
function updateAttract(dt){
  const a=elapsed*.025,vx=Math.cos(a)*2.125,vz=-Math.sin(a)*3.625;playerPos.set(Math.sin(a)*85,69+Math.sin(a*.7)*9,145*Math.cos(a));yaw=Math.atan2(-vx,-vz);pitch=-.12;
  avatar.position.copy(playerPos);updateAvatarPose(dt,Math.hypot(vx,vz),Math.cos(a*.7)*.1575,.12);
  const cam=playerPos.clone().add(new THREE.Vector3(16,9,29));camera.position.lerp(cam,1-Math.exp(-dt*1.4));camera.lookAt(-7,22,-19);
}
function updateDemo(dt){
  const u=elapsed*32/demoLength%1;
  if(u<dt*32/demoLength)resetCourse();
  demoRoute.getPointAt(u,playerPos);demoRoute.getTangentAt(u,demoTangent);
  demoRoute.getTangentAt((u+.12*32/demoLength)%1,demoNext);
  const turnAngle=Math.atan2(demoTangent.z*demoNext.x-demoTangent.x*demoNext.z,demoTangent.x*demoNext.x+demoTangent.z*demoNext.z);
  yaw=Math.atan2(-demoTangent.x,-demoTangent.z);pitch=0;speed=32;
  velocity.copy(demoTangent).multiplyScalar(speed);forward.copy(demoTangent);
  avatar.position.copy(playerPos);updateAvatarPose(dt,Math.hypot(velocity.x,velocity.z),velocity.y,clamp(turnAngle/(.12*1.35),-1,1));
  updateChaseCamera(dt,15,5.6,5);
  if(!FLIGHT_DEBUG){
    const building=world.buildings[Math.floor(elapsed/3)%14];
    const target=building.blocks.map(id=>world.blocks[id]).find(b=>b.alive&&b.mat===0);
    if(target){aim.set(target.x,target.y,target.z);aimHit={type:'block',block:target};}
    else{aim.set(building.x,world.terrainHeight(building.x,building.z),building.z);aimHit={type:'terrain'};}
  }
}
function updateBeam(dt){
  beamOn=attack==='laser'&&active&&!paused&&!demo;
  document.body.classList.toggle('firing',beamOn);beam.visible=beamCore.visible=beamOn;impactGlow.visible=beamOn&&!!aimHit;
  if(!beamOn){fireClock=0;if(beamGain)beamGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);return;}
  const from=heroine.handPosition(beamOrigin);
  world.strikeAlongBeam(from,aim);
  beamBetween(beam,from,aim);beamBetween(beamCore,from,aim);impactGlow.position.copy(aim);impactGlow.scale.setScalar(2+Math.sin(elapsed*45)*.4);
  if(beamGain)beamGain.gain.setTargetAtTime(audioOn?.025:0,audioCtx.currentTime,.1);
  fireClock-=dt;if(fireClock<=0&&aimHit&&aimHit.type!=='sea'){fireClock=.12;world.impact(aim.x,aim.y,aim.z,5.8,53);}
}
function updateParticles(dt){
  for(let i=particleData.length-1;i>=0;i--){const p=particleData[i];p.life-=dt;if(p.life<=0){particleData.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.kind==='dust'){p.vy*=Math.exp(-dt*3);p.vx*=Math.exp(-dt*2);p.vz*=Math.exp(-dt*2);}else if(p.kind!=='fire'&&p.kind!=='ash')p.vy-=dt*15;
    const ground=world.terrainHeight(p.x,p.z);if(p.y<ground+.12){p.y=ground+.12;p.vy=Math.abs(p.vy)*.18;p.vx*=.8;p.vz*=.8;}
    temp.position.set(p.x,p.y,p.z);temp.rotation.set(p.rotation+elapsed,p.rotation,elapsed*.5);const size=p.size*Math.min(1,p.life*2);
    if(p.kind==='tile')temp.scale.set(size,.22*size,.8*size);
    else if(p.kind==='splinter')temp.scale.set(.25*size,1.7*size,.3*size);
    else if(p.kind==='dust')temp.scale.setScalar(size*(1.5-p.life*.25));
    else temp.scale.setScalar(size);temp.updateMatrix();particles.setMatrixAt(i,temp.matrix);particles.setColorAt(i,new THREE.Color(p.color));
  }
  particles.count=particleData.length;if(particleData.length){particles.instanceMatrix.needsUpdate=true;particles.instanceColor.needsUpdate=true;}
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;const s=(1-e.life/e.max)*e.r*2;e.mesh.scale.setScalar(s);e.mesh.material.opacity=e.life/e.max*.6;if(e.life<=0){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1);}}
}
function updateWorldViews(dt){
  for(const view of humans){
    const {sprite,data:h}=view;
    if(!sprite.visible)continue;
    sprite.position.set(h.x,h.y+.9+(h.panic?Math.abs(Math.sin(h.phase))*.17:0),h.z);
    if(h.struckAt!==null){
      const age=world.tickTime-h.struckAt;
      sprite.material.color.setHex(0x16121d);
      sprite.material.rotation=0;
      if(age>=.18&&!view.burst){
        view.burst=true;
        emit(h.x,h.y,h.z,0x312a38,10,0,'ash');
      }
      sprite.material.opacity=clamp(1-(age-.18)/.30,0,1);
      sprite.visible=age<.48;
    }else{
      sprite.material.map=spriteTextures[Math.floor(h.phase/Math.PI)%2];
      sprite.material.rotation=h.panic?Math.sin(h.phase)*.06:0;
    }
  }
  for(const v of defenderViews){v.group.visible=v.data.alive;if(v.data.ring)v.data.ring.rotation.z+=dt*.7;if(v.data.arm)v.data.arm.rotation.x=lerp(v.data.arm.rotation.x,v.data.cooldown>5.5?.5:-.55,dt*3);}
  for(const t of treeViews){if(t.alive&&world.terrainHeight(t.x,t.z)<t.y){t.alive=false;temp.scale.setScalar(0);temp.updateMatrix();treeTrunks.setMatrixAt(t.id,temp.matrix);treeLeaves.setMatrixAt(t.id*2,temp.matrix);treeLeaves.setMatrixAt(t.id*2+1,temp.matrix);treeTrunks.instanceMatrix.needsUpdate=true;treeLeaves.instanceMatrix.needsUpdate=true;emit(t.x,t.y+4,t.z,0x526947,6,8);}}
  if(world.burning.size){let n=0;for(const id of world.burning){if(n++>110)break;const b=world.blocks[id];if(rng()<dt*4)emit(b.x+(rng()-.5)*2,b.y+1,b.z+(rng()-.5)*2,rng()>.4?0xf0a34f:0xe7c775,1,1,'fire');if(rng()<dt*.6)emit(b.x,b.y+3,b.z,0x6d6b60,1,1,'fire');}}
  const arr=windLines.geometry.attributes.position.array;windLines.material.opacity=speed>55?.25:0;
  if(speed>55){for(let i=0;i<42;i++){const angle=i*2.4,t=(elapsed*speed*.6+i*3)%40,r=5+(i%6)*3;const offset=new THREE.Vector3(Math.sin(angle)*r,Math.cos(angle)*r,t-25).applyQuaternion(camera.quaternion).add(camera.position);const end=offset.clone().addScaledVector(forward,3);arr.set([offset.x,offset.y,offset.z,end.x,end.y,end.z],i*6);}windLines.geometry.attributes.position.needsUpdate=true;}
}

function drawMap(){
  const c=$('#minimap'),ctx=c.getContext('2d');ctx.clearRect(0,0,180,150);
  const sx=x=>90+x*.39,sz=z=>75+z*.35;
  for(let z=0;z<100;z+=2)for(let x=0;x<100;x+=2){const h=world.heights[z*100+x];if(h){ctx.fillStyle=`rgba(156,175,134,${.12+h*.022})`;ctx.fillRect(sx(x*4-200),sz(z*4-200),3.3,3);}}
  ctx.strokeStyle='#c6ccab22';ctx.lineWidth=.5;ctx.beginPath();ctx.moveTo(90,9);ctx.lineTo(90,143);ctx.moveTo(18,75);ctx.lineTo(162,75);ctx.stroke();
  for(const b of world.buildings.slice(0,16)){ctx.fillStyle='#dbd0ac77';ctx.fillRect(sx(b.x)-2,sz(b.z)-2,4,4);}
  for(const d of world.defenders)if(d.alive){ctx.fillStyle=d.type==='mage'?'#c2a1dc':'#e5a17c';ctx.beginPath();ctx.arc(sx(d.x),sz(d.z),1.8,0,Math.PI*2);ctx.fill();}
  const px=clamp(sx(playerPos.x),5,175),pz=clamp(sz(playerPos.z),7,143);ctx.save();ctx.translate(px,pz);ctx.rotate(-yaw);ctx.fillStyle='#f3dea4';ctx.beginPath();ctx.moveTo(0,-5);ctx.lineTo(-3.5,4);ctx.lineTo(0,2);ctx.lineTo(3.5,4);ctx.closePath();ctx.fill();ctx.restore();ctx.fillStyle='#becbb57a';ctx.font='8px monospace';ctx.fillText('N',88,10);
}
function updateHud(){
  const stats=world.getStats();$('#destroyed').textContent=stats.destroyed.toLocaleString();$('#burning').textContent=stats.burning;$('#panicking').textContent=stats.panicking;
  $('#speed').textContent=Math.round(speed*3.6);$('#altitude').textContent=Math.round(playerPos.y-world.terrainHeight(playerPos.x,playerPos.z));$('#health-label').textContent=Math.round(health);$('#health-bar').style.width=health+'%';
  $('#flight-state').textContent=maneuver?({loop:'LOOP',flip:'FLIP TURN',step:'SIDE STEP'}[maneuver.kind]):speed>55?'HYPER FLIGHT':speed<1?'HOVERING':'CRUISING';$('#fps').textContent=Math.round(fps)+' FPS';
  $('#target-label').textContent=aimHit?.block?MATERIALS[aimHit.block.mat].name+' / '+world.buildings[aimHit.block.building].name:aimHit?.type==='terrain'?'地表 / 破壊可能':'';drawMap();
}
function loop(now){
  requestAnimationFrame(loop);const rawDt=lastHudTime?(now-lastHudTime)/1000:.016,dt=Math.min(.08,rawDt);lastHudTime=now;frameCount++;fps=lerp(fps,1/Math.max(rawDt,.001),.08);
  if(!paused){
    elapsed+=dt;hitClock=Math.max(0,hitClock-dt);if(active){lastPosition.copy(playerPos);if(demo)updateDemo(dt);else{
      const previousYaw=yaw;previousCameraPosition.copy(camera.position);updateFlight(dt);
      chaseVelocity.subVectors(camera.position,previousCameraPosition).divideScalar(dt).clampLength(0,100);
      companion.update(dt,lastPosition,playerPos,previousYaw,yaw,camera,world);
    }if(FLIGHT_DEBUG)updateCourse(lastPosition,playerPos);}else if(!lab)updateAttract(dt);
    if(!lab){
      heroine.update(dt,camera,avatarPose,attack,attackTime,chargeDuration,returnDuration,active?Math.hypot(velocity.x,velocity.z):3,
        releaseRemaining>0?firstReleaseFrame+Math.floor((1-releaseRemaining/releaseDuration)*(4-firstReleaseFrame)):-1,maneuver);
      if(attack==='dash'){
        // Flutter the feather tips while the damaging leading edge holds its trajectory.
        const positions=dashWings.children[0].geometry.attributes.position;
        for(const {index,u,trailing} of dashWings.userData.trailingEdges){
          const ripple=.13*Math.sin(attackTime*20-u*5);
          positions.setY(index,wingHeight(u)+trailing*(ripple-.19));
        }
        positions.needsUpdate=true;
        heroine.backPosition(dashWings.position);
        dashWings.position.addScaledVector(wingUp,-wingHeight(0)*dashWings.scale.y);
      }
    }
    if(!FLIGHT_DEBUG&&!demo)aimHit=castAim();updateBeam(dt);
    simClock+=dt;if(simClock>=.05){world.tick(simClock,active?playerPos:null,FLIGHT_DEBUG?velocity:null, siege ? siegeDefender() : 'all');simClock=0;processEvents();updateBlocks();if(lab)updateLabResult();if(world.terrainDirty)buildTerrain();}
    if(active && siege){updateProjectiles(dt);health=Math.min(100,health+dt*1.1);}
    updateParticles(dt);updateWorldViews(dt);hudClock+=dt;if(hudClock>.15){hudClock=0;updateHud();}
    if(toastClock>0){toastClock-=dt;if(toastClock<=0)$('#toast').classList.remove('visible');}
  }
  renderer.render(scene,camera);
  if(active&&!demo&&!lab)companion.rift.draw(renderer,camera);
}

function siegeDefender(){
  if(courseStage==='gate')return 'catapult';
  if(courseStage==='tower')return 'mage';
  return 'none';
}
function startCastle(){
  castle=true;
  rebuildWorld(false);
  begin();
  $('#course-name').textContent='白鷺城';
}
function startSiege(){
  siege=true;
  document.body.classList.add('siege');
  rebuildWorld(false);
  begin();
  $('#mode-label').textContent='迎撃戦';
}
function begin(asDemo=false){chaseVelocity.set(0,0,0);loopRecovery=null;maneuver=null;releaseRemaining=0;heroine.reset();active=true;demo=asDemo;paused=false;elapsed=0;resetControls();avatar.rotation.set(0,0,0);avatarPose.rotation.set(0,0,0);$('#intro').hidden=true;$('#region').hidden=true;$('#hud').hidden=false;$('#demo-badge').hidden=!demo;$('#pause-screen').hidden=true;$('#mode-label').textContent=demo?'AUTO FLIGHT':'FREE FLIGHT';document.body.classList.add('playing');$('#touch-controls').hidden=demo;resetCourse();playerPos.copy(castle ? castleStart : startPosition);velocity.set(0,0,0);speed=0;yaw=0;pitch=FLIGHT_DEBUG?0:-.08;camera.position.copy(playerPos).add(new THREE.Vector3(0,6,17));}
function setPaused(value){if(!active)return;paused=value;resetControls();beam.visible=beamCore.visible=impactGlow.visible=false;$('#touch-controls').hidden=paused||demo;$('#pause-screen').hidden=!paused;$('#pause').textContent=paused?'▷':'Ⅱ';$('#pause').setAttribute('aria-label',paused?'飛行を再開':'一時停止');if(windGain)windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);if(beamGain)beamGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}
function openGuide(){pausedBeforeGuide=paused;resetControls();paused=true;$('#touch-controls').hidden=true;beam.visible=beamCore.visible=impactGlow.visible=false;$('#guide').showModal();if(windGain)windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);if(beamGain)beamGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}
function closeGuide(){$('#guide').close();paused=pausedBeforeGuide;$('#touch-controls').hidden=!active||paused||demo;}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);if(lab)frameLab();}
function frameLab(){
  const top=document.querySelector('header').getBoundingClientRect().bottom;
  const bottom=$('#collapse-panel').getBoundingClientRect().top;
  const fraction=clamp((bottom-top)/innerHeight,.25,.95);
  const tangent=Math.tan(THREE.MathUtils.degToRad(camera.fov/2));
  const distance=Math.max(21.5/(fraction*tangent),21/(camera.aspect*tangent));
  const target=new THREE.Vector3(westTower.x+9,32,westTower.z);
  camera.position.copy(target).addScaledVector(v3.set(-.06,.58,-1).normalize(),distance);
  camera.lookAt(target);
  camera.setViewOffset(innerWidth,innerHeight,0,(innerHeight-top-bottom)/2,innerWidth,innerHeight);
}
const labIdle='破損の目安　瓦 2m ／ 木 6m ／ 石 12m';
function setupLab(roof){
  if($('#guide').open)$('#guide').close();
  castle=false;siege=false;$('#course-name').textContent='城門コース';document.body.classList.remove('siege');
  lab=true;catchRoof=roof;labDropped=false;active=false;demo=false;paused=false;
  document.body.classList.remove('playing','boosting');document.body.classList.add('collapse-lab');
  for(const id of ['intro','region','hud','touch-controls','pause-screen'])$('#'+id).hidden=true;
  $('#collapse-panel').hidden=false;avatar.visible=false;
  if(windGain)windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);
  $('#lab-roof').setAttribute('aria-pressed',roof);$('#lab-square').setAttribute('aria-pressed',!roof);
  $('#lab-result').textContent=labIdle;$('#lab-break').textContent='塔を折る';
  rebuildWorld(false);camera.fov=53;frameLab();
}
function breakTower(){
  if(labDropped)setupLab(catchRoof);
  labDropped=true;world.notchTower();$('#lab-break').textContent='もう一度';
  $('#lab-result').textContent='崩落中…';
}
function updateLabResult(){
  if(!labDropped||world.collapse.moving.size)return;
  const [wood,stone,tile]=world.collapse.shattered;
  const label='最大落下 '+world.collapse.maxDrop.toFixed(1)+'m　砕けた数　瓦 '+tile+' ／ 木 '+wood+' ／ 石 '+stone;
  if($('#lab-result').textContent!==label)$('#lab-result').textContent=label;
}
function leaveLab(){
  lab=false;document.body.classList.remove('collapse-lab');$('#collapse-panel').hidden=true;
  avatar.visible=true;camera.clearViewOffset();camera.fov=60;resize();rebuildWorld(false);begin();
}
$('#open-lab').onclick=$('#guide-lab').onclick=()=>setupLab(true);
$('#lab-roof').onclick=()=>setupLab(true);$('#lab-square').onclick=()=>setupLab(false);
$('#lab-break').onclick=breakTower;$('#lab-exit').onclick=leaveLab;
function initAudio(){
  if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate);const a=buf.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1);const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;windFilter=audioCtx.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=400;windGain=audioCtx.createGain();windGain.gain.value=0;src.connect(windFilter).connect(windGain).connect(audioCtx.destination);src.start();const tone=audioCtx.createOscillator();tone.frequency.value=76;tone.type='sawtooth';const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;beamGain=audioCtx.createGain();beamGain.gain.value=0;tone.connect(filter).connect(beamGain).connect(audioCtx.destination);tone.start();}audioCtx.resume();
}
$('#start-castle').onclick=startCastle;
$('#start-siege').onclick=startSiege;
$('#start').onclick=()=>begin();$('#demo').onclick=()=>begin(true);$('#take-control').onclick=()=>{demo=false;resetControls();$('#demo-badge').hidden=true;$('#touch-controls').hidden=false;$('#mode-label').textContent='FREE FLIGHT';pitch=FLIGHT_DEBUG?0:-.08;toast('左パッドで上下・旋回 / 右ボタンを押して前進');};$('#reset').onclick=()=>rebuildWorld();$('#pause').onclick=()=>setPaused(!paused);$('#resume').onclick=()=>setPaused(false);$('#help').onclick=openGuide;$('#close-guide').onclick=closeGuide;$('#guide-play').onclick=closeGuide;$('#guide').addEventListener('cancel',()=>{paused=pausedBeforeGuide;$('#touch-controls').hidden=!active||paused||demo;});$('#god').onclick=()=>setCharacter(false);$('#demon').onclick=()=>setCharacter(true);
$('#audio').onclick=()=>{initAudio();audioOn=!audioOn;$('#audio').setAttribute('aria-pressed',audioOn);$('#audio').setAttribute('aria-label',audioOn?'サウンドをオフ':'サウンドをオン');$('.mute-line').hidden=audioOn;if(!audioOn){windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);beamGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}};
window.addEventListener('resize',resize);window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();
  if(e.repeat)return;if(lab){if(e.code==='Escape')leaveLab();if(e.code==='KeyR')setupLab(catchRoof);return;}if(e.code==='KeyH'){if($('#guide').open)closeGuide();else openGuide();return;}
  if($('#guide').open)return;if(e.code==='Escape'){setPaused(!paused);return;}if(e.code==='KeyR'){rebuildWorld();return;}
  if(!active||paused||demo)return;
  const action={Digit1:'laser',Digit2:'dash',Digit3:'rain'}[e.code];
  if(action){useAttack(action);return;}
  if(e.code==='Space')forwardPressed();
  keys.add(e.code);
  if(flightKeys.has(e.code))sampleFlightTap(e.timeStamp);
});window.addEventListener('keyup',e=>{keys.delete(e.code);if(flightKeys.has(e.code))sampleFlightTap(e.timeStamp);});window.addEventListener('blur',()=>{resetControls();if(active&&!demo)setPaused(true);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(FLIGHT_DEBUG||!active||paused||demo)return;canvas.setPointerCapture(e.pointerId);if(e.button===0)pointerDown=true;if(e.button===2)rightDown=true;});canvas.addEventListener('pointerup',e=>{if(e.button===0)pointerDown=false;if(e.button===2)rightDown=false;});canvas.addEventListener('pointercancel',()=>{pointerDown=rightDown=false;});canvas.addEventListener('pointermove',e=>{if(FLIGHT_DEBUG||!active||paused||demo||!(pointerDown||rightDown))return;yaw-=e.movementX*.003;pitch=clamp(pitch-e.movementY*.0024,-1.18,1.18);});
for(const b of document.querySelectorAll('[data-key]')){
  b.addEventListener('contextmenu',e=>e.preventDefault());
  b.addEventListener('pointerdown',e=>{if(!active||paused||demo)return;e.preventDefault();b.setPointerCapture(e.pointerId);forwardPressed();touchForward=true;b.classList.add('pressed');b.setAttribute('aria-pressed','true');});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])b.addEventListener(event,()=>{touchForward=false;b.classList.remove('pressed');b.setAttribute('aria-pressed','false');});
}
for(const b of document.querySelectorAll('[data-attack]'))b.onclick=()=>useAttack(b.dataset.attack);
const pad=$('#flight-pad');
function movePad(e){
  if(e.pointerId!==padInput.pointerId)return;
  const rect=pad.getBoundingClientRect(),radius=rect.width*.35;
  let x=(e.clientX-rect.left-rect.width/2)/radius,y=(e.clientY-rect.top-rect.height/2)/radius;
  const length=Math.hypot(x,y),magnitude=clamp((length-.12)/.88,0,1);
  padInput.x=length?x/length*magnitude:0;padInput.y=length?y/length*magnitude:0;
  sampleFlightTap(e.timeStamp);
  $('#pad-knob').style.transform=`translate(calc(-50% + ${padInput.x*radius}px), calc(-50% + ${padInput.y*radius}px))`;
}
pad.addEventListener('contextmenu',e=>e.preventDefault());
pad.addEventListener('pointerdown',e=>{if(!active||paused||demo||padInput.pointerId!==null)return;e.preventDefault();padInput.pointerId=e.pointerId;pad.setPointerCapture(e.pointerId);pad.classList.add('engaged');movePad(e);});
pad.addEventListener('pointermove',e=>{
  // A slow render frame can group the neutral and second stroke in one event.
  const samples=e.getCoalescedEvents?.();
  if(samples?.length){for(const sample of samples)movePad(sample);}
  else movePad(e);
});
for(const event of ['pointerup','pointercancel','lostpointercapture'])pad.addEventListener(event,e=>{if(e.pointerId!==padInput.pointerId)return;padInput.x=padInput.y=0;padInput.pointerId=null;if(event==='pointerup')sampleFlightTap(e.timeStamp);else resetFlightTaps();pad.classList.remove('engaged');$('#pad-knob').style.transform='translate(-50%, -50%)';});
try{init();const q=new URLSearchParams(location.search);if(q.has('collapse'))setupLab(true);else if(q.has('demo'))begin(true);else if(q.has('siege'))startSiege();else if(q.has('castle'))startCastle();
  if(q.has('test'))window.__aether={get world(){return world;},get renderer(){return renderer;},get state(){return {active,paused,demo,flightDebug:FLIGHT_DEBUG,beamOn,attack,maneuver:maneuver?.kind??null,maneuverProgress:maneuver?.progress??0,cameraPosition:camera.position.toArray(),cameraRotation:camera.quaternion.toArray(),screenY:(1-playerPos.clone().project(camera).y)/2,hero:{motion:heroine.motion,frame:heroine.frame,screenX:(playerPos.clone().project(camera).x+1)/2,beamOrigin:beamOrigin.toArray()},storm:{enabled:companion.enabled,visible:companion.visible&&companion.body.visible,phase:companion.phase,pass:companion.pass,count:companion.count,last:companion.lastStrike,flash:companion.bolt.visible,rift:companion.rift.time,position:companion.socket.toArray()},aim:aim.toArray(),yaw,pitch,courseStage,attitude:{pitch:avatarPose.rotation.x,bank:avatarPose.rotation.z,heading:avatar.rotation.y},pad:{x:padInput.x,y:padInput.y},health,speed,velocity:velocity.toArray(),position:playerPos.toArray(),terrainVisible:scene.children.includes(terrain),defenderViews:defenderViews.length,projectiles:projectiles.length,stats:world.getStats(),fps};},impact:(x,y,z,r=6,p=90)=>world.impact(x,y,z,r,p),aimAt:(x,y,z)=>{const d=new THREE.Vector3(x,y,z).sub(playerPos).normalize();yaw=Math.atan2(-d.x,-d.z);pitch=clamp(Math.asin(d.y)+.28,-1.18,1.18);},teleport:(x,y,z)=>{playerPos.set(x,y,z);velocity.set(0,0,0);camera.position.set(x,y+6,z+16);},get projectiles(){return projectiles;}};
}catch(error){fatal(error);}
