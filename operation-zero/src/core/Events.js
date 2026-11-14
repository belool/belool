// Barramento de eventos simples (pub/sub). Usado para desacoplar sistemas:
// combate -> HUD, progressão, IA (ruídos), modos de jogo, áudio.
export class Events {
  constructor() { this.map = new Map(); }
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.off(name, fn);
  }
  off(name, fn) { this.map.get(name)?.delete(fn); }
  emit(name, data) {
    const set = this.map.get(name);
    if (!set) return;
    for (const fn of [...set]) fn(data);
  }
  clear() { this.map.clear(); }
}
