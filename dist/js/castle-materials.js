import * as THREE from '../vendor/three.module.js';

export const Finish={plain:0,stone:1,post:2,beam:3,rafter:4,roof:5,ridge:6};

export function cellFinish(world,b){
  if(b.building===world.entranceBuilding){
    if(b.mat===1 && b.gy<10)return Finish.stone;
    if(b.mat===0)return b.gy<17?Finish.post:Finish.beam;
    if(b.mat===2)return Finish.roof;
  }
  // The stone courses of the southern curtain wall on either side of the gate.
  if(b.gz===30 && Math.abs(b.gx)>=7 && b.gy<11 && b.mat===1)return Finish.stone;
  return Finish.plain;
}

let textures;
export function castleTextures(){
  if(textures)return textures;
  const loader=new THREE.TextureLoader();
  function load(file,repeat=true){
    const map=loader.load(new URL('../assets/otemon/'+file,import.meta.url).href);
    map.colorSpace=THREE.SRGBColorSpace;
    map.magFilter=THREE.NearestFilter;
    map.minFilter=THREE.LinearMipmapLinearFilter;map.anisotropy=4;
    if(repeat)map.wrapS=map.wrapT=THREE.RepeatWrapping;
    return map;
  }
  textures={fieldstone:load('fieldstone.png'),lacquer:load('lacquer.png'),endgrain:load('endgrain.png'),
    pantile:load('pantile.png'),soffit:load('soffit.png'),approach:load('approach.webp',false),bank:load('bank.png')};
  return textures;
}

export function finishTerrain(material){
  const {approach,bank}=castleTextures();
  material.onBeforeCompile=shader=>{
    shader.uniforms.approach={value:approach};shader.uniforms.bank={value:bank};
    shader.vertexShader='attribute float groundFace; varying vec3 groundUV; varying vec2 bankUV;\n'+shader.vertexShader.replace(
      '#include <begin_vertex>',`#include <begin_vertex>
      groundUV=vec3((position.x+56.0)/112.0,(112.0-position.z)/176.0,groundFace);
      bankUV=vec2(abs(normal.x)>.5?position.z:position.x,position.y)/vec2(8.,4.);`);
    shader.fragmentShader='varying vec3 groundUV; varying vec2 bankUV; uniform sampler2D approach,bank;\n'+shader.fragmentShader.replace(
      '#include <color_fragment>',`#include <color_fragment>
      if(groundUV.z>1.5)diffuseColor.rgb=texture2D(bank,bankUV).rgb;
      else if(groundUV.z>.5 && all(greaterThan(groundUV.xy,vec2(0))) && all(lessThan(groundUV.xy,vec2(1)))){
        vec4 paint=texture2D(approach,groundUV.xy);
        diffuseColor.rgb=mix(diffuseColor.rgb,paint.rgb,paint.a);
      }`);
  };
}

function surfaceAttributes(geometry,origins){
  geometry.setAttribute('originalCell',new THREE.InstancedBufferAttribute(new Float32Array(origins),4));
}

// Detail instances are scaled and tilted within their owner cell. Store their rest
// transform separately from the animated instanceMatrix so stone and wood never swim.
export function detailCoordinates(geometry,pieces,world){
  const origins=[],offsets=[],scales=[],cracks=[];
  for(const piece of pieces){
    const b=world.blocks[piece.owner],m=piece.local.elements;
    origins.push(b.x,b.y,b.z,piece.finish);offsets.push(m[12],m[13],m[14]);
    scales.push(m[0],Math.hypot(m[5],m[6]),Math.hypot(m[9],m[10]),Math.atan2(m[6],m[5]));
    cracks.push(0);
  }
  surfaceAttributes(geometry,origins);
  geometry.setAttribute('pieceOffset',new THREE.InstancedBufferAttribute(new Float32Array(offsets),3));
  geometry.setAttribute('piecePose',new THREE.InstancedBufferAttribute(new Float32Array(scales),4));
  geometry.setAttribute('crackTile',new THREE.InstancedBufferAttribute(new Float32Array(cracks),1).setUsage(THREE.DynamicDrawUsage));
}

export function cellCoordinates(geometry,world){
  const origins=[];
  for(const b of world.blocks)origins.push(b.x,b.y,b.z,cellFinish(world,b));
  surfaceAttributes(geometry,origins);
}

const varyings=`
  varying vec3 restP;
  varying vec3 restN;
  varying float finish;
`;
const sampleFinish=`
  uniform sampler2D fieldstone,lacquer,endgrain,pantile,soffit;
  vec3 gateColor(){
    vec3 p=restP, n=abs(normalize(restN));
    int kind=int(floor(finish+.5));
    if(kind==1){
      vec2 wallUV=n.y>.6?p.xz:(n.x>.6?vec2(p.z,p.y):p.xy);
      return texture2D(fieldstone,wallUV/vec2(12.,8.)).rgb;
    }
    if(kind>=5){
      if(kind==5 && restN.y<-.52)return texture2D(soffit,p.xz/vec2(2.,4.)).rgb;
      return texture2D(pantile,vec2(p.x*.5,(p.z+.12*p.y)*.72)).rgb;
    }
    bool post=kind==2,beam=kind==3;
    bool end=post?n.y>.7:(beam?n.x>.7:n.z>.7);
    if(end)return texture2D(endgrain,vMapEnd).rgb;
    if(!post && restN.y<-.7)return texture2D(soffit,(beam?p.zx:p.xz)/vec2(2.,4.)).rgb;
    vec2 grain=post?vec2(n.x>.6?p.z:p.x,p.y):(beam?vec2(n.y>.6?p.z:p.y,p.x):vec2(n.y>.6?p.x:p.y,p.z));
    vec3 wood=texture2D(lacquer,grain/vec2(2.7,5.1)).rgb;
    if(kind==4)return wood*vec3(.69,.90,.97);
    float edge=post?(n.x>.6?abs(abs(p.z-60.)-3.):min(abs(abs(p.x)-9.),abs(abs(p.x)-13.))):min(abs(p.y-34.),abs(p.y-36.));
    vec2 chip=floor(grain*12.);
    float rubbed=fract(sin(dot(chip,vec2(18.37,63.71)))*4192.7);
    if(edge<.12 && rubbed>.57)return mix(wood,vec3(.36,.19,.092),.78);
    return wood;
  }
`;

// Paint is composed underneath the existing damage atlas. vMapUv still addresses
// the damage stage while grain direction and mortar use their own coordinates.
export function finishGateMaterial(material,detail=false){
  const maps=castleTextures();
  material.customProgramCacheKey=()=>detail?'otemon-detail-v1':'otemon-cell-v1';
  material.onBeforeCompile=shader=>{
    for(const name of ['fieldstone','lacquer','endgrain','pantile','soffit'])shader.uniforms[name]={value:maps[name]};
    const coordinates=detail?`
      float c=cos(piecePose.w),s=sin(piecePose.w);
      mat3 tilt=mat3(1,0,0, 0,c,s, 0,-s,c);
      vec3 relative=pieceOffset+tilt*(position*piecePose.xyz);
      restN=tilt*normal;`:`vec3 relative=position;restN=normal;`;
    shader.vertexShader=varyings+'varying vec2 vMapEnd; attribute vec4 originalCell; attribute float crackTile;\n'+
      (detail?'attribute vec3 pieceOffset; attribute vec4 piecePose;\n':'')+
      shader.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
        ${coordinates}
        restP=originalCell.xyz+relative;finish=originalCell.w;vMapEnd=uv;
        vec2 crackUV=uv;
        ${detail?`vec3 norm=abs(restN);
          vec2 face=norm.y>.65?relative.xz:(norm.x>.65?relative.zy:relative.xy);
          crackUV=clamp(face*.5+.5,.0,1.);`:''}
        vMapUv=(vec2(mod(crackTile,4.),floor(crackTile/4.))+mix(vec2(.02),vec2(.98),crackUV))/vec2(4.,12.);`);
    shader.fragmentShader=varyings+'varying vec2 vMapEnd;\n'+sampleFinish+shader.fragmentShader.replace(
      '#include <color_fragment>',`#include <color_fragment>
      if(finish>.5)diffuseColor.rgb*=gateColor();`).replace(
      '#include <emissivemap_fragment>',`#include <emissivemap_fragment>
      // Warm reflected light inside the deep overhang keeps the timber legible.
      if(finish>2.5 && finish<5.5 && restN.y<-.52)totalEmissiveRadiance+=diffuseColor.rgb*.19;`);
  };
}
