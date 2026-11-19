// World coordinates are metres; the masonry generators below use 2 m cells.
export const castleGates = {
  gate: {x:0, z:60, halfWidth:9, ceiling:34, next:'court'},
  court: {x:26, z:-8, halfWidth:9, ceiling:36, next:'climb'}
};
export const castleHints = {
  gate:['堀の先、朱の大手門へ','前進を押して、橋の上を低くまっすぐ。'],
  court:['中庭を右へ、青瓦の渡り櫓へ','右前方の青い屋根を目印に。櫓の下をくぐろう。'],
  climb:['天守を左に見て、北の空へ','前進しながら上昇。対地高度36m以上で北の城壁を越えよう。'],
  clear:['白鷺城を飛び抜けた','↻ で再挑戦。城内を自由に飛ぶこともできます。']
};
const ground=16, stone=0x776f66, plaster=0xe5d9be, timber=0x63463d;
const slate=0x335763, copper=0x59838a, cinnabar=0xab4c39, gold=0xdcb267;

export function castleTerrain(x,z,original){
  if(Math.abs(x)>76 || z < -86 || z>86)return original;
  const moat=Math.abs(x)>60 || z < -68 || z>68;
  if(moat && !(z>60 && Math.abs(x)<8))return 0;
  return ground/4;
}

export function courtyardColor(x,z){
  const roadX=26*Math.max(0,Math.min(1,(54-z)/54));
  if(z>=-60 && z<=104 && Math.abs(x-roadX)<6)return 0xcab68f;
  if(Math.abs(x)<55 && z<56 && z>-62)return 0xa4a385;
}

export function buildCastle(world){
  // Each building has its own support graph, just like the destructible town.
  function builder(name,x,z,entrance=false){
    const id=world.building(name,x,z);
    if(entrance)world.entranceBuilding=id;
    return (dx,level,dz,material,color)=>world.addBlock(x/2+dx,ground/2+level,z/2+dz,material,id,color);
  }
  function deck(put,y,rx,rz,material,color){
    for(let x=-rx;x<=rx;x++)for(let z=-rz;z<=rz;z++)put(x,y,z,material,color);
  }
  function keep(name,x,z,width,depth,tiers){
    const put=builder(name,x,z);
    let y=0;
    for(let tier=0;tier<tiers;tier++){
      const rx=width-tier*2, rz=depth-tier*2;
      const floors=tier===0?7:5;
      for(let level=0;level<floors;level++,y++){
        for(let dx=-rx;dx<=rx;dx++)for(let dz=-rz;dz<=rz;dz++){
          if(Math.abs(dx)!==rx && Math.abs(dz)!==rz)continue;
          const foundation=tier===0 && level<3;
          const lattice=level===floors-2 && (Math.abs(dx)+Math.abs(dz))%3!==0;
          put(dx,y,dz,lattice?0:1,foundation?stone:lattice?timber:plaster);
        }
      }
      deck(put,y++,rx+1,rz+1,2,slate);
      deck(put,y++,rx,rz,2,copper);
    }
    const capWidth=width-(tiers-1)*2,capDepth=depth-(tiers-1)*2;
    for(let i=1;i<=capDepth;i++)deck(put,y++,Math.max(1,capWidth-i),capDepth-i,2,slate);
    const tip=Math.max(1,capWidth-capDepth);
    for(const dx of [-tip,tip])put(dx,y,0,2,gold);
  }
  function gatehouse(name,gate,color,roof){
    const entrance=gate===castleGates.gate;
    const put=builder(name,gate.x,gate.z,entrance);
    const lintel=(gate.ceiling-ground)/2;
    for(let y=0;y<lintel;y++)for(let z=-2;z<=2;z++)for(const x of [-6,-5,5,6]){
      // The main gate has two exposed timber piers on wider stone plinths.
      if(entrance && y>=2 && Math.abs(z)>1)continue;
      put(x,y,z,y<2?1:0,y<2?stone:color);
    }
    for(let y=lintel;y<lintel+3;y++)deck(put,y,7,2,y===lintel?0:1,y===lintel?color:plaster);
    deck(put,lintel+3,8,3,2,roof);
    deck(put,lintel+4,7,2,2,roof);
    deck(put,lintel+5,6,1,2,roof);
  }

  gatehouse('朱の大手門',castleGates.gate,cinnabar,0x8e4940);
  gatehouse('青瓦の渡り櫓',castleGates.court,timber,copper);
  keep('白鷺天守',-12,-34,8,6,3);
  for(const x of [-46,46])for(const z of [-52,44])keep('隅櫓',x,z,4,3,2);

  const wall=builder('白鷺城の城壁',0,0);
  function wallColumn(x,z){
    for(let y=0;y<5;y++)wall(x,y,z,1,y<3?stone:plaster);
    wall(x,5,z,2,slate);
  }
  for(let x=-28;x<=28;x++){
    wallColumn(x,-32);
    if(Math.abs(x)>6)wallColumn(x,30);
  }
  for(let z=-31;z<30;z++)for(const x of [-28,28])wallColumn(x,z);
}
