// Voxel connectivity is measured in the original grid. A moving component
// shares one pivot, roll angle and velocity; only contacts need material tests.
const sides=[[1,0,0],[-1,0,0],[0,1,0],[0,-1,0],[0,0,1],[0,0,-1]];
const gridKey=(x,y,z)=>x+','+y+','+z;

function groups(blocks){
  const cells=new Map(blocks.map(v=>[gridKey(v.gx,v.gy,v.gz),v]));
  const result=[];
  for(const [key,first] of cells){
    const group=[first];cells.delete(key);
    for(let i=0;i<group.length;i++){
      const b=group[i];
      for(const [x,y,z] of sides){
        const n=gridKey(b.gx+x,b.gy+y,b.gz+z),v=cells.get(n);
        if(v){cells.delete(n);group.push(v);}
      }
    }
    result.push(group);
  }
  return result;
}
function center(blocks){
  const c={x:0,y:0,z:0};
  for(const v of blocks){c.x+=v.x;c.y+=v.y;c.z+=v.z;}
  c.x/=blocks.length;c.y/=blocks.length;c.z/=blocks.length;return c;
}
const cross=(a,b,p)=>(b.x-a.x)*(p.z-a.z)-(b.z-a.z)*(p.x-a.x);
function supportEdge(feet,load){
  const corners=[];
  for(const v of feet)for(const dx of [-1,1])for(const dz of [-1,1])corners.push({x:v.x+dx,z:v.z+dz});
  corners.sort((a,b)=>a.x-b.x||a.z-b.z);
  function half(points){
    const hull=[];
    for(const p of points){
      while(hull.length>=2&&cross(hull.at(-2),hull.at(-1),p)<=0)hull.pop();
      hull.push(p);
    }
    hull.pop();return hull;
  }
  const hull=half(corners).concat(half(corners.reverse()));
  let closest=null,distance=Infinity;
  for(let i=0;i<hull.length;i++){
    const a=hull[i],b=hull[(i+1)%hull.length];
    if(cross(a,b,load)>=0)continue;
    const dx=b.x-a.x,dz=b.z-a.z;
    const t=Math.max(0,Math.min(1,((load.x-a.x)*dx+(load.z-a.z)*dz)/(dx*dx+dz*dz)));
    const x=a.x+t*dx,z=a.z+t*dz,d=Math.hypot(load.x-x,load.z-z);
    if(d<distance){distance=d;closest={x,y:feet[0].y+1,z};}
  }
  return distance>.15?closest:null;
}

export class Collapse {
  constructor(world,materials){
    this.world=world;this.materials=materials;this.minBreakDrop=Math.min(...materials.map(m=>m.breakDrop));
    this.moving=new Set();this.resting=new Set();this.cuts=new Map();
    this.shattered=[0,0,0];this.maxDrop=0;this.recheck=false;this.remainder=0;
  }
  damaged(v){
    this.recheck=true;
    if(v.loose){v.body.splitNeeded=true;return;}
    if(!this.cuts.has(v.building))this.cuts.set(v.building,new Set());
    this.cuts.get(v.building).add(v.gy);
  }
  inspect(id){
    const w=this.world;
    const intact=()=>w.buildings[id].blocks.map(i=>w.blocks[i]).filter(v=>v.alive&&!v.loose);
    const grounded=v=>v.y-1<=w.terrainHeight(v.x,v.z)+.2;
    for(const component of groups(intact())){
      if(!component.some(grounded))this.release(component);
    }
    // Only a damaged horizontal section can introduce a new hinge.
    for(const level of [...this.cuts.get(id)||[]].sort((a,b)=>a-b)){
      for(const upper of groups(intact().filter(v=>v.gy>level))){
        if(upper.some(grounded))continue;
        const feet=[];
        for(const v of upper)if(v.gy===level+1){
          const foot=w.blockAtGrid(v.gx,level,v.gz);
          if(foot?.building===id)feet.push(foot);
        }
        if(!feet.length)continue;
        const load=center(upper),pivot=supportEdge(feet,load);
        if(pivot)this.release(upper,pivot,load,feet);
      }
    }
    this.cuts.delete(id);
  }
  release(blocks,pivot=null,load=center(blocks),feet=[]){
    const origin=pivot||load,dx=load.x-origin.x,dz=load.z-origin.z;
    const len=Math.hypot(dx,dz);
    const body={parts:[],x:origin.x,y:origin.y,z:origin.z,ux:len?dx/len:1,uz:len?dz/len:0,
      angle:0,spin:pivot ? .15 : 0,vx:0,vy:0,vz:0,hinged:!!pivot,feet,load,resting:false};
    for(const v of blocks){
      this.world.detach(v);
      this.addPart(body,v);
    }
    this.moving.add(body);return body;
  }
  addPart(body,v){
    body.parts.push({v,x:v.x-body.x,y:v.y-body.y,z:v.z-body.z,baseAngle:v.angle||0});
    v.body=body;v.fallStart=v.y;
  }
  split(b,collection){
    if(!b.splitNeeded)return;
    b.splitNeeded=false;
    const parts=new Map(b.parts.filter(p=>p.v.alive).map(p=>[p.v,p]));
    const components=groups([...parts.keys()]);
    if(components.length>1&&b.hinged)this.freeHinge(b);
    for(let i=0;i<components.length;i++){
      const child=i===0?b:{...b};
      child.parts=components[i].map(v=>{v.body=child;return parts.get(v);});
      if(i)collection.add(child);
    }
  }
  pose(b,p,c,s){
    const along=p.x*b.ux+p.z*b.uz,shift=along*(c-1)+p.y*s;
    return {x:b.x+p.x+b.ux*shift,y:b.y+p.y*c-along*s,z:b.z+p.z+b.uz*shift};
  }
  freeHinge(b){
    // Change the rotation origin to the mass centre, preserving its tangential velocity.
    const q={x:b.load.x-b.x,y:b.load.y-b.y,z:b.load.z-b.z};
    const along=q.x*b.ux+q.z*b.uz,c=Math.cos(b.angle),s=Math.sin(b.angle);
    const mass=this.pose(b,q,c,s);
    b.vx=b.ux*b.spin*(q.y*c-along*s);b.vz=b.uz*b.spin*(q.y*c-along*s);
    b.vy=-b.spin*(q.y*s+along*c);
    for(const p of b.parts){p.x-=q.x;p.y-=q.y;p.z-=q.z;}
    Object.assign(b,mass);b.hinged=false;
  }
  advance(b,dt){
    const w=this.world;
    this.split(b,this.moving);
    b.parts=b.parts.filter(p=>p.v.alive);
    if(!b.parts.length){this.moving.delete(b);return;}
    if(b.hinged){
      if(!b.feet.some(v=>v.alive&&!v.loose)||b.angle>=1.04)this.freeHinge(b);
      else b.spin+=dt*(1.4+1.8*Math.sin(b.angle));
    }
    if(!b.hinged)b.vy-=18*dt;
    const old={x:b.x,y:b.y,z:b.z,angle:b.angle};
    b.x+=b.vx*dt;b.y+=b.vy*dt;b.z+=b.vz*dt;b.angle+=b.spin*dt;
    let fraction=1;const contacts=[];
    const c=Math.cos(b.angle),s=Math.sin(b.angle);
    for(const p of b.parts){
      const next=this.pose(b,p,c,s),foot=p.v.y-1,bottom=next.y-1;
      if(bottom>=foot-1e-8)continue;
      const hit=w.landingSurface(next.x,next.z,foot,bottom,b);
      if(hit===null)continue;
      const t=Math.max(0,Math.min(1,(foot-hit)/(foot-bottom)));
      fraction=Math.min(fraction,t);contacts.push({p,t,height:hit});
    }
    if(contacts.length){
      for(const prop of ['x','y','z','angle'])b[prop]=old[prop]+(b[prop]-old[prop])*fraction;
    }
    const cos=Math.cos(b.angle),sin=Math.sin(b.angle);
    for(const p of b.parts){
      const pos=this.pose(b,p,cos,sin);
      w.moveBlock(p.v,pos);p.v.angle=p.baseAngle+b.angle;
      if(b.angle){p.v.axisX=b.uz;p.v.axisZ=-b.ux;}
    }
    if(!contacts.length)return;
    const touched=contacts.filter(h=>h.t<=fraction+.02);
    // Transfer impact only through the area around each contact. A long fall
    // chips a corner and the adjacent beams without erasing the whole piece.
    for(const {p} of touched){
      const hit=p.v,drop=Math.max(0,hit.fallStart-hit.y);
      this.maxDrop=Math.max(this.maxDrop,drop);
      if(drop+.001<this.minBreakDrop)continue;
      const radius=Math.min(7,1+drop*.31);
      w.nearby(hit.x,hit.y,hit.z,radius,v=>{
        if(v.body!==b||v.fallStart-v.y+.001<this.materials[v.mat].breakDrop)return;
        if((v.x-hit.x)**2+(v.y-hit.y)**2+(v.z-hit.z)**2>radius*radius)return;
        w.remove(v,'landing');this.shattered[v.mat]++;
      });
    }
    const bearing=touched.some(({p})=>p.v.alive);
    b.parts=b.parts.filter(p=>p.v.alive);
    if(!b.parts.length){this.moving.delete(b);return;}
    if(bearing){
      this.moving.delete(b);b.hinged=false;b.resting=true;this.resting.add(b);this.recheck=true;
    }else{
      // The contact layer gave way. Untouched parts are still on the same fall.
      if(b.hinged)this.freeHinge(b);
      b.spin*=.35;b.vx*=.4;b.vz*=.4;b.vy*=.25;
    }
  }
  wakeUnsupported(){
    for(const b of this.resting){
      this.split(b,this.resting);
      b.parts=b.parts.filter(p=>p.v.alive);
      const remains=b.parts.some(({v})=>this.world.landingSurface(v.x,v.z,v.y-.97,v.y-1.08,b)!==null);
      if(remains)continue;
      this.resting.delete(b);
      this.recheck=true;
      if(!b.parts.length)continue;
      // A resting piece can lose its support when the roof beneath burns or breaks.
      b.angle=0;b.spin=0;b.vx=b.vy=b.vz=0;b.resting=false;
      const mid=center(b.parts.map(p=>p.v));Object.assign(b,mid);
      for(const p of b.parts){p.x=p.v.x-mid.x;p.y=p.v.y-mid.y;p.z=p.v.z-mid.z;p.baseAngle=p.v.angle;p.v.fallStart=p.v.y;}
      this.moving.add(b);
    }
  }
  step(dt){
    if(this.recheck){this.recheck=false;this.wakeUnsupported();}
    if(!this.moving.size){this.remainder=0;return;}
    this.remainder+=dt;
    const step=1/60;
    while(this.remainder+1e-9>=step){
      for(const b of this.moving)this.advance(b,step);
      this.remainder-=step;
    }
  }
}
