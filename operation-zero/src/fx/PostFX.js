import * as THREE from 'three';
import { EffectComposer } from '../../vendor/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from '../../vendor/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from '../../vendor/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from '../../vendor/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from '../../vendor/jsm/postprocessing/OutputPass.js';

// ================================================================
// POST FX — cena (HDR) → arma em 1ª pessoa → bloom (brilho de
// clarões, explosões, luzes) → gradação de cor (contraste, saturação,
// tom por horário, vinheta, granulação, aberração em dano) → saída
// com tone mapping ACES. Desligável nas configurações (celulares).
// ================================================================

const GradeShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, vignette: { value: 0.28 }, saturation: { value: 1.1 }, contrast: { value: 1.06 },
    tint: { value: new THREE.Color(1, 1, 1) }, grain: { value: 0.035 }, hurt: { value: 0 }, flash: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time, vignette, saturation, contrast, grain, hurt, flash; uniform vec3 tint;
    varying vec2 vUv;
    float rnd(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233)) + time) * 43758.5453); }
    void main(){
      vec2 c = vUv - 0.5;
      float ab = 0.002 + hurt * 0.006;
      vec3 col;
      col.r = texture2D(tDiffuse, vUv + c * ab).r;
      col.g = texture2D(tDiffuse, vUv).g;
      col.b = texture2D(tDiffuse, vUv - c * ab).b;
      col *= tint;
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, saturation * (1.0 - hurt * 0.6));
      col = (col - 0.18) * contrast + 0.18;
      float v = smoothstep(0.85, 0.2, length(c) * (1.0 + vignette));
      col *= mix(1.0, v, vignette * 2.2);
      col += (rnd(vUv * 731.0) - 0.5) * grain * (0.5 + l);
      col = mix(col, vec3(1.0), flash);
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

export class PostFX {
  constructor(game) {
    this.game = game;
    const r = game.renderer;
    const size = r.getSize(new THREE.Vector2());
    this.composer = new EffectComposer(r);
    this.scenePass = new RenderPass(game.scene, game.camera);
    this.vmPass = new RenderPass(game.viewmodel.scene, game.viewmodel.camera);
    this.vmPass.clear = false; this.vmPass.clearDepth = true;
    this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x, size.y), 0.45, 0.55, 0.82);
    this.grade = new ShaderPass(GradeShader);
    this.output = new OutputPass();
    for (const p of [this.scenePass, this.vmPass, this.bloom, this.grade, this.output]) this.composer.addPass(p);
  }
  setSize(w, h) {
    this.composer.setPixelRatio(this.game.renderer.getPixelRatio());
    this.composer.setSize(w, h);
  }
  render(showViewmodel, dt) {
    const g = this.game, u = this.grade.uniforms;
    const s = g.settings;
    this.bloom.enabled = s.quality === 'high' || s.quality === 'ultra';
    this.vmPass.enabled = showViewmodel;
    u.time.value = (u.time.value + dt) % 100;
    // tom por horário: dourado no entardecer, azulado à noite
    const day = g.weather.dayFactor ?? 1;
    const t = g.weather.time ?? 12;
    const dusk = Math.max(0, 1 - Math.abs(t - 18) / 2) + Math.max(0, 1 - Math.abs(t - 6.5) / 2);
    u.tint.value.setRGB(1 + dusk * 0.06 - (1 - day) * 0.05, 1 - (1 - day) * 0.02, 1 - dusk * 0.06 + (1 - day) * 0.08);
    const p = g.player;
    const hurt = p && g.state === 'playing' ? Math.max(0, 1 - p.health / p.maxHealth * 2.2) : 0;
    u.hurt.value += (hurt - u.hurt.value) * Math.min(1, dt * 4);
    u.flash.value = p ? Math.min(1, p.flashed / 2.5) : 0;
    this.composer.render(dt);
  }
}
