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

export class FlightManeuver {
  constructor(kind,position,yaw,speed,side){
    this.kind=kind;this.origin=position.clone();this.startYaw=yaw;this.entrySpeed=speed;
    this.side=side;this.duration=kind==='loop'?1.65:1.45;this.time=0;
    this.forward=new THREE.Vector3(-Math.sin(yaw),0,-Math.cos(yaw));
    this.right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw));
    this.radius=Math.min(Math.max(3,speed*this.duration/(2*Math.PI)),(240-position.y)/2);
  }
  get progress(){return this.time/this.duration;}
  heading(t){return this.startYaw+(this.kind==='flip'?this.side*Math.PI*THREE.MathUtils.smoothstep(t,.19,.53):0);}
  cameraHeading(t){return this.startYaw+(this.kind==='flip'?this.side*Math.PI*THREE.MathUtils.smoothstep(t,.38,.97):0);}
  point(t,out){
    out.copy(this.origin);
    if(this.kind==='loop'){
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
