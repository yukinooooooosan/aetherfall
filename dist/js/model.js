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
  {name:'木材', color:0x89603e, hp:28, ignition:17, fuel:5.5, spread:12},
  {name:'石材', color:0xc1b69d, hp:100, ignition:Infinity, fuel:0, spread:0},
  {name:'屋根材', color:0x98564b, hp:48, ignition:33, fuel:9, spread:6},
];
export function random(seed=7419) {return ()=> {seed|=0;seed=seed+0x6D2B79F5|0;let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const key=(x,y,z)=>`${x},${y},${z}`;
export class World {
  constructor(seed=7419) {
    this.rng=random(seed);this.size=100;this.cell=4;this.half=200;
    this.heights=new Int16Array(this.size*this.size);this.originalHeights=new Int16Array(this.size*this.size);
    this.blocks=[];this.spatial=new Map();this.grid=new Map();this.buildings=[];this.humans=[];this.defenders=[];
    this.burning=new Set();this.changed=new Set();this.dirtyBuildings=new Set();this.events=[];
    this.destroyed=0;this.excavated=0;this.ignited=0;this.shots=0;this.tickTime=0;this.supportClock=0;this.terrainDirty=true;
    this.generateTerrain();this.generateTown();this.initialBlocks=this.blocks.length;
  }
  generateTerrain(){
    for(let z=0;z<this.size;z++)for(let x=0;x<this.size;x++){
      const wx=x*4-this.half+2,wz=z*4-this.half+2;
      const r=Math.hypot(wx/178,wz/183);
      const wave=Math.sin(wx*.043)*Math.cos(wz*.037)*.55+Math.sin((wx+wz)*.074)*.25;
      let h=r>1+wave*.08?0:Math.max(1,Math.round(1+(1-r)*5+wave));
      h+=Math.round(12*Math.exp(-((wx+57)**2/1500+(wz+119)**2/900)));
      h+=Math.round(7*Math.exp(-((wx-92)**2/800+(wz+86)**2/1200)));
      if(Math.abs(wx)<66&&wz>-84&&wz<94)h=4;
      this.heights[z*this.size+x]=h;
    }
    this.originalHeights.set(this.heights);
  }
  terrainHeight(x,z){const ix=Math.floor((x+this.half)/this.cell),iz=Math.floor((z+this.half)/this.cell);return ix<0||iz<0||ix>=this.size||iz>=this.size?0:this.heights[iz*this.size+ix]*4;}
  addBlock(gx,gy,gz,mat,building,color){
    const k=key(gx,gy,gz);if(this.grid.has(k))return;
    const v={id:this.blocks.length,gx,gy,gz,x:gx*2,y:gy*2+1,z:gz*2,mat,building,color,hp:MATERIALS[mat].hp,heat:0,burn:0,alive:true};
    this.blocks.push(v);this.grid.set(k,v.id);this.buildings[building].blocks.push(v.id);
    const sk=key(Math.floor(v.x/8),Math.floor(v.y/8),Math.floor(v.z/8));
    if(!this.spatial.has(sk))this.spatial.set(sk,[]);this.spatial.get(sk).push(v.id);
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
  generateTown(){
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
    const tower=this.building('青緑の塔',westTower.x,westTower.z);
    const towerBlock=(x,y,z,mat,color)=>this.addBlock(westTower.x/2+x,base+y,westTower.z/2+z,mat,tower,color);
    for(let y=0;y<12;y++)for(let x=-2;x<=2;x++)for(let z=-2;z<=2;z++){
      if(Math.abs(x)===2||Math.abs(z)===2||y===11)towerBlock(x,y,z,1,y===10?0xbb9358:undefined);
    }
    for(let y=0;y<5;y++){
      const radius=Math.max(0,3-y);
      for(let x=-radius;x<=radius;x++)for(let z=-radius;z<=radius;z++)towerBlock(x,12+y,z,2,y===4?0xd6a557:0x2a6875);
    }
    for(let i=0;i<56;i++){
      const x=i<10?(i%2?1:-1)*(2+this.rng()*3):(this.rng()-.5)*110;
      const z=i<10?19+i*7+this.rng()*3:10+this.rng()*82;
      this.humans.push({x,z,y:this.terrainHeight(x,z),homeX:x,homeZ:z,dx:0,dz:0,panic:0,phase:this.rng()*6.28,speed:2.8+this.rng()*1.8});
    }
    for(const [type,x,z] of [['catapult',-54,15],['catapult',54,15],['catapult',-14,90],['mage',-12,-12],['mage',12,-12],['mage',0,42]]){
      const by=this.terrainHeight(x,z),bid=this.building(type==='mage'?'魔導師の祭壇':'投石機',x,z);
      for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)this.addBlock(Math.round(x/2)+a,by/2,Math.round(z/2)+b,type==='mage'?1:0,bid);
      this.defenders.push({type,x,y:by+2,z,cooldown:2+this.rng()*4,alive:true,building:bid,fired:0});
    }
  }
  nearby(x,y,z,r,fn){
    for(let a=Math.floor((x-r)/8);a<=Math.floor((x+r)/8);a++)for(let b=Math.floor((y-r)/8);b<=Math.floor((y+r)/8);b++)for(let c=Math.floor((z-r)/8);c<=Math.floor((z+r)/8);c++){
      for(const id of this.spatial.get(key(a,b,c))||[]){const v=this.blocks[id];if(v.alive)fn(v);}
    }
  }
  remove(v,reason='impact'){
    if(!v.alive)return;v.alive=false;this.burning.delete(v.id);this.changed.add(v.id);this.dirtyBuildings.add(v.building);this.destroyed++;
    this.events.push({type:'debris',x:v.x,y:v.y,z:v.z,mat:v.mat,reason});
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
    if(n){this.excavated+=n;this.terrainDirty=true;for(const b of this.buildings)if(Math.hypot(b.x-x,b.z-z)<r+36)this.dirtyBuildings.add(this.buildings.indexOf(b));}
    return n;
  }
  impact(x,y,z,r=5,power=42){
    this.shots++;
    this.nearby(x,y,z,r+2,v=>{const d=Math.hypot(v.x-x,v.y-y,v.z-z);if(d>r+1)return;const strength=power*Math.max(.15,1-d/(r+2));v.hp-=strength;v.heat+=strength*.9;if(v.hp<=0)this.remove(v);else if(v.heat>MATERIALS[v.mat].ignition)this.ignite(v);});
    this.carve(x,y,z,r*.9);
    for(const h of this.humans){if(Math.hypot(h.x-x,h.z-z)<65){h.panic=9;const d=Math.hypot(h.x-x,h.z-z)||1;h.dx=(h.x-x)/d;h.dz=(h.z-z)/d;}}
    this.events.push({type:'impact',x,y,z,r});
  }
  checkSupport(){
    for(const id of this.dirtyBuildings){const b=this.buildings[id],seen=new Set(),queue=[];
      for(const n of b.blocks){const v=this.blocks[n];if(v.alive&&v.y-1<=this.terrainHeight(v.x,v.z)+.2){queue.push(v);seen.add(n);}}
      for(let i=0;i<queue.length;i++){const v=queue[i];for(const [x,y,z] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]]){const n=this.grid.get(key(v.gx+x,v.gy+y,v.gz+z));if(n===undefined||seen.has(n))continue;const u=this.blocks[n];if(u.alive&&u.building===id){seen.add(n);queue.push(u);}}}
      for(const n of b.blocks)if(this.blocks[n].alive&&!seen.has(n))this.remove(this.blocks[n],'collapse');
    }
    this.dirtyBuildings.clear();
  }
  tick(dt,player,flybyVelocity){
    this.tickTime+=dt;this.supportClock+=dt;
    for(const id of [...this.burning]){
      const v=this.blocks[id],m=MATERIALS[v.mat];v.burn+=dt;v.hp-=dt*3.5;
      if(v.burn>=m.fuel||v.hp<=0){this.remove(v,'fire');continue;}
      this.nearby(v.x,v.y,v.z,3.6,u=>{if(u.id===id||Math.hypot(v.x-u.x,v.y-u.y,v.z-u.z)>3.6)return;u.heat+=m.spread*dt;if(u.heat>MATERIALS[u.mat].ignition)this.ignite(u);});
    }
    if(this.supportClock>.6){this.supportClock=0;this.checkSupport();}
    const flightSpeed=flybyVelocity?Math.hypot(flybyVelocity.x,flybyVelocity.z):0;
    const headingX=flightSpeed?flybyVelocity.x/flightSpeed:0,headingZ=flightSpeed?flybyVelocity.z/flightSpeed:0;
    for(const h of this.humans){
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
      if(this.terrainHeight(nx,nz)>=4&&!this.grid.has(key(Math.round(nx/2),Math.floor(h.y/2)+1,Math.round(nz/2)))){h.x=nx;h.z=nz;}else{h.dx=-h.dz;h.dz=dx;}
      h.y=this.terrainHeight(h.x,h.z);
    }
    if(player)for(const d of this.defenders){
      d.alive=this.buildings[d.building].blocks.some(n=>this.blocks[n].alive)&&this.terrainHeight(d.x,d.z)>=d.y-3;
      if(!d.alive)continue;d.cooldown-=dt;
      if(d.cooldown<=0&&Math.hypot(d.x-player.x,d.z-player.z)<175&&player.y<150){d.cooldown=d.type==='mage'?4.2:6;d.fired++;this.events.push({type:'shot',kind:d.type,x:d.x,y:d.y+2,z:d.z,target:{x:player.x,y:player.y,z:player.z}});}
    }
  }
  drainEvents(){const a=this.events;this.events=[];return a;}
  getStats(){return {blocks:this.blocks.length,destroyed:this.destroyed,excavated:this.excavated,burning:this.burning.size,ignited:this.ignited,panicking:this.humans.filter(h=>h.panic>0).length,defenders:this.defenders.filter(d=>d.alive).length};}
}
