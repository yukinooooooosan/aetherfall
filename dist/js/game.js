import * as THREE from '../vendor/three.module.js';
import { World, MATERIALS, BLOCK, random } from './model.js';

const $=s=>document.querySelector(s),clamp=THREE.MathUtils.clamp,lerp=THREE.MathUtils.lerp;
const canvas=$('#world'),keys=new Set(),rng=random(829);
let renderer,scene,camera,world,terrain,blockMesh,forest,treeTrunks,treeLeaves,humans=[],defenderViews=[],treeViews=[],effects=[],projectiles=[];
let active=false,paused=false,demo=false,demon=false,beamOn=false,pointerDown=false,rightDown=false,audioOn=false;
let pausedBeforeGuide=false;
let elapsed=0,fireClock=0,simClock=0,hudClock=0,toastClock=0,hitClock=0,frameCount=0,fps=60,lastHudTime=0;
let yaw=0,pitch=-.08,health=100,velocity=new THREE.Vector3(),speed=0,aim=new THREE.Vector3(),aimHit=null;
const playerPos=new THREE.Vector3(0,63,142),forward=new THREE.Vector3(),temp=new THREE.Object3D(),v3=new THREE.Vector3(),ray=new THREE.Raycaster();
let avatar,leftWing,rightWing,halo,cape,beam,beamCore,impactGlow,windLines,audioCtx,windGain,beamGain,windFilter;
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
  const sea=mesh(new THREE.PlaneGeometry(12000,12000),material(0x87a6a4,{transparent:true,opacity:.97}));sea.rotation.x=-Math.PI/2;sea.position.y=-.6;
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
  createWind();rebuildWorld(false);resize();
  camera.position.copy(playerPos).add(new THREE.Vector3(17,15,29));camera.lookAt(0,24,-20);
  $('#loading').textContent='WORLD READY  /  '+world.initialBlocks.toLocaleString()+' BLOCKS';
  requestAnimationFrame(loop);
}

function rebuildWorld(notify=true){
  if(terrain){scene.remove(terrain);terrain.geometry.dispose();terrain.material.dispose();terrain=null;}
  if(blockMesh){scene.remove(blockMesh);blockMesh.geometry.dispose();blockMesh.material.dispose();}
  for(const h of humans){scene.remove(h.sprite);h.sprite.material.dispose();}
  for(const d of defenderViews){scene.remove(d.group);d.group.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  if(forest){scene.remove(forest);forest.traverse(o=>{if(o.isMesh){o.geometry.dispose();o.material.dispose();}});}
  for(const p of projectiles){scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();}
  for(const e of effects){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();}
  effects=[];projectiles=[];particleData.length=0;humans=[];defenderViews=[];treeViews=[];
  world=new World();buildTerrain();buildBlocks();buildHumans();buildDefenders();buildTrees();
  health=100;playerPos.set(0,63,142);velocity.set(0,0,0);yaw=0;pitch=-.08;speed=0;fireClock=0;hitClock=0;keys.clear();pointerDown=false;beamOn=false;
  if(notify)toast('世界を再創造しました');
}

function buildTerrain(){
  const pos=[],colors=[],indices=[];const color=new THREE.Color();
  function face(points,col){const start=pos.length/3;color.setHex(col);for(const p of points){pos.push(...p);colors.push(color.r,color.g,color.b);}indices.push(start,start+1,start+2,start,start+2,start+3);}
  for(let z=0;z<world.size;z++)for(let x=0;x<world.size;x++){
    const i=z*100+x,h=world.heights[i];if(!h)continue;const x0=x*4-200,z0=z*4-200,x1=x0+4,z1=z0+4,y=h*4;
    const noise=((x*137+z*331)%11)/11;let c=new THREE.Color().setHSL(.25+noise*.025,.21+noise*.08,.35+noise*.06).getHex();
    if(h>9)c=new THREE.Color().setHSL(.2,.10,.48+noise*.12).getHex();
    if(h===1)c=0xb4ab7a;
    if(Math.abs(x0+2)<5&&z0>-65&&z0<95||Math.abs(z0-16)<3&&Math.abs(x0)<66)c=0xa99f7e;
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
function buildBlocks(){
  blockMesh=new THREE.InstancedMesh(new THREE.BoxGeometry(1.94,1.94,1.94),material(0xffffff),world.blocks.length);blockMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);blockMesh.frustumCulled=false;
  const color=new THREE.Color();for(const b of world.blocks){temp.position.set(b.x,b.y,b.z);temp.scale.setScalar(1);temp.rotation.set(0,0,0);temp.updateMatrix();blockMesh.setMatrixAt(b.id,temp.matrix);color.setHex(MATERIALS[b.mat].color).multiplyScalar(.84+((b.id*137)%17)/60);blockMesh.setColorAt(b.id,color);}
  blockMesh.instanceMatrix.needsUpdate=true;blockMesh.instanceColor.needsUpdate=true;scene.add(blockMesh);
}
function updateBlocks(){
  for(const id of world.changed){const b=world.blocks[id];if(!b.alive){temp.position.set(b.x,-1000,b.z);temp.scale.setScalar(0);temp.updateMatrix();blockMesh.setMatrixAt(id,temp.matrix);}else if(b.burn){blockMesh.setColorAt(id,new THREE.Color(0x55341e));}}
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
  const a=new THREE.Group();
  const body=box(.52,.8,.3,0xe0d8c1,a);body.position.y=.1;body.rotation.x=-.25;
  const head=mesh(new THREE.IcosahedronGeometry(.22,0),material(0xf4d5ad),a);head.position.set(0,.72,0);
  const hair=mesh(new THREE.IcosahedronGeometry(.235,0),material(0xe0c27b),a);hair.position.set(0,.81,.05);hair.scale.set(1,.8,1);
  for(const x of [-.17,.17]){const leg=box(.16,.63,.16,0x515e60,a);leg.position.set(x,-.53,.2);leg.rotation.x=-.45;const boot=box(.19,.25,.24,0xb4986a,a);boot.position.set(x,-.87,.08);const arm=box(.16,.65,.17,0xdfc6a3,a);arm.position.set(x*2,.14,-.08);arm.rotation.z=-x*2;arm.rotation.x=-.3;}
  cape=mesh(new THREE.ConeGeometry(.52,1.4,5,1,true),material(0x456c69,{side:THREE.DoubleSide}),a);cape.position.set(0,-.15,.45);cape.rotation.x=.35;
  halo=mesh(new THREE.TorusGeometry(.32,.025,4,20),new THREE.MeshBasicMaterial({color:0xf5d491}),a);halo.rotation.x=Math.PI/2;halo.position.y=1.2;
  const wing=(side)=>{const root=new THREE.Group();root.position.set(side*.2,.4,.12);for(let i=0;i<6;i++){
    const g=new THREE.BufferGeometry(),x1=side*(.25+i*.26),x2=side*(.75+i*.23),y=.3+i*.07;
    g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,x1,y,.12,x2,-.5-i*.14,.3,x1*.8,-.2-i*.09,.25],3));g.setIndex([0,1,2,0,2,3]);g.computeVertexNormals();mesh(g,material(i%2?0xf3e4c6:0xe1d3b6,{side:THREE.DoubleSide}),root);
  }a.add(root);return root;};leftWing=wing(-1);rightWing=wing(1);return a;
}
function setCharacter(dark){demon=dark;cape.material.color.setHex(dark?0x622d52:0x456c69);halo.material.color.setHex(dark?0xe9a0dc:0xf5d491);beamMaterial.color.setHex(dark?0xa56de0:0xffd388);beamCoreMaterial.color.setHex(dark?0xf0c7ff:0xfff5cb);for(const wing of [leftWing,rightWing])wing.children.forEach((m,i)=>m.material.color.setHex(dark?i%2?0x453550:0x302c44:i%2?0xf3e4c6:0xe1d3b6));$('#god').setAttribute('aria-pressed',!dark);$('#demon').setAttribute('aria-pressed',dark);toast(dark?'闇の悪魔に姿を変えました':'光の神に姿を変えました');}
function createWind(){const arr=new Float32Array(42*2*3);windLines=new THREE.LineSegments(new THREE.BufferGeometry(),new THREE.LineBasicMaterial({color:0xf7edce,transparent:true,opacity:0}));windLines.geometry.setAttribute('position',new THREE.BufferAttribute(arr,3));scene.add(windLines);}

function castAim(){
  ray.setFromCamera(new THREE.Vector2(0,0),camera);const o=ray.ray.origin,d=ray.ray.direction;
  for(let t=8;t<650;t+=1.1){const x=o.x+d.x*t,y=o.y+d.y*t,z=o.z+d.z*t;
    const id=world.grid.get(`${Math.round(x/2)},${Math.floor(y/2)},${Math.round(z/2)}`);
    if(id!==undefined&&world.blocks[id].alive){const b=world.blocks[id];if(Math.abs(x-b.x)<1&&Math.abs(y-b.y)<1&&Math.abs(z-b.z)<1){aim.set(x,y,z);return {type:'block',block:b};}}
    if(y<=world.terrainHeight(x,z)&&world.terrainHeight(x,z)>0){aim.set(x,y,z);return {type:'terrain'};}
    if(y<0){aim.set(x,0,z);return {type:'sea'};}
  }aim.copy(o).addScaledVector(d,420);return null;
}
function beamBetween(m,from,to){const d=v3.copy(to).sub(from),length=d.length();m.position.copy(from).addScaledVector(d,.5);m.scale.set(1,length,1);m.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),d.normalize());}
function emit(x,y,z,color,amount=1,force=7,kind='debris'){
  for(let i=0;i<amount;i++){
    if(particleData.length>=particleCapacity)particleData.shift();
    const f=force*(.3+rng());particleData.push({x,y,z,vx:(rng()-.5)*f,vy:kind==='fire'?4+rng()*5:rng()*f,vz:(rng()-.5)*f,life:kind==='fire'?.6+rng()*.6:1.2+rng()*1.2,max:2,size:kind==='fire'?.35+rng()*.65:.2+rng()*.6,color,kind,rotation:rng()*6});
  }
}
function impactRing(x,y,z,r){const m=mesh(new THREE.RingGeometry(.8,1,32),new THREE.MeshBasicMaterial({color:demon?0xd19deb:0xffe7a9,transparent:true,opacity:.8,side:THREE.DoubleSide,depthWrite:false}));m.rotation.x=-Math.PI/2;m.position.set(x,Math.max(y+.2,world.terrainHeight(x,z)+.15),z);effects.push({mesh:m,life:.55,max:.55,r});}
function playImpact(){if(!audioCtx||!audioOn)return;const osc=audioCtx.createOscillator(),g=audioCtx.createGain();osc.type='sine';osc.frequency.setValueAtTime(120,audioCtx.currentTime);osc.frequency.exponentialRampToValueAtTime(35,audioCtx.currentTime+.18);g.gain.setValueAtTime(.09,audioCtx.currentTime);g.gain.exponentialRampToValueAtTime(.001,audioCtx.currentTime+.23);osc.connect(g).connect(audioCtx.destination);osc.start();osc.stop(audioCtx.currentTime+.25);}
function shoot(e){
  const mage=e.kind==='mage',mat=new THREE.MeshBasicMaterial({color:mage?0xd4a0f5:0x827766});
  const m=mesh(mage?new THREE.IcosahedronGeometry(.65,1):new THREE.IcosahedronGeometry(1,0),mat);m.position.set(e.x,e.y,e.z);
  const p={mesh:m,kind:e.kind,velocity:new THREE.Vector3(),age:0,trail:0};
  if(mage)p.velocity.set(e.target.x-e.x,e.target.y-e.y,e.target.z-e.z).normalize().multiplyScalar(26);
  else{const distance=Math.hypot(e.target.x-e.x,e.target.z-e.z),t=clamp(distance/28,1.8,4.2);p.velocity.set((e.target.x-e.x)/t,(e.target.y-e.y+6*t*t)/t,(e.target.z-e.z)/t);}
  projectiles.push(p);
  if(active&&!demo&&elapsed>4&&rng()<.23)toast(mage?'魔導師が追尾弾を放った':'投石機があなたを狙っています');
}
function processEvents(){
  let debrisCount=0;
  for(const e of world.drainEvents()){
    if(e.type==='debris'){if(debrisCount++<95)emit(e.x,e.y,e.z,MATERIALS[e.mat].color,1,e.reason==='collapse'?5:12);}
    if(e.type==='impact'){emit(e.x,e.y,e.z,demon?0xd3a5ed:0xffdea1,9,14,'spark');impactRing(e.x,e.y,e.z,e.r);playImpact();}
    if(e.type==='shot')shoot(e);
  }
}
function updateProjectiles(dt){
  for(let i=projectiles.length-1;i>=0;i--){const p=projectiles[i];p.age+=dt;p.trail+=dt;
    if(p.kind==='mage'){const dir=v3.copy(playerPos).sub(p.mesh.position).normalize().multiplyScalar(26);p.velocity.lerp(dir,1-Math.exp(-dt*1.1));}else p.velocity.y-=12*dt;
    p.mesh.position.addScaledVector(p.velocity,dt);p.mesh.rotation.x+=dt*2;p.mesh.rotation.z+=dt;
    if(p.trail>.07){p.trail=0;emit(p.mesh.position.x,p.mesh.position.y,p.mesh.position.z,p.kind==='mage'?0xbe8be3:0xaa9a7e,1,1,'fire');}
    const ppos=p.mesh.position,hit=ppos.distanceTo(playerPos)<(p.kind==='mage'?2.6:3.5),ground=ppos.y<=world.terrainHeight(ppos.x,ppos.z);
    if(hit||ground||p.age>13){
      if(hit&&hitClock<=0&&active){health=Math.max(0,health-(p.kind==='mage'?12:22));hitClock=.8;$('#damage-flash').style.opacity='.6';setTimeout(()=>$('#damage-flash').style.opacity='0',180);toast('反撃を受けた — 加速・旋回して回避');}
      if(ground&&p.kind==='catapult')world.impact(ppos.x,ppos.y,ppos.z,2.5,12);
      emit(ppos.x,ppos.y,ppos.z,p.kind==='mage'?0xc699e6:0xb9a48a,8,9,'spark');scene.remove(p.mesh);p.mesh.geometry.dispose();p.mesh.material.dispose();projectiles.splice(i,1);
    }
  }
  if(health<=0){health=100;playerPos.set(0,85,135);velocity.set(0,0,0);toast('神威が尽きた — 天空から再降臨');}
}

function updateFlight(dt){
  const turn=(keys.has('KeyA')?1:0)-(keys.has('KeyD')?1:0),tilt=(keys.has('ArrowUp')?1:0)-(keys.has('ArrowDown')?1:0);
  yaw+=turn*dt*1.35;pitch=clamp(pitch+tilt*dt*.75,-1.18,1.18);
  const boost=keys.has('ShiftLeft')||keys.has('ShiftRight'),move=(keys.has('KeyW')?1:0)-(keys.has('KeyS')?1:0);
  forward.set(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
  const desired=forward.clone().multiplyScalar(move*(boost?97:32));desired.y+=((keys.has('Space')?1:0)-(keys.has('KeyC')?1:0))*(boost?48:24);
  velocity.lerp(desired,1-Math.exp(-dt*(move?2.8:2.3)));
  const steps=Math.max(1,Math.ceil(velocity.length()*dt/.8));
  for(let step=0;step<steps;step++){
    playerPos.addScaledVector(velocity,dt/steps);
    for(const y of [-.6,.6]){const id=world.grid.get(`${Math.round(playerPos.x/2)},${Math.floor((playerPos.y+y)/2)},${Math.round(playerPos.z/2)}`);if(id!==undefined&&world.blocks[id].alive){playerPos.addScaledVector(velocity,-dt/steps);velocity.multiplyScalar(-.2);break;}}
  }
  playerPos.x=clamp(playerPos.x,-550,550);playerPos.z=clamp(playerPos.z,-550,550);const floor=world.terrainHeight(playerPos.x,playerPos.z);
  playerPos.y=clamp(playerPos.y,Math.max(4,floor+2.4),240);
  speed=velocity.length();document.body.classList.toggle('boosting',boost&&move!==0);
  avatar.position.copy(playerPos);avatar.position.y+=Math.sin(elapsed*2.8)*.12;avatar.rotation.set(pitch*.6,yaw,turn*.22);
  const flap=Math.sin(elapsed*(boost?11:4))*(boost?.1:.16);leftWing.rotation.z=flap;rightWing.rotation.z=-flap;cape.rotation.x=.35+speed*.008;
  const horizontal=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
  const camPos=playerPos.clone().addScaledVector(horizontal,-14-speed*.035).add(new THREE.Vector3(Math.cos(yaw)*3.8,0,-Math.sin(yaw)*3.8));camPos.y+=5.6;
  const target=playerPos.clone().addScaledVector(forward,29);target.y-=8;
  camera.position.lerp(camPos,1-Math.exp(-dt*5));camera.lookAt(target);
  camera.fov=lerp(camera.fov,boost&&move?73:60,1-Math.exp(-dt*3));camera.updateProjectionMatrix();
  if(windGain){const muted=paused||!audioOn;windGain.gain.setTargetAtTime(muted?0:.012+speed*.00055,audioCtx.currentTime,.15);windFilter.frequency.setTargetAtTime(240+speed*15,audioCtx.currentTime,.1);}
}
function updateAttract(dt){
  const a=elapsed*.025;playerPos.set(Math.sin(a)*85,69+Math.sin(a*.7)*9,145*Math.cos(a));yaw=a;pitch=-.12;
  avatar.position.copy(playerPos);avatar.rotation.set(-.1,yaw,-.12);leftWing.rotation.z=Math.sin(elapsed*3)*.15;rightWing.rotation.z=-leftWing.rotation.z;
  const cam=playerPos.clone().add(new THREE.Vector3(16,9,29));camera.position.lerp(cam,1-Math.exp(-dt*1.4));camera.lookAt(-7,22,-19);
}
function updateDemo(dt){
  const a=elapsed*.12;playerPos.set(Math.sin(a)*91,53+Math.sin(a*.8)*12,24+Math.cos(a)*100);
  const target=new THREE.Vector3(Math.sin(a*.4)*25,20,23);forward.copy(target).sub(playerPos).normalize();yaw=Math.atan2(-forward.x,-forward.z);pitch=Math.asin(forward.y);
  avatar.position.copy(playerPos);avatar.rotation.set(pitch*.6,yaw,Math.sin(a)*.2);leftWing.rotation.z=Math.sin(elapsed*4)*.15;rightWing.rotation.z=-leftWing.rotation.z;
  const cam=playerPos.clone().addScaledVector(forward,-17);cam.y+=6;camera.position.lerp(cam,1-Math.exp(-dt*3));camera.lookAt(target);speed=35;
  const b=world.buildings[Math.floor(elapsed/3)%14];const live=b.blocks.map(i=>world.blocks[i]).find(v=>v.alive&&v.mat===0);
  if(live){aim.set(live.x,live.y,live.z);aimHit={type:'block',block:live};}else{aim.set(b.x,world.terrainHeight(b.x,b.z),b.z);aimHit={type:'terrain'};}
}
function updateBeam(dt){
  beamOn=active&&!paused&&(demo?Math.sin(elapsed*1.2)>.0:pointerDown||keys.has('KeyF'));
  document.body.classList.toggle('firing',beamOn);beam.visible=beamCore.visible=beamOn;impactGlow.visible=beamOn&&!!aimHit;
  if(!beamOn){fireClock=0;if(beamGain)beamGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);return;}
  const from=avatar.position.clone().add(new THREE.Vector3(0,.25,-.3).applyAxisAngle(new THREE.Vector3(0,1,0),yaw));
  beamBetween(beam,from,aim);beamBetween(beamCore,from,aim);impactGlow.position.copy(aim);impactGlow.scale.setScalar(2+Math.sin(elapsed*45)*.4);
  if(beamGain)beamGain.gain.setTargetAtTime(audioOn?.025:0,audioCtx.currentTime,.1);
  fireClock-=dt;if(fireClock<=0&&aimHit&&aimHit.type!=='sea'){fireClock=.12;world.impact(aim.x,aim.y,aim.z,5.8,53);}
}
function updateParticles(dt){
  for(let i=particleData.length-1;i>=0;i--){const p=particleData[i];p.life-=dt;if(p.life<=0){particleData.splice(i,1);continue;}p.x+=p.vx*dt;p.y+=p.vy*dt;p.z+=p.vz*dt;if(p.kind!=='fire')p.vy-=dt*15;
    const ground=world.terrainHeight(p.x,p.z);if(p.y<ground+.12){p.y=ground+.12;p.vy=Math.abs(p.vy)*.18;p.vx*=.8;p.vz*=.8;}
    temp.position.set(p.x,p.y,p.z);temp.rotation.set(p.rotation+elapsed,p.rotation,elapsed*.5);temp.scale.setScalar(p.size*Math.min(1,p.life*2));temp.updateMatrix();particles.setMatrixAt(i,temp.matrix);particles.setColorAt(i,new THREE.Color(p.color));
  }
  particles.count=particleData.length;if(particleData.length){particles.instanceMatrix.needsUpdate=true;particles.instanceColor.needsUpdate=true;}
  for(let i=effects.length-1;i>=0;i--){const e=effects[i];e.life-=dt;const s=(1-e.life/e.max)*e.r*2;e.mesh.scale.setScalar(s);e.mesh.material.opacity=e.life/e.max*.6;if(e.life<=0){scene.remove(e.mesh);e.mesh.geometry.dispose();e.mesh.material.dispose();effects.splice(i,1);}}
}
function updateWorldViews(dt){
  for(const h of humans){h.sprite.position.set(h.data.x,h.data.y+.9+(h.data.panic?Math.abs(Math.sin(h.data.phase))*.17:0),h.data.z);h.sprite.material.map=spriteTextures[Math.floor(h.data.phase/Math.PI)%2];h.sprite.material.rotation=h.data.panic?Math.sin(h.data.phase)*.06:0;}
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
  $('#flight-state').textContent=speed>55?'HYPER FLIGHT':speed<1?'HOVERING':'CRUISING';$('#fps').textContent=Math.round(fps)+' FPS';
  $('#target-label').textContent=aimHit?.block?MATERIALS[aimHit.block.mat].name+' / '+world.buildings[aimHit.block.building].name:aimHit?.type==='terrain'?'地表 / 破壊可能':'';drawMap();
}
function loop(now){
  requestAnimationFrame(loop);const rawDt=lastHudTime?(now-lastHudTime)/1000:.016,dt=Math.min(.08,rawDt);lastHudTime=now;frameCount++;fps=lerp(fps,1/Math.max(rawDt,.001),.08);
  if(!paused){
    elapsed+=dt;hitClock=Math.max(0,hitClock-dt);if(active){if(demo)updateDemo(dt);else updateFlight(dt);}else updateAttract(dt);
    if(!demo)aimHit=castAim();updateBeam(dt);
    simClock+=dt;if(simClock>=.05){world.tick(simClock,active?playerPos:null);simClock=0;processEvents();updateBlocks();if(world.terrainDirty)buildTerrain();}
    if(active){updateProjectiles(dt);health=Math.min(100,health+dt*1.1);}
    updateParticles(dt);updateWorldViews(dt);hudClock+=dt;if(hudClock>.15){hudClock=0;updateHud();}
    if(toastClock>0){toastClock-=dt;if(toastClock<=0)$('#toast').classList.remove('visible');}
  }
  renderer.render(scene,camera);
}

function begin(asDemo=false){active=true;demo=asDemo;paused=false;elapsed=0;$('#intro').hidden=true;$('#region').hidden=true;$('#hud').hidden=false;$('#demo-badge').hidden=!demo;$('#pause-screen').hidden=true;$('#mode-label').textContent=demo?'AUTO DEMO':'SANDBOX';document.body.classList.add('playing');if(matchMedia('(pointer:coarse)').matches&&!demo)$('#touch-controls').hidden=false;playerPos.set(0,63,142);yaw=0;pitch=-.08;camera.position.copy(playerPos).add(new THREE.Vector3(0,6,17));if(!demo)toast('Wで前進 / SHIFTで加速 / 左長押しで光を放つ');}
function setPaused(value){if(!active)return;paused=value;keys.clear();pointerDown=false;beam.visible=beamCore.visible=impactGlow.visible=false;$('#pause-screen').hidden=!paused;$('#pause').textContent=paused?'▷':'Ⅱ';$('#pause').setAttribute('aria-label',paused?'飛行を再開':'一時停止');if(windGain)windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);if(beamGain)beamGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}
function openGuide(){pausedBeforeGuide=paused;keys.clear();pointerDown=false;paused=true;beam.visible=beamCore.visible=impactGlow.visible=false;$('#guide').showModal();if(windGain)windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);if(beamGain)beamGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}
function closeGuide(){$('#guide').close();paused=pausedBeforeGuide;}
function resize(){if(!renderer)return;camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight);}
function initAudio(){
  if(!audioCtx){audioCtx=new (window.AudioContext||window.webkitAudioContext)();const buf=audioCtx.createBuffer(1,audioCtx.sampleRate*2,audioCtx.sampleRate);const a=buf.getChannelData(0);for(let i=0;i<a.length;i++)a[i]=(Math.random()*2-1);const src=audioCtx.createBufferSource();src.buffer=buf;src.loop=true;windFilter=audioCtx.createBiquadFilter();windFilter.type='lowpass';windFilter.frequency.value=400;windGain=audioCtx.createGain();windGain.gain.value=0;src.connect(windFilter).connect(windGain).connect(audioCtx.destination);src.start();const tone=audioCtx.createOscillator();tone.frequency.value=76;tone.type='sawtooth';const filter=audioCtx.createBiquadFilter();filter.type='lowpass';filter.frequency.value=450;beamGain=audioCtx.createGain();beamGain.gain.value=0;tone.connect(filter).connect(beamGain).connect(audioCtx.destination);tone.start();}audioCtx.resume();
}
$('#start').onclick=()=>begin();$('#demo').onclick=()=>begin(true);$('#take-control').onclick=()=>{demo=false;$('#demo-badge').hidden=true;$('#mode-label').textContent='SANDBOX';pitch=-.08;toast('あなたの翼で、自由に飛行できます');};$('#reset').onclick=()=>rebuildWorld();$('#pause').onclick=()=>setPaused(!paused);$('#resume').onclick=()=>setPaused(false);$('#help').onclick=openGuide;$('#close-guide').onclick=closeGuide;$('#guide-play').onclick=closeGuide;$('#guide').addEventListener('cancel',()=>{paused=pausedBeforeGuide;});$('#god').onclick=()=>setCharacter(false);$('#demon').onclick=()=>setCharacter(true);
$('#audio').onclick=()=>{initAudio();audioOn=!audioOn;$('#audio').setAttribute('aria-pressed',audioOn);$('#audio').setAttribute('aria-label',audioOn?'サウンドをオフ':'サウンドをオン');$('.mute-line').hidden=audioOn;if(!audioOn){windGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);beamGain.gain.setTargetAtTime(0,audioCtx.currentTime,.1);}};
window.addEventListener('resize',resize);window.addEventListener('keydown',e=>{
  if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();
  if(e.repeat)return;if(e.code==='KeyH'){if($('#guide').open)closeGuide();else openGuide();return;}
  if($('#guide').open)return;if(e.code==='Escape'){setPaused(!paused);return;}if(e.code==='KeyR'){rebuildWorld();return;}
  if(!active||paused)return;keys.add(e.code);
});window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>{keys.clear();pointerDown=false;rightDown=false;if(active&&!demo)setPaused(true);});
canvas.addEventListener('contextmenu',e=>e.preventDefault());canvas.addEventListener('pointerdown',e=>{if(!active||paused||demo)return;canvas.setPointerCapture(e.pointerId);if(e.button===0)pointerDown=true;if(e.button===2)rightDown=true;});canvas.addEventListener('pointerup',e=>{if(e.button===0)pointerDown=false;if(e.button===2)rightDown=false;});canvas.addEventListener('pointercancel',()=>{pointerDown=rightDown=false;});canvas.addEventListener('pointermove',e=>{if(!active||paused||demo||!(pointerDown||rightDown))return;yaw-=e.movementX*.003;pitch=clamp(pitch-e.movementY*.0024,-1.18,1.18);});
for(const b of document.querySelectorAll('[data-key]')){b.addEventListener('pointerdown',e=>{e.preventDefault();b.setPointerCapture(e.pointerId);keys.add(b.dataset.key);});for(const event of ['pointerup','pointercancel'])b.addEventListener(event,()=>keys.delete(b.dataset.key));}
$('#touch-fire').addEventListener('pointerdown',e=>{e.preventDefault();e.target.setPointerCapture(e.pointerId);pointerDown=true;});for(const event of ['pointerup','pointercancel'])$('#touch-fire').addEventListener(event,()=>pointerDown=false);
try{init();const q=new URLSearchParams(location.search);if(q.has('demo'))begin(true);
  if(q.has('test'))window.__aether={get world(){return world;},get renderer(){return renderer;},get state(){return {active,paused,demo,health,speed,position:playerPos.toArray(),terrainVisible:scene.children.includes(terrain),projectiles:projectiles.length,stats:world.getStats(),fps};},impact:(x,y,z,r=6,p=90)=>world.impact(x,y,z,r,p),aimAt:(x,y,z)=>{const d=new THREE.Vector3(x,y,z).sub(playerPos).normalize();yaw=Math.atan2(-d.x,-d.z);pitch=clamp(Math.asin(d.y)+.28,-1.18,1.18);},teleport:(x,y,z)=>{playerPos.set(x,y,z);velocity.set(0,0,0);camera.position.set(x,y+6,z+16);},get projectiles(){return projectiles;}};
}catch(error){fatal(error);}
