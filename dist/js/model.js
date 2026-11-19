import {buildCastle,castleTerrain} from './castle.js';
import {Collapse} from './collapse.js?v=0.5.0';

// Engine-independent world state. Units are metres; +Y is up.
export const BLOCK = 2;
export const gate = {z:8, halfDepth:3, ground:16};
export const westTower = {x:-32, z:-10, peak:50};
// Heights of the stepped arch, measured from the road surface.
export function gateClearance(x){
  const column=Math.abs(Math.round(x/BLOCK));
  return column<=3?20:column===4?18:column===5?16:0;
}
export const MATERIALS = [
  {name:'木材', color:0x89603e, breakDrop:6, hp:28, ignition:17, fuel:5.5, spread:12},
  {name:'石材', color:0xc1b69d, breakDrop:12, hp:100, ignition:Infinity, fuel:0, spread:0},
  {name:'屋根材', color:0x98564b, breakDrop:2, hp:48, ignition:33, fuel:9, spread:6},
];
export function damageStage(v){
  const fraction=v.hp/MATERIALS[v.mat].hp;
  if(!v.alive||fraction>=1)return 0;
  return fraction>.65?1:fraction>.30?2:3;
}
export function random(seed=7419) {return ()=> {seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const key=(x,y,z)=>`${x},${y},${z}`;
export class World {
  constructor(seed=7419,{catchRoof=false,defenses=true,castle=false}={}) {
    this.rng=random(seed);this.size=100;this.cell=4;this.half=200;
    this.heights=new Int16Array(this.size*this.size);this.originalHeights=new Int16Array(this.size*this.size);
    this.blocks=[];this.spatial=new Map();this.grid=new Map();this.buildings=[];this.humans=[];this.defenders=[];
    this.burning=new Set();this.changed=new Set();this.dirtyBuildings=new Set();this.events=[];
    this.destroyed=0;this.excavated=0;this.ignited=0;this.shots=0;this.tickTime=0;this.supportClock=0;this.terrainDirty=true;
    this.looseCount=0;this.collapse=new Collapse(this,MATERIALS);
    this.generateTerrain(castle);
    if(castle)buildCastle(this);
    else this.generateTown(defenses);
    if(catchRoof && !castle)this.makeCatchRoof();
    this.initialBlocks=this.blocks.length;
  }
  generateTerrain(castle){
    for(let z=0;z<this.size;z++)for(let x=0;x<this.size;x++){
      const wx=x*4-this.half+2,wz=z*4-this.half+2;
      const r=Math.hypot(wx/178,wz/183);
      const wave=Math.sin(wx*.043)*Math.cos(wz*.037)*.55+Math.sin((wx+wz)*.074)*.25;
      let h=r>1+wave*.08?0:Math.max(1,Math.round(1+(1-r)*5+wave));
      h+=Math.round(12*Math.exp(-((wx+57)**2/1500+(wz+119)**2/900)));
      h+=Math.round(7*Math.exp(-((wx-92)**2/800+(wz+86)**2/1200)));
      if(Math.abs(wx)<66&&wz>-84&&wz<94)h=4;
      this.heights[z*this.size+x]=castle ? castleTerrain(wx,wz,h) : h;
    }
    this.originalHeights.set(this.heights);
  }
  terrainHeight(x,z){const ix=Math.floor((x+this.half)/this.cell),iz=Math.floor((z+this.half)/this.cell);return ix<0||iz<0||ix>=this.size||iz>=this.size?0:this.heights[iz*this.size+ix]*4;}
  addBlock(gx,gy,gz,mat,building,color){
    const k=key(gx,gy,gz);if(this.grid.has(k))return;
    const v={id:this.blocks.length,gx,gy,gz,x:gx*2,y:gy*2+1,z:gz*2,mat,building,color,hp:MATERIALS[mat].hp,heat:0,burn:0,alive:true};
    this.blocks.push(v);this.grid.set(k,v.id);this.buildings[building].blocks.push(v.id);
    const sk=key(Math.floor(v.x/8),Math.floor(v.y/8),Math.floor(v.z/8));
    v.bucket=sk;this.indexBlock(v);
  }
  building(name,x,z){const id=this.buildings.length;this.buildings.push({name,x,z,blocks:[]});return id;}
  house(x,z,wood=true,nx=5,nz=6){
    x=Math.round(x/2);z=Math.round(z/2);const base=this.terrainHeight(x*2,z*2)/2,id=this.building(wood?'木造民家':'石造民家',x*2,z*2);
    for(let y=0;y<4;y++)for(let a=0;a<nx;a++)for(let b=0;b<nz;b++){
      if((a===0||a===nx-1||b===0||b===nz-1)&&!(b===nz-1&&a===2&&y<2))this.addBlock(x+a,base+y,z+b,y===0?1:wood?0:1,id);
      if(y===0)this.addBlock(x+a,base,z+b,0,id);
    }
    for(let a=-1;a<=nx;a++)for(let b=-1;b<=nz;b++)for(let y=0;y<=Math.max(0,Math.floor((nx/2-Math.abs(a-(nx-1)/2))*.85));y++)this.addBlock(x+a,base+4+y,z+b,2,id);
    return id;
  }
  generateTown(defenses){
    for(const [x,z,wood] of [[-48,22,true],[-30,24,true],[18,24,true],[39,22,false],[-48,44,true],[-29,45,true],[18,46,true],[40,45,true],[-46,69,false],[-26,70,true],[18,71,true],[40,69,true],[-48,-5,true],[39,-4,false]])this.house(x,z,wood);
    const id=this.building('白亜の城',26,-53),base=8;
    const block=(x,y,z,m=1)=>this.addBlock(x+13,base+y,z-10,m,id);
    for(let x=-10;x<=10;x++)for(let z=-27;z<=-9;z++)for(let y=0;y<9;y++){
      if(x===-10||x===10||z===-27||z===-9){if(z===-9&&Math.abs(x)<2&&y<4)continue;block(x,y,z);}
      if(y===0||y===7)block(x,y,z,y===7?0:1);
    }
    for(let x=-10;x<=10;x++)for(let z=-27;z<=-9;z++)if(x===-10||x===10||z===-27||z===-9)if((x+z)%2===0)block(x,9,z);
    for(const tx of [-11,8])for(const tz of [-28,-11]){
      for(let x=0;x<5;x++)for(let z=0;z<5;z++)for(let y=0;y<14;y++)if(x===0||z===0||x===4||z===4||y===13)block(tx+x,y,tz+z);
      for(let y=0;y<4;y++)for(let x=-1+y;x<=5-y;x++)for(let z=-1+y;z<=5-y;z++)block(tx+x,14+y,tz+z,2);
    }
    const wall=this.building('南の城門',0,gate.z);
    for(let x=-31;x<=31;x++)for(let y=8;y<12;y++)if(Math.abs(x)>8)this.addBlock(x,y,4,1,wall);
    for(let z=-41;z<=4;z++)for(let y=8;y<12;y++)for(const x of [-31,31])this.addBlock(x,y,z,1,wall);
    for(let x=-8;x<=8;x++){
      const pier=Math.abs(x)>=6;
      const top=pier?14:11;
      for(let z=3;z<=5;z++)for(let y=gateClearance(x*2)/2;y<=top;y++){
        const trim=y===top||(!pier&&y===gateClearance(x*2)/2);
        const color=trim?0xc99e60:pier&&Math.abs(x)===7&&y>=6&&z===5?0x295d68:undefined;
        this.addBlock(x,base+y,z,1,wall,color);
      }
    }
    const tower=this.towerId=this.building('青緑の塔',westTower.x,westTower.z);
    const towerBlock=(x,y,z,mat,color)=>this.addBlock(westTower.x/2+x,base+y,westTower.z/2+z,mat,tower,color);
    for(let y=0;y<12;y++)for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
      if(Math.abs(x)===2||Math.abs(z)===2||y===11)towerBlock(x,y,z,y===11&&Math.abs(x)<2?0:1,y===10?0xbb9358:undefined);
    }
    for(let y=0;y<5;y++){
      const radius=Math.max(0,3-y);
      for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++)towerBlock(x,12+y,z,2,y===4?0xd6a557:0x2a6875);
    }
    for(let i=0;i<56;i++){
      const x=i<10?(i%2?1:-1)*(2+this.rng()*3):(this.rng()-.5)*110;
      const z=i<10?19+i*7+this.rng()*3:10+this.rng()*82;
      this.humans.push({x,z,y:this.terrainHeight(x,z),struckAt:null,homeX:x,homeZ:z,dx:0,dz:0,panic:0,phase:this.rng()*6.28,speed:2.8+this.rng()*1.8});
    }
    if(!defenses)return;
    const siege = defenses === 'siege';
    if(siege){
      const support = this.blockAtGrid(westTower.x/2, (westTower.peak-2)/2, westTower.z/2);
      this.defenders.push({type:'mage', x:westTower.x, y:support.y+1, z:westTower.z,
        building:tower, support, cooldown:.85, alive:true, fired:0});
    }
    const sites = siege ? [['catapult',-20,18]] : [['catapult',-54,15],['catapult',54,15],['catapult',-14,90],['mage',-12,-12],['mage',12,-12],['mage',0,42]];
    for(const [type,x,z] of sites){
      const by=this.terrainHeight(x,z),bid=this.building(type==='mage'?'魔導師の祭壇':'投石機',x,z);
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)this.addBlock(Math.round(x/2)+a,by/2,Math.round(z/2)+b,type==='mage'?1:0,bid);
      this.defenders.push({type,x,y:by+2,z,cooldown:siege ? .9 : 2+this.rng()*4,alive:true,building:bid,fired:0});
    }
  }
  makeCatchRoof(){
    const id=this.building('張り出し屋根',westTower.x+16,westTower.z);
    for(let x=4;x<=13;x++)for(let z=-4;z<=4;z++){
      const gx=westTower.x/2+x,gz=westTower.z/2+z;
      if((x===4||x===13)&&Math.abs(z)===4){
        for(let y=8;y<17;y++)this.addBlock(gx,y,gz,1,id);
      }
      this.addBlock(gx,17,gz,0,id);
      this.addBlock(gx,18,gz,2,id,0x955840);
    }
  }
  notchTower(){
    for(const id of this.buildings[this.towerId].blocks){
      const v=this.blocks[id];
      if(!v.loose&&v.y>=19&&v.y<=29&&v.x>westTower.x-4)this.remove(v);
    }
    this.checkSupport();
  }
  blockAtGrid(x,y,z){
    const v=this.blocks[this.grid.get(key(x,y,z))];return v?.alive?v:null;
  }
  indexBlock(v){
    if(!this.spatial.has(v.bucket))this.spatial.set(v.bucket,new Set());
    this.spatial.get(v.bucket).add(v.id);
  }
  unindexBlock(v){
    const bucket=this.spatial.get(v.bucket);bucket?.delete(v.id);
    if(bucket&&!bucket.size)this.spatial.delete(v.bucket);
  }
  detach(v){
    this.collapse.recheck=true;this.grid.delete(key(v.gx,v.gy,v.gz));v.loose=true;this.looseCount++;
  }
  moveBlock(v,pos){
    Object.assign(v,pos);
    const bucket=key(Math.floor(v.x/8),Math.floor(v.y/8),Math.floor(v.z/8));
    if(bucket!==v.bucket){this.unindexBlock(v);v.bucket=bucket;this.indexBlock(v);}
    this.changed.add(v.id);
  }
  solidAt(x,y,z){
    const fixed=this.blockAtGrid(Math.round(x/2),Math.floor(y/2),Math.round(z/2));
    if(fixed||!this.looseCount)return fixed;
    let hit=null;
    this.nearby(x,y,z,1,v=>{
      if(v.loose&&Math.abs(v.x-x)<1&&Math.abs(v.y-y)<1&&Math.abs(v.z-z)<1)hit=v;
    });
    return hit;
  }
  landingSurface(x,z,upper,lower,body){
    let height=null;
    const consider=h=>{if(h<=upper+.00001&&h>=lower-.00001&&(height===null||h>height))height=h;};
    consider(this.terrainHeight(x,z));
    const gx=Math.round(x/2),gz=Math.round(z/2);
    for(let gy=Math.ceil((lower-.00001)/2)-1;gy<=Math.floor((upper+.00001)/2)-1;gy++){
      if(this.blockAtGrid(gx,gy,gz))consider((gy+1)*2);
    }
    if(this.collapse.resting.size)this.nearby(x,(lower+upper)/2,z,2+(upper-lower)/2,v=>{
      if(v.body?.resting&&v.body!==body&&Math.abs(v.x-x)<1.02&&Math.abs(v.z-z)<1.02)consider(v.y+1);
    });
    return height;
  }
  nearby(x,y,z,r,fn){
    for(let a=Math.floor((x-r)/8);a<=Math.floor((x+r)/8);a++)for(let b=Math.floor((y-r)/8);b<=Math.floor((y+r)/8);b++)for(let c=Math.floor((z-r)/8);c<=Math.floor((z+r)/8);c++){
      for(const id of this.spatial.get(key(a,b,c))||[]){const v=this.blocks[id];if(v.alive)fn(v);}
    }
  }
  damage(v,amount,reason='impact'){
    if(!v.alive)return;
    const previous=damageStage(v);
    v.hp-=amount;
    if(v.hp<=0)this.remove(v,reason);
    else if(previous!==damageStage(v))this.changed.add(v.id);
  }
  remove(v,reason='impact'){
    if(!v.alive)return;v.alive=false;this.collapse.damaged(v);this.unindexBlock(v);
    if(v.loose){this.looseCount--;v.body=null;}else this.grid.delete(key(v.gx,v.gy,v.gz));
    this.burning.delete(v.id);this.changed.add(v.id);this.dirtyBuildings.add(v.building);this.destroyed++;
    this.events.push({type:'debris',x:v.x,y:v.y,z:v.z,mat:v.mat,color:v.color??MATERIALS[v.mat].color,reason});
  }
  ignite(v){if(!v.alive||!MATERIALS[v.mat].fuel||this.burning.has(v.id))return;v.burn=.001;this.burning.add(v.id);this.changed.add(v.id);this.ignited++;}
  carve(x,y,z,r){
    let n=0;
    for(let iz=Math.max(0,Math.floor((z-r+200)/4));iz<=Math.min(this.size-1,Math.floor((z+r+200)/4));iz++)for(let ix=Math.max(0,Math.floor((x-r+200)/4));ix<=Math.min(this.size-1,Math.floor((x+r+200)/4));ix++){
      const wx=ix*4-198,wz=iz*4-198,d2=(wx-x)**2+(wz-z)**2;if(d2>r*r)continue;
      const i=iz*this.size+ix,old=this.heights[i];if(!old)continue;
      const bottom=y-Math.sqrt(r*r-d2);if(y+Math.sqrt(r*r-d2)<old*4-4)continue;
      const h=clamp(Math.floor(bottom/4),0,old);if(h<old){this.heights[i]=h;n+=old-h;}
    }
    if(n){this.collapse.recheck=true;this.excavated+=n;this.terrainDirty=true;for(const b of this.buildings)if(Math.hypot(b.x-x,b.z-z)<r+36)this.dirtyBuildings.add(this.buildings.indexOf(b));}
    return n;
  }
  strikeHuman(h){
    if(h.struckAt!==null)return;
    h.struckAt=this.tickTime;
    h.panic=0;
    for(const other of this.humans){
      if(other.struckAt===null&&Math.abs(other.y-h.y)<5)this.fleeFrom(other,h.x,h.z,12);
    }
  }
  fleeFrom(h,x,z,radius){
    const dx=h.x-x,dz=h.z-z,distance=Math.hypot(dx,dz);
    if(distance>=radius)return;
    h.panic=9;h.dx=distance?dx/distance:1;h.dz=distance?dz/distance:0;
  }
  strikeAlongBeam(from,to){
    const dx=to.x-from.x,dy=to.y-from.y,dz=to.z-from.z,lengthSq=dx*dx+dy*dy+dz*dz;
    if(!lengthSq)return;
    for(const h of this.humans){
      if(h.struckAt!==null)continue;
      const x=h.x-from.x,y=h.y+.9-from.y,z=h.z-from.z;
      const t=(x*dx+y*dy+z*dz)/lengthSq;
      if(t<0||t>1)continue;
      const radius=.85+1.25*t; // Beam widens towards its visible impact point.
      if((x-dx*t)**2+(y-dy*t)**2+(z-dz*t)**2<=radius*radius)this.strikeHuman(h);
    }
  }
  impact(x,y,z,r=5,power=42,effect=null){
    this.shots++;
    this.nearby(x,y,z,r+2,v=>{const d=Math.hypot(v.x-x,v.y-y,v.z-z);if(d>r+1)return;const strength=power*Math.max(.15,1-d/(r+2));this.damage(v,strength);v.heat+=strength*.9;if(v.alive&&v.heat>MATERIALS[v.mat].ignition)this.ignite(v);});
    this.carve(x,y,z,r*.9);
    for(const h of this.humans){
      if(h.struckAt!==null)continue;
      if(Math.hypot(h.x-x,h.y+.9-y,h.z-z)<=r)this.strikeHuman(h);
      else this.fleeFrom(h,x,z,65);
    }
    this.events.push({type:'impact',x,y,z,r,effect});
  }
  checkSupport(){
    for(const id of this.dirtyBuildings)this.collapse.inspect(id);
    this.dirtyBuildings.clear();
  }
  tick(dt,player,flybyVelocity, activeDefense='all'){
    this.tickTime+=dt;this.supportClock+=dt;
    for(const id of [...this.burning]){
      const v=this.blocks[id],m=MATERIALS[v.mat];v.burn+=dt;
      this.damage(v,dt*3.5,'fire');
      if(!v.alive)continue;
      if(v.burn>=m.fuel){this.remove(v,'fire');continue;}
      this.nearby(v.x,v.y,v.z,3.6,u=>{if(u.id===id||Math.hypot(v.x-u.x,v.y-u.y,v.z-u.z)>3.6)return;u.heat+=m.spread*dt;if(u.heat>MATERIALS[u.mat].ignition)this.ignite(u);});
    }
    if(this.supportClock>.6){this.supportClock=0;this.checkSupport();}
    this.collapse.step(dt);
    const flightSpeed=flybyVelocity?Math.hypot(flybyVelocity.x,flybyVelocity.z):0;
    const headingX=flightSpeed?flybyVelocity.x/flightSpeed:0,headingZ=flightSpeed?flybyVelocity.z/flightSpeed:0;
    for(const h of this.humans){
      if(h.struckAt!==null)continue;
      h.phase+=dt*9;
      if(player&&flybyVelocity&&flightSpeed>8&&Math.abs(player.y-h.y)<18){
        const rx=h.x-player.x,rz=h.z-player.z;
        const ahead=rx*headingX+rz*headingZ,side=rz*headingX-rx*headingZ;
        if(ahead>0&&ahead<Math.min(34,flightSpeed*.9)&&Math.abs(side)<8){
          const sign=Math.sign(side)||1;
          h.dx=-headingZ*sign;h.dz=headingX*sign;h.panic=Math.max(h.panic,1.3);
        }
      }else if(player&&!flybyVelocity&&Math.hypot(player.x-h.x,player.z-h.z)<22&&player.y-h.y<25){h.panic=Math.max(h.panic,1);const d=Math.hypot(h.x-player.x,h.z-player.z)||1;h.dx=(h.x-player.x)/d;h.dz=(h.z-player.z)/d;}
      h.panic=Math.max(0,h.panic-dt);const scale=h.panic>0?1:.12;
      const dx=h.panic>0?h.dx:Math.sin(h.phase*.12),dz=h.panic>0?h.dz:Math.cos(h.phase*.17);
      const nx=h.x+dx*h.speed*scale*dt,nz=h.z+dz*h.speed*scale*dt;
      if(this.terrainHeight(nx,nz)>=4&&!this.solidAt(nx,h.y+2,nz)){h.x=nx;h.z=nz;}else{h.dx=-h.dz;h.dz=dx;}
      h.y=this.terrainHeight(h.x,h.z);
    }
    if(player)for(const d of this.defenders){
      if(!d.alive)continue;
      d.alive=d.support ? d.support.alive && !d.support.loose : this.buildings[d.building].blocks.some(n=>this.blocks[n].alive)&&this.terrainHeight(d.x,d.z)>=d.y-3;
      if(!d.alive || (activeDefense!=='all' && activeDefense!==d.type))continue;
      d.cooldown-=dt;
      if(d.cooldown<=0&&Math.hypot(d.x-player.x,d.z-player.z)<175&&player.y<150){d.cooldown=d.type==='mage'?4.2:6;d.fired++;this.events.push({type:'shot',kind:d.type,x:d.x,y:d.y+2,z:d.z,target:{x:player.x,y:player.y,z:player.z}});}
    }
  }
  drainEvents(){const a=this.events;this.events=[];return a;}
  getStats(){return {blocks:this.blocks.length,destroyed:this.destroyed,excavated:this.excavated,burning:this.burning.size,ignited:this.ignited,panicking:this.humans.filter(h=>h.panic>0).length,defenders:this.defenders.filter(d=>d.alive).length};}
}
