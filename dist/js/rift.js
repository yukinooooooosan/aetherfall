import * as THREE from '../vendor/three.module.js';

// Copy just the patch beneath the rift, in drawing-buffer pixels, after the world pass.
export class SummonRift {
  constructor(){
    this.texture=new THREE.FramebufferTexture(192,192);
    this.texture.minFilter=this.texture.magFilter=THREE.LinearFilter;
    this.view=new THREE.Scene();this.camera=new THREE.Camera();
    this.point=new THREE.Vector3();this.center=new THREE.Vector3();this.time=1;
    const uniforms=this.uniforms={backdrop:{value:this.texture},screen:{value:new THREE.Vector2()},origin:{value:new THREE.Vector2()},center:{value:new THREE.Vector2()},radius:{value:1},strength:{value:0}};
    const material=new THREE.ShaderMaterial({uniforms,depthTest:false,depthWrite:false,
      vertexShader:`uniform vec2 origin,screen;
      void main(){vec2 pixel=origin+uv*192.; gl_Position=vec4(pixel/screen*2.-1.,0.,1.);}`,
      fragmentShader:`uniform sampler2D backdrop; uniform vec2 origin,center; uniform float radius,strength;
      void main(){vec2 pixel=gl_FragCoord.xy, delta=(pixel-center)/radius; float d=length(delta);
        if(d>=1.)discard;
        float rim=exp(-55.*pow(d-.72,2.));
        vec2 radial=delta/(d+.01);
        vec2 twist=vec2(-radial.y,radial.x)*.35;
        vec2 shift=(radial+twist)*radius*strength*rim*.16;
        vec2 uv=(pixel-origin)/192.;
        vec3 c=texture2D(backdrop,clamp(uv+shift/192.,.003,.997)).rgb;
        c.b=texture2D(backdrop,clamp(uv+shift*1.28/192.,.003,.997)).b;
        float ring=exp(-1800.*pow(d-.74,2.))*(1.-smoothstep(.86,1.,d));
        gl_FragColor=vec4(c+strength*(vec3(.30,.83,1.)*ring+vec3(.10,.06,.18)*rim),1.);}`});
    const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),material);quad.frustumCulled=false;this.view.add(quad);
  }
  start(opening){this.opening=opening;this.time=0;}
  draw(renderer,camera){
    if(this.time>=1)return;
    const u=this.uniforms,screen=renderer.getDrawingBufferSize(u.screen.value);
    if(Math.min(screen.x,screen.y)<192)return;
    const p=this.point.copy(this.center).applyMatrix4(camera.matrixWorldInverse),depth=-p.z;
    if(depth<camera.near)return;
    p.applyMatrix4(camera.projectionMatrix);
    const center=u.center.value.set((p.x+1)*screen.x*.5,(p.y+1)*screen.y*.5);
    if(center.x<0||center.x>screen.x||center.y<0||center.y>screen.y)return;
    const progress=this.opening?this.time:1-this.time;
    u.radius.value=Math.min(85,screen.y*1.25/(2*depth*Math.tan(camera.fov*Math.PI/360)))*(.40+.60*progress);
    u.strength.value=Math.sin(this.time*Math.PI);
    u.origin.value.set(Math.round(THREE.MathUtils.clamp(center.x-96,0,screen.x-192)),Math.round(THREE.MathUtils.clamp(center.y-96,0,screen.y-192)));
    renderer.copyFramebufferToTexture(this.texture,u.origin.value);
    const clear=renderer.autoClear;renderer.autoClear=false;renderer.render(this.view,this.camera);renderer.autoClear=clear;
  }
}
