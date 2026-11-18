import * as THREE from '../vendor/three.module.js';

const size=2.65, pixel=size/96;
const rows=['hover','forward','left','right','ram','recoil','laser'];
// Socket coordinates in the 96px drawings, measured from the top left.
const palm=[74,24];
const back={
  hover:[[48,29],[48,28],[48,26],[48,25],[48,25],[48,26],[48,29],[48,29]],
  forward:[[48,26],[48,26],[48,26],[48,27],[48,27],[48,27],[48,26],[48,26]],
  left:[[49,28],[48,28],[45,30],[41,32],[38,34],[36,35],[36,35],[36,35]],
  right:[[47,28],[48,28],[52,30],[56,32],[59,34],[61,35],[61,35],[61,35]],
  ram:[[48,28],[47,33],[47,38],[47,42],[47,44],[47,45],[47,45],[47,45]],
  recoil:[[49,30],[49,32],[49,41],[47,48],[49,49],[52,42],[50,31],[48,28]],
  laser:[[48,28],[48,28],[48,28],[48,28],[47,27],[47,27],[47,27],[47,27]]
};

const sections=10,feathers=3;
class LightWing extends THREE.Mesh{
  constructor(side,material){
    const geometry=new THREE.BufferGeometry();
    super(geometry,material);
    this.side=side;
    const positions=new THREE.Float32BufferAttribute(new Float32Array(feathers*(sections+1)*6),3);
    geometry.setAttribute('position',positions.setUsage(THREE.DynamicDrawUsage));
    const colors=[],indices=[];
    for(let feather=0;feather<feathers;feather++){
      for(let i=0;i<=sections;i++){
        const t=i/sections;
        colors.push(1,.92+.08*t,.8+.2*t, .65,.50+.20*t,.34+.26*t);
        const n=(feather*(sections+1)+i)*2;
        if(i<sections)indices.push(n,n+1,n+2,n+2,n+1,n+3);
      }
    }
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
    geometry.setIndex(indices);
    geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),2.5);
    this.position.set(side*4*pixel,0,.035);
  }
  animate(phase,strength,sweep,laserFold){
    // Swing the casting-side wing down and across into a shorter, lower fan.
    const castingSide=this.side===1;
    const arc=castingSide?Math.PI*laserFold:0;
    const reach=this.side*Math.cos(arc)*(1+(castingSide?-.18:.13)*laserFold);
    const lift=(castingSide?-.65:.22)*laserFold-.46*Math.sin(arc);
    this.position.x=(this.side*4-(castingSide?6:0)*laserFold)*pixel;
    const positions=this.geometry.attributes.position;
    let index=0;
    for(let feather=0;feather<feathers;feather++){
      for(let i=0;i<=sections;i++){
        const t=i/sections;
        // The shoulder leads each stroke. The separate plumes follow with increasing lag.
        const wave=Math.sin(phase-t*1.45-feather*.31);
        const span=(1.48-feather*.21)*(1-.20*sweep);
        const x=reach*t*span*(1-.055*wave*strength);
        const y=t*(.68-feather*.37-.54*sweep+lift)+.15*Math.sin(2*Math.PI*t)+strength*t*(.17+.25*t)*wave;
        const width=.11*Math.sin(Math.PI*t)*(1+.09*wave);
        positions.setXYZ(index++,x,y+width,0);
        positions.setXYZ(index++,x,y-width,0);
      }
    }
    positions.needsUpdate=true;
  }
}

// Each generated wing occupies half the texture. A segmented strip lets the
// shoulder stay planted while the gust travels out to the tip.
class CastingWing extends THREE.Mesh{
  constructor(texture,near){
    const geometry=new THREE.PlaneGeometry(1,1,sections,1);
    super(geometry,new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,
      side:THREE.DoubleSide,toneMapped:false}));
    this.near=near;
    this.renderOrder=near?-2:-3;
    const uv=geometry.attributes.uv;
    for(let i=0;i<uv.count;i++)uv.setY(i,(uv.getY(i)+(near?1:0))*.5);
    geometry.attributes.position.setUsage(THREE.DynamicDrawUsage);
    geometry.boundingSphere=new THREE.Sphere(new THREE.Vector3(),3);
    this.position.set(near?-.14:-.06,near?.09:-.10,.04);
  }
  animate(phase,opacity){
    this.visible=opacity>0;
    if(!this.visible)return;
    this.material.opacity=opacity;
    const near=this.near,span=near?1.84:1.47,height=near?.68:.38;
    const positions=this.geometry.attributes.position;
    for(let i=0;i<=sections;i++){
      const t=1-i/sections;
      const beat=Math.sin(phase-1.5*t+(near?0:-1.2));
      const rise=t*((near?.66:-.70)+(.15+.29*t)*beat);
      const x=-t*span*(1-.055*beat);
      positions.setXYZ(i,x,rise+height*(near?.62:.35),0);
      positions.setXYZ(i+sections+1,x,rise-height*(near?.38:.65),0);
    }
    positions.needsUpdate=true;
  }
}

export class Heroine extends THREE.Group{
  constructor(texture,castingTexture){
    super();
    texture.magFilter=texture.minFilter=THREE.NearestFilter;
    texture.generateMipmaps=false;
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.repeat.set(1/8,1/rows.length);
    this.texture=texture;
    this.body=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({
      map:texture,alphaTest:.5,transparent:true,depthWrite:false,toneMapped:false
    }));
    // Draw the character color, then both kinds of wing; seal the sprite depth
    // afterwards so terrain and unrelated world effects still occlude normally.
    this.body.renderOrder=-4;
    const silhouette=new THREE.Mesh(this.body.geometry,new THREE.MeshBasicMaterial({
      map:texture,alphaTest:.5,transparent:true,colorWrite:false,depthWrite:true
    }));
    silhouette.renderOrder=-1;
    this.body.add(silhouette);
    this.add(this.body);
    this.wingMaterial=new THREE.MeshBasicMaterial({color:0xffdf9a,side:THREE.DoubleSide,
      vertexColors:true,transparent:true,opacity:.88,depthWrite:false,toneMapped:false});
    this.wings=new THREE.Group();
    this.left=new LightWing(-1,this.wingMaterial);this.right=new LightWing(1,this.wingMaterial);
    this.left.renderOrder=this.right.renderOrder=-2;
    this.wings.add(this.left,this.right);this.body.add(this.wings);
    castingTexture.magFilter=castingTexture.minFilter=THREE.NearestFilter;
    castingTexture.generateMipmaps=false;
    castingTexture.colorSpace=THREE.SRGBColorSpace;
    this.nearWing=new CastingWing(castingTexture,true);
    this.farWing=new CastingWing(castingTexture,false);
    this.wings.add(this.nearWing,this.farWing);
    this.socket=new THREE.Vector3();
    this.setDark(false);
    this.reset();
  }
  reset(){
    this.motion='hover';this.frame=0;this.time=0;this.phase=0;this.sweep=0;this.laserFold=0;this.body.position.y=0;this.selectFrame('hover',0);
  }
  setDark(dark){
    this.body.material.color.setHex(dark?0xc4a0db:0xffffff);
    this.nearWing.material.color.setHex(dark?0xe3abff:0xfff6e7);
    this.farWing.material.color.setHex(dark?0xca86ff:0xedc588);
    this.wingMaterial.color.setHex(dark?0xe1a6ff:0xffdf9a);
  }
  selectFrame(motion,frame){
    this.frame=frame;
    this.texture.offset.set(frame/8,1-(rows.indexOf(motion)+1)/rows.length);
  }
  update(dt,camera,pose,attack,actionTime,chargeDuration,returnDuration,horizontalSpeed){
    // The heading belongs to the parent. Keep the drawing facing the chase camera.
    this.quaternion.copy(this.parent.quaternion).invert().multiply(camera.quaternion);
    const bank=pose.rotation.z;
    let motion;
    if(attack==='charge'||attack==='laser')motion='laser';
    else if(attack==='dash')motion='ram';
    else if(attack==='return')motion='recoil';
    else if(Math.abs(bank)>.085)motion=bank>0?'left':'right';
    else motion=horizontalSpeed>2?'forward':'hover';
    this.time=motion===this.motion?this.time+dt:0;
    this.motion=motion;
    let frame;
    if(motion==='laser')frame=attack==='charge'?Math.min(3,Math.floor(actionTime/chargeDuration*4)):4+Math.floor(actionTime/.135)%4;
    else if(motion==='ram')frame=actionTime<.13?Math.min(3,Math.floor(actionTime/.0325)):4+Math.floor((actionTime-.13)/.06)%4;
    else if(motion==='recoil')frame=Math.min(7,Math.floor(actionTime/returnDuration*8));
    else if(motion==='left'||motion==='right')frame=this.time<.20?Math.floor(this.time/.05):4+Math.floor((this.time-.20)/.14)%4;
    else frame=Math.floor(this.time/(motion==='hover'?.20:.13))%8;
    this.selectFrame(motion,frame);
    // The turn and the somersault are drawn into the cels. Supplement only the
    // travel pitch so that independent ascent/descent still changes the attitude.
    this.body.rotation.x=attack==='flight'?pose.rotation.x*.4:0;
    const turning=motion==='left'||motion==='right';
    const [x,y]=back[motion][frame];
    this.socket.set((x-48)*pixel,(48-y)*pixel,0);
    this.wings.position.copy(this.socket);
    this.wings.visible=motion!=='ram';
    const speedFraction=Math.min(1,horizontalSpeed/32);
    const targetSweep=motion==='recoil'?.95:motion==='laser'?.1:speedFraction;
    this.sweep+=(targetSweep-this.sweep)*(1-Math.exp(-dt*8));
    const foldTarget=motion==='laser'?1:0;
    this.laserFold+=THREE.MathUtils.clamp(foldTarget-this.laserFold,-dt/.27,dt/.40);
    const fold=THREE.MathUtils.smoothstep(this.laserFold,0,1);
    this.phase+=dt*(3.9+1.6*this.sweep+1.9*fold+(attack==='charge'?1.8:0));
    const hoverLift=motion==='hover'?.045*Math.sin(this.phase):0;
    this.body.position.y+=(hoverLift-this.body.position.y)*(1-Math.exp(-dt*8));
    if(this.wings.visible){
      const roll=motion==='recoil'?-2*Math.PI*actionTime/returnDuration:turning?Math.sign(bank)*Math.min(1,frame/4)*.44:0;
      this.wings.rotation.z=roll;
      const tuck=motion==='recoil'?1-.56*Math.sin(Math.PI*actionTime/returnDuration):1;
      this.wings.scale.set(tuck,tuck,1);
      const strength=attack==='charge'?.65+.45*actionTime/chargeDuration:motion==='laser'?.44:.95-.35*this.sweep;
      const bias=turning?bank*.24:0;
      this.left.animate(this.phase,strength-bias,this.sweep,fold);
      this.right.animate(this.phase-.48*fold,strength+bias,this.sweep,fold);
      const casting=THREE.MathUtils.smoothstep(fold,.32,.93);
      this.left.visible=this.right.visible=casting<1;
      this.wingMaterial.opacity=(1-casting)*(.86+.055*Math.sin(this.phase-.6));
      this.nearWing.animate(this.phase,casting*.96);
      this.farWing.animate(this.phase,casting*.94);
    }
  }
  handPosition(target){
    const [x,y]=palm;
    return this.body.localToWorld(target.set((x-48)*pixel,(48-y)*pixel,.015));
  }
  backPosition(target){return this.body.localToWorld(target.copy(this.socket));}
}
