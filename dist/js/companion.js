import * as THREE from '../vendor/three.module.js';

import {SummonRift} from './rift.js';

const turnSeconds=2, orbitRadius=3.2, turn=Math.PI*2;
const spriteSize=2.65/2, rate=turn/turnSeconds;
const metresPerPass=24, stoppedSpeed=.5;
const spacing=altitude=>altitude<45?1:altitude<110?3:5;

function ribbon(points,width,right,positions,colors){
  // A saturated outer edge keeps the white channel visible even against pale stone.
  const bands=[[-1,.13,.36,1],[-.34,.35,.88,1],[0,1,1,1],[.34,.64,.96,1],[1,.13,.36,1]];
  function vertex(i,band){
    const p=points[i],w=width*band[0];
    positions.push(p.x+right.x*w,p.y,p.z+right.z*w);colors.push(band[1],band[2],band[3]);
  }
  for(let i=0;i<points.length-1;i++)for(let j=0;j<bands.length-1;j++){
    for(const [row,col] of [[i,j],[i+1,j],[i,j+1],[i,j+1],[i+1,j],[i+1,j+1]])vertex(row,bands[col]);
  }
}

function boltGeometry(height,right){
  const positions=[],colors=[],points=[];
  const segments=THREE.MathUtils.clamp(Math.ceil(height/2),4,36);
  const spread=Math.min(1.05,height*.055);
  for(let i=0;i<=segments;i++){
    const t=i/segments,w=spread*Math.min(1,5*t,5*(1-t));
    points.push(new THREE.Vector3((Math.random()-.5)*2*w,-height*t,(Math.random()-.5)*2*w));
  }
  ribbon(points,.16,right,positions,colors);
  for(const t of [.32,.68]){
    const p=points[Math.floor(segments*t)],s=Math.min(2.4,height*.13);
    const side=t<.5?-1:1;
    const tip=p.clone().addScaledVector(right,s*side);tip.y-=s*1.4;
    const elbow=p.clone().lerp(tip,.54);elbow.y+=s*.22;
    ribbon([p,elbow,tip],.055,right,positions,colors);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));return g;
}

export class StormCompanion extends THREE.Group {
  constructor(texture){
    super();
    texture.colorSpace=THREE.SRGBColorSpace;texture.magFilter=texture.minFilter=THREE.NearestFilter;
    texture.generateMipmaps=false;texture.repeat.set(.25,.5);
    const plane=new THREE.PlaneGeometry(spriteSize,spriteSize);
    plane.translate(0,(34.5-24)/48*spriteSize,0);
    this.body=new THREE.Mesh(plane,new THREE.MeshBasicMaterial({map:texture,alphaTest:.5,toneMapped:false}));
    this.add(this.body);
    const canvas=document.createElement('canvas');canvas.width=canvas.height=64;
    const ctx=canvas.getContext('2d'),glow=ctx.createRadialGradient(32,32,0,32,32,32);
    glow.addColorStop(0,'white');glow.addColorStop(.16,'#b5ffff');glow.addColorStop(.40,'rgba(60,183,255,.64)');glow.addColorStop(1,'rgba(24,80,255,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,64,64);
    const glowMap=new THREE.CanvasTexture(canvas);glowMap.colorSpace=THREE.SRGBColorSpace;
    this.charge=new THREE.Sprite(new THREE.SpriteMaterial({map:glowMap,depthWrite:false,toneMapped:false}));
    this.add(this.charge);
    this.bolt=new THREE.Mesh(new THREE.BufferGeometry(),new THREE.MeshBasicMaterial({vertexColors:true,side:THREE.DoubleSide,transparent:true,depthWrite:false,toneMapped:false}));
    this.add(this.bolt);
    this.cameraRight=new THREE.Vector3();this.socket=new THREE.Vector3();
    this.rift=new SummonRift();this.reset();
  }
  reset(){
    this.rift.time=1;this.phase=Math.PI/2;this.count=0;this.pass=0;this.lastPass=-Infinity;this.flightDistance=0;
    this.enabled=false;this.lastStrike=null;this.flashAge=1;
    this.visible=this.charge.visible=this.bolt.visible=false;
  }
  toggle(){
    this.enabled=!this.enabled;this.lastPass=-Infinity;this.flightDistance=0;
    if(this.enabled)this.phase=Math.PI/2;
    else{this.body.visible=this.charge.visible=false;}
    this.rift.start(this.enabled);
    return this.enabled;
  }
  locate(center,yaw,phase,out){
    return out.set(center.x+orbitRadius*Math.sin(phase-yaw),center.y+.35+.09*Math.sin(phase*2),
      center.z-orbitRadius*Math.cos(phase-yaw));
  }
  update(dt,from,to,oldYaw,yaw,camera,world){
    this.rift.time=Math.min(1,this.rift.time+dt/.44);
    this.visible=this.enabled||this.flashAge<.22;
    this.body.visible=this.enabled;
    if(!this.enabled){
      this.flashAge+=dt;this.bolt.visible=this.flashAge<.22;
      this.bolt.material.opacity=1-THREE.MathUtils.smoothstep(this.flashAge,.035,.22);
      return;
    }
    this.body.scale.setScalar(THREE.MathUtils.smoothstep(this.rift.time,.10,.87));
    const start=this.phase,end=start+dt*rate;
    const boundary=Math.PI*.5+Math.PI*Math.ceil((start-Math.PI*.5)/Math.PI);
    const ground=world.terrainHeight(to.x,to.z),interval=spacing(to.y-ground);
    const travel=Math.hypot(to.x-from.x,to.z-from.z);
    const moving=travel>stoppedSpeed*dt, needed=metresPerPass*interval;
    const previousDistance=this.flightDistance;
    this.flightDistance=moving?previousDistance+travel:0;
    this.cameraRight.set(1,0,0).applyQuaternion(camera.quaternion);
    this.cameraRight.y=0;this.cameraRight.normalize();
    this.flashAge+=dt;
    if(boundary<end){
      this.pass++;
      const fraction=(boundary-start)/(end-start);
      // Only ground distance already flown at this precise side crossing counts.
      if(moving&&previousDistance+travel*fraction>=needed&&this.rift.time>=1&&this.pass-this.lastPass>=interval){
        this.flightDistance=travel*(1-fraction);
        const center=this.socket.lerpVectors(from,to,fraction);
        const angle=THREE.MathUtils.lerp(oldYaw,yaw,fraction);
        const origin=this.locate(center,angle,boundary,new THREE.Vector3());
        const base=world.terrainHeight(origin.x,origin.z);
        let hit=Math.min(origin.y,base||-.55);
        // Check loose as well as fixed voxels, stopping at the first surface.
        for(let y=origin.y;y>base;y-=.75){
          const block=world.solidAt(origin.x,y,origin.z);
          if(block){hit=Math.min(origin.y,block.y+1);break;}
        }
        this.bolt.geometry.dispose();this.bolt.geometry=boltGeometry(origin.y-hit,this.cameraRight);
        this.bolt.position.copy(origin);this.flashAge=0;
        this.lastPass=this.pass;this.count++;
        this.lastStrike={x:origin.x,y:origin.y,z:origin.z,hit,side:Math.sign(Math.sin(boundary)),cx:center.x,cz:center.z,yaw:angle};
        world.impact(origin.x,hit,origin.z,5,90,'lightning');
      }
    }
    this.phase=end%turn;
    this.locate(to,yaw,this.phase,this.socket);
    this.rift.center.copy(this.socket);this.rift.center.y+=.26;
    this.body.position.copy(this.socket);this.body.quaternion.copy(camera.quaternion);
    const heading=this.phase-yaw;
    const tx=Math.cos(heading),tz=Math.sin(heading);
    const toward=Math.atan2(camera.position.x-this.socket.x,camera.position.z-this.socket.z);
    const frame=(Math.round(Math.atan2(tx*Math.cos(toward)-tz*Math.sin(toward),tx*Math.sin(toward)+tz*Math.cos(toward))/(turn/8))+8)%8;
    this.body.material.map.offset.set((frame%4)/4,frame<4?.5:0);
    const next=(Math.PI*.5+Math.PI*Math.ceil((this.phase-Math.PI*.5)/Math.PI)-this.phase)/rate;
    const readyAtNext=moving&&this.flightDistance+travel/dt*next>=needed;
    const charge=readyAtNext&&this.rift.time>=1&&this.pass+1-this.lastPass>=interval?THREE.MathUtils.smoothstep(.24-next,0,.24):0;
    const spark=Math.max(charge,Math.max(0,1-this.flashAge/.12));
    this.charge.visible=spark>.03;this.charge.position.copy(this.socket);this.charge.scale.setScalar(.18+.82*spark);this.charge.material.opacity=spark;
    this.bolt.visible=this.flashAge<.22;
    this.bolt.material.opacity=(1-THREE.MathUtils.smoothstep(this.flashAge,.035,.22))*(.78+.22*Math.cos(this.flashAge*65));
  }
}
