import * as THREE from '../vendor/three.module.js';

const size=2.65, pixel=size/96;
const rows=['hover','forward','left','right','ram','recoil','laser'];
// Socket coordinates in the 96px drawings, measured from the top left.
const palm=[[66,21],[70,22],[72,21],[73,22]];
const back={
  hover:[[49,27],[49,26],[49,24],[49,23],[49,23],[49,24],[49,27],[49,27]],
  forward:[48,25], left:[[47,26],[46,26],[44,28],[41,30],[38,32],[37,33],[36,33],[35,33]],
  ram:[[48,26],[46,32],[47,37],[46,41],[46,42],[47,43],[47,43],[47,43]], laser:[47,26]
};

function lightWing(side,material){
  const vertices=[],colors=[];
  // Three separated strokes, curved upward and tapered to bright points.
  for(let feather=0;feather<3;feather++){
    function edge(t,upper){
      const span=1.60-feather*.25;
      const y=(.68-feather*.38)*t+.15*Math.sin(Math.PI*2*t);
      const width=.12*Math.sin(Math.PI*t);
      vertices.push(side*t*span,y+(upper?width:-width),-.12);
      const light=upper?1:.61;
      colors.push(light,light*(.88+.12*t),light*(.68+.32*t));
    }
    for(let i=0;i<8;i++){
      const a=i/8,b=(i+1)/8;
      edge(a,true);edge(a,false);edge(b,true);edge(b,true);edge(a,false);edge(b,false);
    }
  }
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  geo.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  return new THREE.Mesh(geo,material);
}

export class Heroine extends THREE.Group{
  constructor(texture){
    super();
    texture.magFilter=texture.minFilter=THREE.NearestFilter;
    texture.generateMipmaps=false;
    texture.colorSpace=THREE.SRGBColorSpace;
    texture.repeat.set(1/8,1/rows.length);
    this.texture=texture;
    this.body=new THREE.Mesh(new THREE.PlaneGeometry(size,size),new THREE.MeshBasicMaterial({
      map:texture,alphaTest:.5,side:THREE.DoubleSide,toneMapped:false
    }));
    this.add(this.body);
    this.wingMaterial=new THREE.MeshBasicMaterial({color:0xffdf9a,side:THREE.DoubleSide,
      vertexColors:true,transparent:true,opacity:.88,depthWrite:false,toneMapped:false});
    this.wings=new THREE.Group();
    this.left=lightWing(-1,this.wingMaterial);this.right=lightWing(1,this.wingMaterial);
    this.wings.add(this.left,this.right);this.body.add(this.wings);
    this.socket=new THREE.Vector3();
    this.reset();
  }
  reset(){
    this.motion='hover';this.frame=0;this.time=0;this.selectFrame('hover',0);
  }
  setDark(dark){
    this.body.material.color.setHex(dark?0xc4a0db:0xffffff);
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
    if(motion==='laser')frame=attack==='charge'?Math.min(3,Math.floor(actionTime/chargeDuration*4)):4+Math.floor(actionTime/.12)%4;
    else if(motion==='ram')frame=actionTime<.13?Math.min(3,Math.floor(actionTime/.0325)):4+Math.floor((actionTime-.13)/.06)%4;
    else if(motion==='recoil')frame=Math.min(7,Math.floor(actionTime/returnDuration*8));
    else if(motion==='left'||motion==='right')frame=this.time<.20?Math.floor(this.time/.05):4+Math.floor((this.time-.20)/.14)%4;
    else frame=Math.floor(this.time/(motion==='hover'?.20:.13))%8;
    this.selectFrame(motion,frame);
    // The turn and the somersault are drawn into the cels. Supplement only the
    // travel pitch so that independent ascent/descent still changes the attitude.
    this.body.rotation.x=attack==='flight'?pose.rotation.x*.4:0;
    const turning=motion==='left'||motion==='right';
    const sockets=back[motion==='right'?'left':motion];
    this.wings.visible=motion!=='ram'&&motion!=='recoil';
    if(sockets){
      const socket=Array.isArray(sockets[0])?sockets[frame]:sockets;
      this.socket.set((socket[0]-48)*pixel*(motion==='right'?-1:1),(48-socket[1])*pixel,0);
      this.wings.position.copy(this.socket);
    }
    if(this.wings.visible){
      this.wings.rotation.z=turning?Math.sign(bank)*Math.min(1,frame/4)*.44:0;
      const pulse=Math.sin(this.time*3.8)*.07;
      this.left.rotation.z=-pulse;this.right.rotation.z=pulse;
      this.wingMaterial.opacity=attack==='charge'?.76+.21*(actionTime/chargeDuration):.86;
    }
  }
  handPosition(target){
    const [x,y]=palm[Math.max(0,this.frame-4)];
    return this.body.localToWorld(target.set((x-48)*pixel,(48-y)*pixel,.015));
  }
  backPosition(target){return this.body.localToWorld(target.copy(this.socket));}
}
