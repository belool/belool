import * as THREE from 'three';
import { clamp, lerp } from '../core/util.js';

// ================================================================
// WEATHER — ciclo dia/noite (sol, lua, céu em gradiente, estrelas),
// neblina, chuva, tempestade com relâmpagos e lanterna/postes.
// ================================================================

export const WEATHER_TYPES = {
  clear: { name: 'Limpo', fog: 0.0025, rain: 0, wind: 0.2, cloud: 0.1 },
  fog: { name: 'Neblina', fog: 0.02, rain: 0, wind: 0.1, cloud: 0.5 },
  rain: { name: 'Chuva', fog: 0.009, rain: 0.7, wind: 0.5, cloud: 0.8 },
  storm: { name: 'Tempestade', fog: 0.012, rain: 1, wind: 1, cloud: 1, lightning: true },
};

const SKY_VS = `varying vec3 vW; void main(){ vW = (modelMatrix*vec4(position,1.0)).xyz; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position.z = gl_Position.w; }`;
const SKY_FS = `
uniform vec3 top; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunColor; uniform float stars; uniform float flash; uniform vec3 camPos;
uniform float cloud; uniform float time; uniform float day;
varying vec3 vW;
float hash(vec3 p){ return fract(sin(dot(p, vec3(12.9898,78.233,45.164)))*43758.5453); }
float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float n2(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
  return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
float fbm(vec2 p){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * n2(p); p = p * 2.03 + 17.1; a *= 0.5; } return v; }
void main(){
  vec3 d = normalize(vW - camPos);
  float h = clamp(d.y*1.4+0.15, 0.0, 1.0);
  vec3 col = mix(bottom, top, h);
  float s = max(dot(d, sunDir), 0.0);
  col += sunColor * (pow(s, 600.0)*3.0 + pow(s, 8.0)*0.25);
  if (stars > 0.0 && d.y > 0.0) {
    vec3 q = floor(d*220.0);
    float st = step(0.9975, hash(q));
    col += vec3(st*stars*(0.6+0.4*hash(q+1.0)));
  }
  // nuvens procedurais (projeção plana sobre o céu, vento lento)
  if (d.y > 0.0) {
    vec2 uv = d.xz / (d.y + 0.12) * 0.55 + vec2(time * 0.006, time * 0.002);
    float n = fbm(uv);
    float cov = 0.25 + cloud * 0.55;
    float c = smoothstep(1.0 - cov, 1.0 - cov + 0.28, n) * smoothstep(0.0, 0.18, d.y);
    float lit = 0.55 + 0.45 * max(dot(normalize(vec3(sunDir.x, 0.0, sunDir.z) + 0.0001), normalize(vec3(d.x, 0.0, d.z))), 0.0);
    vec3 cc = mix(vec3(0.06, 0.07, 0.09), mix(vec3(0.62, 0.64, 0.68), vec3(1.0, 0.98, 0.95), lit), day);
    cc = mix(cc, cc * vec3(0.55, 0.57, 0.62), cloud * 0.6);
    cc += sunColor * pow(max(dot(d, sunDir), 0.0), 12.0) * 0.6;
    col = mix(col, cc, c * 0.92);
  }
  col += vec3(flash);
  gl_FragColor = vec4(col, 1.0);
}`;

export class Weather {
  constructor(game) {
    this.game = game;
    const scene = game.scene;
    this.time = 12; this.timeSpeed = 0; // horas por segundo real
    this.type = 'clear';
    this.cfg = WEATHER_TYPES.clear;
    this.fog = new THREE.FogExp2(0x9fb4c8, 0.004);
    scene.fog = this.fog;
    this.hemi = new THREE.HemisphereLight(0xbfd8ff, 0x4a4030, 0.6);
    scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xffffff, 2.2);
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -60; sc.right = 60; sc.top = 60; sc.bottom = -60; sc.near = 1; sc.far = 300;
    this.sun.shadow.bias = -0.0004; this.sun.shadow.normalBias = 0.04;
    scene.add(this.sun); scene.add(this.sun.target);
    this.skyMat = new THREE.ShaderMaterial({
      vertexShader: SKY_VS, fragmentShader: SKY_FS, side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { cloud: { value: 0.1 }, time: { value: 0 }, day: { value: 1 }, top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() }, sunDir: { value: new THREE.Vector3() }, sunColor: { value: new THREE.Color() }, stars: { value: 0 }, flash: { value: 0 }, camPos: { value: new THREE.Vector3() } },
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(900, 24, 12), this.skyMat);
    this.sky.renderOrder = -10; this.sky.frustumCulled = false;
    scene.add(this.sky);
    // Chuva: segmentos de linha reciclados em volta da câmera
    this.rainN = 3000;
    const rp = new Float32Array(this.rainN * 6);
    this.rainPos = rp;
    const rg = new THREE.BufferGeometry();
    this.rainAttr = new THREE.BufferAttribute(rp, 3).setUsage(THREE.DynamicDrawUsage);
    rg.setAttribute('position', this.rainAttr);
    this.rain = new THREE.LineSegments(rg, new THREE.LineBasicMaterial({ color: 0xaabbcc, transparent: true, opacity: 0.35 }));
    this.rain.frustumCulled = false; this.rain.visible = false;
    scene.add(this.rain);
    this.rainSeed = new Float32Array(this.rainN * 3);
    for (let i = 0; i < this.rainN; i++) { this.rainSeed[i * 3] = Math.random() * 60 - 30; this.rainSeed[i * 3 + 1] = Math.random() * 30; this.rainSeed[i * 3 + 2] = Math.random() * 60 - 30; }
    this.lightning = 0; this.nextBolt = 5;
    // Lanterna do jogador
    this.flashlight = new THREE.SpotLight(0xfff2dd, 0, 45, 0.45, 0.5, 2);
    this.flashlight.visible = true;
    game.camera.add(this.flashlight);
    this.flashlight.position.set(0.2, -0.15, 0);
    this.flashlight.target.position.set(0, 0, -1);
    game.camera.add(this.flashlight.target);
    this.flashlightOn = false;
    this.lamps = [];
  }

  set(type, time) {
    this.type = type; this.cfg = WEATHER_TYPES[type] || WEATHER_TYPES.clear;
    this.time = time;
    this.rain.visible = this.cfg.rain > 0;
  }

  setLamps(points) {
    for (const l of this.lamps) this.game.scene.remove(l);
    this.lamps = [];
    // Limita luzes dinâmicas por desempenho (mais próximas são reposicionadas)
    this.lampPoints = points;
    for (let i = 0; i < Math.min(6, points.length); i++) {
      const l = new THREE.PointLight(0xffc98a, 0, 26, 2);
      this.game.scene.add(l); this.lamps.push(l);
    }
    // marcadores visuais das lâmpadas
    if (this.lampMesh) this.game.scene.remove(this.lampMesh);
    if (points.length) {
      const im = new THREE.InstancedMesh(new THREE.SphereGeometry(0.25, 8, 6), new THREE.MeshBasicMaterial({ color: 0xffe0b0 }), points.length);
      const m = new THREE.Matrix4();
      points.forEach((p, i) => { m.makeTranslation(p[0], p[1], p[2]); im.setMatrixAt(i, m); });
      this.lampMesh = im; this.game.scene.add(im);
    }
  }

  // Fator de luz do dia (0 noite .. 1 dia)
  daylight() {
    const a = ((this.time - 6) / 12) * Math.PI;
    return clamp(Math.sin(a) * 1.3 + 0.15, 0, 1);
  }

  update(dt, camPos) {
    this.time = (this.time + dt * this.timeSpeed) % 24;
    const day = this.daylight();
    const cfg = this.cfg;
    const a = ((this.time - 6) / 12) * Math.PI;
    const sunDir = new THREE.Vector3(Math.cos(a) * 0.8, Math.sin(a), 0.35).normalize();
    const moonDir = sunDir.clone().multiplyScalar(-1);
    const isDay = sunDir.y > -0.05;
    const lightDir = isDay ? sunDir : moonDir;
    const dusk = clamp(1 - Math.abs(sunDir.y) * 3, 0, 1) * (isDay ? 1 : 0.3);
    const cloud = cfg.cloud;
    // Cores do céu
    const dayTop = new THREE.Color(0x3a78c8), dayBot = new THREE.Color(0xb7d2ea);
    const nightTop = new THREE.Color(0x050914), nightBot = new THREE.Color(0x18233a);
    const duskBot = new THREE.Color(0xff8a4a);
    const top = nightTop.clone().lerp(dayTop, day);
    const bot = nightBot.clone().lerp(dayBot, day).lerp(duskBot, dusk * 0.6 * (1 - cloud));
    const grey = new THREE.Color(0x6b737c).multiplyScalar(0.25 + day * 0.75);
    top.lerp(grey, cloud * 0.8); bot.lerp(grey, cloud * 0.7);
    // Relâmpagos
    if (cfg.lightning) {
      this.nextBolt -= dt;
      if (this.nextBolt <= 0) {
        this.lightning = 1; this.nextBolt = 4 + Math.random() * 10;
        const delay = 300 + Math.random() * 1500;
        setTimeout(() => this.game.audio.play('thunder', null, 0.9), delay);
      }
    }
    this.lightning = Math.max(0, this.lightning - dt * 3);
    const flash = this.lightning > 0 ? (Math.sin(this.lightning * 40) > 0 ? this.lightning : 0) : 0;

    this.skyMat.uniforms.top.value.copy(top);
    this.skyMat.uniforms.bottom.value.copy(bot);
    this.skyMat.uniforms.sunDir.value.copy(sunDir);
    this.skyMat.uniforms.sunColor.value.setRGB(1, 0.85, 0.6).multiplyScalar(isDay ? (1 - cloud * 0.9) : 0);
    this.skyMat.uniforms.stars.value = (1 - day) * (1 - cloud);
    this.skyMat.uniforms.flash.value = flash * 0.6;
    this.skyMat.uniforms.camPos.value.copy(camPos);
    this.skyMat.uniforms.cloud.value = cloud;
    this.skyMat.uniforms.day.value = day;
    this.skyMat.uniforms.time.value = (this.skyMat.uniforms.time.value + dt * 60) % 100000;
    this.sky.position.copy(camPos);

    // Sol / lua
    this.sun.position.copy(camPos).addScaledVector(lightDir, 150);
    this.sun.target.position.copy(camPos);
    const sunCol = new THREE.Color(0xfff1dc).lerp(new THREE.Color(0xff9c5a), dusk);
    if (!isDay) sunCol.setHex(0x8aa4ff);
    this.sun.color.copy(sunCol);
    this.sun.intensity = (isDay ? 2.8 * clamp(sunDir.y * 3, 0, 1) : 0.7 * clamp(moonDir.y * 3, 0, 1)) * (1 - cloud * 0.55) + flash * 3;
    this.hemi.intensity = 0.32 + day * 0.9 + flash * 2;
    this.hemi.color.copy(top).lerp(new THREE.Color(day > 0.3 ? 0xffffff : 0x8fa6d8), 0.55);
    this.hemi.groundColor.setHex(0x4a4234).multiplyScalar(0.45 + day * 0.55);
    // Neblina
    this.fog.color.copy(bot).lerp(grey, 0.3);
    const fogBase = cfg.fog * (this.game.settings?.fogMul ?? 1);
    this.fog.density = fogBase + (1 - day) * 0.004;
    // Chuva
    if (cfg.rain > 0) {
      const n = Math.floor(this.rainN * cfg.rain);
      const rp = this.rainPos;
      const fall = 26 * dt, windX = cfg.wind * 4;
      for (let i = 0; i < this.rainN; i++) {
        if (i >= n) { rp.fill(0, i * 6, i * 6 + 6); continue; }
        let y = this.rainSeed[i * 3 + 1] - fall;
        if (y < 0) y += 30;
        this.rainSeed[i * 3 + 1] = y;
        const x = camPos.x + ((this.rainSeed[i * 3] - camPos.x * 0) % 60);
        const z = camPos.z + this.rainSeed[i * 3 + 2];
        const yy = camPos.y - 8 + y;
        rp[i * 6] = x; rp[i * 6 + 1] = yy; rp[i * 6 + 2] = z;
        rp[i * 6 + 3] = x + windX * 0.04; rp[i * 6 + 4] = yy + 0.5; rp[i * 6 + 5] = z;
      }
      this.rainAttr.needsUpdate = true;
    }
    this.game.audio.setWeather(cfg.rain, cfg.wind);
    // Postes: acendem à noite, só os mais próximos recebem luz real
    const lampOn = day < 0.45;
    if (this.lampPoints && this.lamps.length) {
      const sorted = this.lampPoints.map((p) => [p, (p[0] - camPos.x) ** 2 + (p[2] - camPos.z) ** 2]).sort((a, b) => a[1] - b[1]);
      this.lamps.forEach((l, i) => {
        const p = sorted[i]?.[0];
        if (!p) { l.intensity = 0; return; }
        l.position.set(p[0], p[1] - 0.3, p[2]);
        l.intensity = lampOn ? 160 : 0;
      });
      if (this.lampMesh) this.lampMesh.material.color.setHex(lampOn ? 0xffe0b0 : 0x777766);
    }
    this.flashlight.intensity = this.flashlightOn ? 420 : 0;
    this.dayFactor = day;
  }
  toggleFlashlight() { this.flashlightOn = !this.flashlightOn; this.game.audio.play('ui'); }
}
