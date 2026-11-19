import * as THREE from '../vendor/three.module.js';
import {castleGates} from './castle.js?v=gate2';

// The cell carries the joinery with it as the structural solver moves the gate.
export class GateDetails {
  constructor(world,scene){
    this.groups=new Map();
    this.meshes=[];
    this.pose=new THREE.Object3D();
    this.matrix=new THREE.Matrix4();
    this.axis=new THREE.Vector3();
    const building=world.buildings[world.entranceBuilding];
    const batches=[[],[]],part=new THREE.Object3D();
    for(const id of building.blocks){
      const b=world.blocks[id],x=b.x-building.x,z=b.z-building.z;
      const face=Math.sign(z),side=Math.sign(x),absZ=Math.abs(z);
      const level=b.y-castleGates.gate.ceiling;
      const pieces=[];
      const add=(batch,dx,dy,dz,w,h,d,color,tilt=0,cap=false)=>{
        part.position.set(dx,dy,dz);part.rotation.set(tilt,0,0);part.scale.set(w,h,d);part.updateMatrix();
        const piece={batch,index:batches[batch].length,local:part.matrix.clone(),color,cap};
        batches[batch].push(piece);pieces.push(piece);
      };
      if(b.mat===0 && level<0){
        // Straps wrap around each pier, with iron studs on the bridge-facing side.
        const band=level===-13 || level===-3;
        if(absZ===2){
          for(const offset of [-.5,.5]){
            add(0,offset,0,face*.98,.91,2,.13,0x983e29);
            if(band)add(0,offset,0,face*1.12,.13,.13,.12,0xd29c50);
          }
          if(band)add(0,0,0,face*1.04,2,.32,.14,0x402e29);
        }
        if(band)add(0,(Math.abs(x)===10?-side:side)*.99,0,0,.12,.32,2,0x402e29);
      }
      if(b.mat===0 && level===1){
        if(absZ===4){
          add(0,0,.15,face,2,.64,.22,0x763123);
          for(const offset of [-.5,.5])add(0,offset,-.53,face*1.09,.37,.38,.52,0xbf8251);
        }
        for(const offset of [-.5,.5])add(0,offset,-.98,0,.34,.12,2,0x714332);
      }
      if(b.mat===1 && level>0 && absZ===4){
        add(0,0,0,face*.99,2,2,.09,0xe2d5bb);
        if(level===3 && Math.abs(b.gx)%3!==1){
          add(0,0,.17,face*1.06,1.64,1.08,.08,0x534034);
          for(const offset of [-.5,0,.5])add(0,offset,.17,face*1.12,.09,1.08,.09,0xaf8a65);
        }
      }
      if(b.mat===2){
        const edgeDepth=6-(level-7);
        if(absZ===edgeDepth && edgeDepth>0){
          const slope=face*Math.PI/4;
          add(0,0,1.95,0,2,.18,2.98,0x633f39,slope);
          for(const offset of [-.75,-.25,.25,.75]){
            // Cylindrical ridges at a half-metre pitch give the eaves a scalloped edge.
            add(1,offset,2.08,0,.17,3.02,.17,0x995f50,slope+Math.PI/2,true);
          }
        }
        if(level===11 && z===0)add(0,0,2.88,0,2,.33,2.15,0x75473d);
      }
      if(pieces.length)this.groups.set(id,{pieces,x,z,released:false});
    }
    const geometries=[new THREE.BoxGeometry(),new THREE.CylinderGeometry(1,1,1,8)];
    const color=new THREE.Color();
    for(const [i,pieces] of batches.entries()){
      const mesh=new THREE.InstancedMesh(geometries[i],new THREE.MeshLambertMaterial(),pieces.length);
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;
      for(const piece of pieces)mesh.setColorAt(piece.index,color.setHex(piece.color));
      this.meshes.push(mesh);scene.add(mesh);
    }
    for(const id of this.groups.keys())this.update(world.blocks[id]);
  }

  update(block,shed){
    const group=this.groups.get(block.id);
    if(!group)return;
    const angle=block.angle||0;
    this.pose.position.set(block.x,block.y,block.z);
    this.pose.rotation.set(0,0,0);
    if(angle)this.pose.quaternion.setFromAxisAngle(this.axis.set(block.axisX,0,block.axisZ),angle);
    this.pose.scale.setScalar(block.alive?1:0);
    this.pose.updateMatrix();
    const downhill=angle ? -block.axisZ*group.x+block.axisX*group.z : 0;
    const release=block.alive && !group.released && downhill>2 && angle>.22-.005*Math.min(downhill,16);
    for(const piece of group.pieces){
      const mesh=this.meshes[piece.batch];
      if(piece.cap && group.released)continue;
      this.matrix.multiplyMatrices(this.pose.matrix,piece.local);
      if(piece.cap && release){
        // Start at the exposed lip, with the roll of the roof and the pitch of the tile course.
        this.axis.set(0,Math.sign(group.z)*.48,0).applyMatrix4(this.matrix);
        shed(this.axis,block,Math.sign(group.z),piece.color);
        this.matrix.makeScale(0,0,0);
      }
      mesh.setMatrixAt(piece.index,this.matrix);mesh.instanceMatrix.needsUpdate=true;
    }
    if(release)group.released=true;
  }

  dispose(){
    for(const mesh of this.meshes){
      mesh.removeFromParent();mesh.dispose();mesh.geometry.dispose();mesh.material.dispose();
    }
  }
}
