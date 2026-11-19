import * as THREE from '../vendor/three.module.js';

// Use separate engage/release thresholds so stick jitter or a held key cannot count twice.
export class DoubleTap {
  reset(){this.held=0;this.previous=0;this.time=-Infinity;}
  constructor(){this.reset();}
  sample(axis,time){
    if(Math.abs(axis)<.22){this.held=0;return 0;}
    if(Math.abs(axis)<.52)return 0;
    const direction=Math.sign(axis);
    if(direction===this.held)return 0;
    this.held=direction;
    const matched=direction===this.previous && time-this.time<=320;
    this.previous=matched?0:direction;this.time=time;
    return matched?direction:0;
  }
}

const durations={loop:1.65, flip:1.45, step:.32};
const stepDistance=6;

export class FlightManeuver {
  constructor(kind,position,yaw,speed,side){
    this.kind=kind;this.origin=position.clone();this.startYaw=yaw;this.entrySpeed=speed;
    this.side=side;this.duration=durations[kind];this.time=0;
    this.forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    this.right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    this.radius=Math.min(Math.max(3,speed*this.duration/(2*Math.PI)),(240-position.y)/2);
  }
  get collisionSampleSpeed(){
    // Smoothstep's maximum slope is 1.5 at the midpoint.
    if(this.kind==='step')return Math.hypot(this.entrySpeed,1.5*stepDistance/this.duration);
    return Math.max(14,this.entrySpeed+4);
  }
  get progress(){return this.time/this.duration;}
  heading(t){return this.startYaw+(this.kind==='flip'?this.side*Math.PI*THREE.MathUtils.smoothstep(t,.19,.53):0);}
  cameraHeading(t){return this.startYaw+(this.kind==='flip'?this.side*Math.PI*THREE.MathUtils.smoothstep(t,.13,1):0);}
  orbitWeight(t){return Math.sin(Math.PI*t)**2;}
  orbitOffset(t,chaseRadius,out){
    // Launch along the actual camera boom, including any lag from banking.
    const entry=this.cameraOffset;
    const entryAngle=Math.atan2(entry.x,entry.z)-this.startYaw;
    const settle=THREE.MathUtils.smoothstep(t,0,.38);
    const angle=this.cameraHeading(t)+(1-settle)*Math.atan2(Math.sin(entryAngle),Math.cos(entryAngle));
    const weight=this.orbitWeight(t);
    const base=THREE.MathUtils.lerp(Math.hypot(entry.x,entry.z),chaseRadius,settle);
    const radius=THREE.MathUtils.lerp(base,10,weight);
    const height=THREE.MathUtils.lerp(THREE.MathUtils.lerp(entry.y,5.6,settle),1.25,weight);
    return out.set(Math.sin(angle)*radius,height,Math.cos(angle)*radius);
  }
  point(t,out){
    out.copy(this.origin);
    if(this.kind==='step'){
      out.addScaledVector(this.forward,this.entrySpeed*this.duration*t);
      out.addScaledVector(this.right,this.side*stepDistance*THREE.MathUtils.smoothstep(t,0,1));
    }else if(this.kind==='loop'){
      const angle=t*2*Math.PI;
      out.addScaledVector(this.forward,this.radius*Math.sin(angle));
      out.y+=this.radius*(1-Math.cos(angle));
    }else{
      out.addScaledVector(this.forward,this.entrySpeed*this.duration*t*(1-t));
      out.addScaledVector(this.right,-this.side*Math.min(2.5,this.entrySpeed*.08)*THREE.MathUtils.smoothstep(t,.15,.65));
    }
    return out;
  }
}
