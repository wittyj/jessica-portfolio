import * as THREE from './three.module.min.js';
// shared pointer + gyro (normalised -1..1)
export const P={x:0,y:0,tx:0,ty:0};
addEventListener('pointermove',e=>{P.tx=e.clientX/innerWidth*2-1;P.ty=e.clientY/innerHeight*2-1},{passive:true});
let gyroOn=false;
function onOri(e){if(e.gamma==null)return;gyroOn=true;P.tx=Math.max(-1,Math.min(1,e.gamma/25));P.ty=Math.max(-1,Math.min(1,(e.beta-45)/25))}
export function enableGyro(){
  const go=()=>addEventListener('deviceorientation',onOri);
  if(window.DeviceOrientationEvent&&typeof DeviceOrientationEvent.requestPermission==='function'){
    addEventListener('touchend',function f(){DeviceOrientationEvent.requestPermission().then(s=>{if(s==='granted')go()}).catch(()=>{});removeEventListener('touchend',f)},{once:true});
  }else go();
}
(function tick(){P.x+=(P.tx-P.x)*.07;P.y+=(P.ty-P.y)*.07;requestAnimationFrame(tick)})();

// expressive gaze: spring toward raw pointer, idle saccades, blinks
let lastMove=performance.now();addEventListener('pointermove',()=>lastMove=performance.now(),{passive:true});
const GZ={x:0,y:0,vx:0,vy:0,lt:0,sx:0,sy:0,nextS:0,nextB:2,bt:-1,dbl:false};
function gaze(t){const dt=Math.min(.05,t-GZ.lt||.016);GZ.lt=t;
 const idle=performance.now()-lastMove>1400;
 if(idle&&t>GZ.nextS){GZ.sx=(Math.random()-.5)*.7;GZ.sy=(Math.random()-.5)*.35;GZ.nextS=t+.5+Math.random()*1.6}
 if(!idle){GZ.sx*=.9;GZ.sy*=.9}
 const tx=Math.max(-1,Math.min(1,P.tx*1.25+GZ.sx)),ty=Math.max(-1,Math.min(1,P.ty*1.25+GZ.sy));
 const k=idle?260:150,dm=idle?24:17;GZ.vx+=((tx-GZ.x)*k-GZ.vx*dm)*dt;GZ.vy+=((ty-GZ.y)*k-GZ.vy*dm)*dt;GZ.x+=GZ.vx*dt;GZ.y+=GZ.vy*dt;
 if(t>GZ.nextB&&GZ.bt<0){GZ.bt=t;GZ.dbl=Math.random()<.2}
 let b=0;if(GZ.bt>=0){const p=(t-GZ.bt)/.16;b=Math.max(0,p<.5?p*2:2-p*2);if(p>1){if(GZ.dbl){GZ.bt=t+.05;GZ.dbl=false}else{GZ.bt=-1;GZ.nextB=t+2.2+Math.random()*3.5}}}
 return [GZ.x,GZ.y,b]}
export {gaze,GZ};
// Depth-parallax 3D portrait: subdivided plane displaced by depth map + shader parallax, follows mouse/gyro
export function portrait(canvas,{base='../shared/img/',strength=.06,rot=.35,disp=.55,rim='#ff3d6e',bgClear=true,extra,layout,eyes,onFrame}={}){
  const r=new THREE.WebGLRenderer({canvas,antialias:true,alpha:true,powerPreference:'high-performance'});
  r.setPixelRatio(Math.min(devicePixelRatio,2));
  const scene=new THREE.Scene(),cam=new THREE.PerspectiveCamera(32,1,.1,50);cam.position.z=4.2;
  const L=new THREE.TextureLoader();
  const sm=innerWidth<700;
  const tex=L.load(base+(sm?'portrait-sm.webp':'portrait.webp')),dep=L.load(base+'depth.png');
  tex.colorSpace=THREE.SRGBColorSpace;
  const nb=eyes?L.load(base+(sm?'portrait-noiris-sm.webp':'portrait-noiris.webp')):tex;if(eyes)nb.colorSpace=THREE.SRGBColorSpace;
  const em=eyes?L.load(base+'eyemask.png'):tex;
  const u={tex:{value:tex},dep:{value:dep},m:{value:new THREE.Vector2()},s:{value:strength},disp:{value:disp},rim:{value:new THREE.Color(rim)},t:{value:0},nb:{value:nb},em:{value:em},useEye:{value:eyes?(eyes.overlay?2:1):0},ea:{value:new THREE.Vector2(...(eyes?eyes.a:[0,0]))},eb:{value:new THREE.Vector2(...(eyes?eyes.b:[0,0]))},er:{value:eyes?eyes.r:0},eo:{value:new THREE.Vector2()},blink:{value:0}};
  const mat=new THREE.ShaderMaterial({uniforms:u,transparent:true,depthWrite:false,
   vertexShader:`uniform sampler2D dep;uniform float disp;uniform vec2 m;varying vec2 vUv;varying float vD;void main(){vUv=uv;float d=texture2D(dep,uv).r;vD=d;vec3 p=position;p.z+=d*disp;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}`,
   fragmentShader:`uniform sampler2D tex,dep,nb,em;uniform vec2 m,ea,eb,eo;uniform float s,t,er,useEye,blink;uniform vec3 rim;varying vec2 vUv;varying float vD;
   void main(){vec2 uv=vUv;for(int i=0;i<4;i++){float d=texture2D(dep,uv).r;uv=vUv+m*s*(d-.5);}
    vec4 c=texture2D(nb,uv);if(c.a<.02)discard;
    if(useEye>.5){float mk=texture2D(em,uv).r;vec2 asp=vec2(.5625,1.);
      float d0=length((uv-ea)*asp),d1=length((uv-eb)*asp);vec2 ce=d0<d1?ea:eb;
      vec2 q=uv-eo;float da=length((q-ea)*asp),db=length((q-eb)*asp);
      float ir=smoothstep(er*1.18,er*.86,min(da,db));
      float shU=texture2D(em,uv+vec2(0.,er*.6)).r,shD=texture2D(em,uv-vec2(0.,er*.5)).r;
      float shL=texture2D(em,uv+vec2(er*1.1,0.)).r*texture2D(em,uv-vec2(er*1.1,0.)).r;
      vec3 scl=c.rgb*mix(.58,1.,shU*shD)*mix(.8,1.,shL);
      vec3 iris=texture2D(tex,q).rgb*mix(.7,1.,shU);
      vec3 eye=useEye>1.5?scl:mix(scl,iris,ir);
      float top=ce.y+er*1.6;float lid=top-blink*er*2.8;
      float cov=smoothstep(lid-er*.12,lid+er*.12,uv.y);
      vec3 skin=texture2D(tex,vec2(uv.x,top+er*.7)).rgb;
      float lash=1.-.55*smoothstep(er*.35,0.,abs(uv.y-lid))*step(.02,blink);
      eye=mix(eye,skin,cov)*lash;
      c.rgb=mix(texture2D(tex,uv).rgb,eye,mk);}
    float e=texture2D(tex,uv+vec2(.006,0)).a*texture2D(tex,uv-vec2(.006,0)).a*texture2D(tex,uv+vec2(0,.004)).a;
    float rl=(1.-e)*.9*(.6+.4*sin(t*1.5));c.rgb=mix(c.rgb,rim,rl*.5);
    c.rgb*=.92+.18*vD;c.a*=smoothstep(0.,.12,vUv.y);gl_FragColor=c;}`});
  const geo=new THREE.PlaneGeometry(1.6875,3,sm?90:180,sm?160:320);
  const mesh=new THREE.Mesh(geo,mat);const g=new THREE.Group();g.add(mesh);scene.add(g);
  if(extra)extra(scene,g,THREE);
  function size(){const w=canvas.clientWidth,h=canvas.clientHeight;r.setSize(w,h,false);cam.aspect=w/h;cam.updateProjectionMatrix();const fit=w/h<.6?1.15:1;g.scale.setScalar(fit);layout&&layout(w,h,g)}
  addEventListener('resize',size);size();
  let vis=true;new IntersectionObserver(e=>vis=e[0].isIntersecting).observe(canvas);
  const clock=new THREE.Clock();
  (function loop(){requestAnimationFrame(loop);if(!vis)return;const t=clock.getElapsedTime();u.t.value=t;
    u.m.value.set(-P.x,P.y);if(eyes){const g2=gaze(t);if(!eyes.overlay)u.eo.value.set(g2[0]*eyes.sx,-g2[1]*eyes.sy);u.blink.value=g2[2]}g.rotation.y=P.x*rot;g.rotation.x=P.y*rot*.5;g.position.y=(g.userData.y||0)+Math.sin(t*.8)*.03;
    scene.userData.tick&&scene.userData.tick(t);r.render(scene,cam);onFrame&&onFrame({mesh,cam,u,t,canvas})})();
  return {renderer:r,scene,group:g,THREE,mesh,cam,u};
}

// Generic draggable/swipeable controller: calls onMove(pos) with inertia; pos in "items"
export function dragger(el,{count,onMove,sens=.006,snap=true,auto=0}){
  let pos=0,vel=0,drag=false,lx=0,last=performance.now();
  el.style.touchAction='pan-y';
  el.addEventListener('pointerdown',e=>{drag=true;lx=e.clientX;vel=0;window.__mv=0;el.classList.add('grab')});
  addEventListener('pointermove',e=>{if(!drag)return;const dx=e.clientX-lx;window.__mv+=Math.abs(dx);lx=e.clientX;vel=-dx*sens;pos+=vel;last=performance.now()});
  const up=()=>{drag=false;el.classList.remove('grab')};addEventListener('pointerup',up);addEventListener('pointercancel',up);el.addEventListener('dragstart',e=>e.preventDefault());
  el.addEventListener('wheel',e=>{if(Math.abs(e.deltaX)>Math.abs(e.deltaY)){e.preventDefault();pos+=e.deltaX*sens*.5;last=performance.now()}},{passive:false});
  const api={go:n=>{target=n},get pos(){return pos}};let target=null;
  (function loop(){requestAnimationFrame(loop);if(!drag){if(target!=null){pos+=(target-pos)*.12;if(Math.abs(target-pos)<.001)target=null}else{pos+=vel;vel*=.93;if(snap&&Math.abs(vel)<.01){const s=Math.round(pos);pos+=(s-pos)*.08}if(auto&&performance.now()-last>4000)pos+=auto}}onMove(pos)})();
  return api;
}

// Scroll progress per element -> CSS var --p (0 when entering bottom, 1 when leaving top), and .in class
export function scrollFx(sel='[data-p]'){
  const els=[...document.querySelectorAll(sel)];
  function f(){const h=innerHeight;for(const e of els){const b=e.getBoundingClientRect();const p=Math.min(1,Math.max(0,(h-b.top)/(h+b.height)));e.style.setProperty('--p',p.toFixed(4));e.style.setProperty('--q',Math.min(1,Math.max(0,(h-b.top)/(h*.55))).toFixed(4));if(p>.08)e.classList.add('in')}}
  addEventListener('scroll',f,{passive:true});addEventListener('resize',f);f();
}
// 3D tilt on hover for cards
export function tilt(sel,max=12){document.querySelectorAll(sel).forEach(c=>{c.addEventListener('pointermove',e=>{const b=c.getBoundingClientRect();const x=(e.clientX-b.left)/b.width-.5,y=(e.clientY-b.top)/b.height-.5;c.style.transform=`perspective(900px) rotateY(${x*max}deg) rotateX(${-y*max}deg) translateZ(10px)`;c.style.setProperty('--mx',(x+.5)*100+'%');c.style.setProperty('--my',(y+.5)*100+'%')});c.addEventListener('pointerleave',()=>c.style.transform='')})}
// lightbox
export function lightbox(){const lb=document.createElement('div');lb.className='lb';lb.innerHTML='<img alt="">';document.body.append(lb);lb.onclick=()=>lb.classList.remove('on');
 document.addEventListener('click',e=>{const i=e.target.closest('[data-zoom]');if(i&&!(window.__mv>6)){lb.querySelector('img').src=i.dataset.zoom;lb.classList.add('on')}})}
export {THREE};
