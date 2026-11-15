// ================================================================
// Servidor do Operation Zero (sem dependências):
//  - arquivos estáticos do jogo
//  - WebSocket em /ws com salas por código para o multijogador online
//    (o navegador anfitrião simula a partida; o servidor só repassa)
// Uso: node tools/serve.mjs [porta]   → http://localhost:8080
// ================================================================
import http from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.argv[2] || process.env.PORT || 8080);
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml' };

// ---------------- WebSocket mínimo (RFC 6455, frames de texto) ----------------
class Socket {
  constructor(sock) {
    this.sock = sock; this.buf = Buffer.alloc(0); this.open = true; this.frag = null;
    sock.setNoDelay(true);
    sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.parse(); });
    sock.on('close', () => this.close());
    sock.on('error', () => this.close());
  }
  parse() {
    while (this.buf.length >= 2) {
      const b0 = this.buf[0], b1 = this.buf[1];
      const fin = (b0 & 0x80) !== 0, op = b0 & 0x0f, masked = (b1 & 0x80) !== 0;
      let len = b1 & 0x7f, off = 2;
      if (len === 126) { if (this.buf.length < 4) return; len = this.buf.readUInt16BE(2); off = 4; }
      else if (len === 127) { if (this.buf.length < 10) return; len = Number(this.buf.readBigUInt64BE(2)); off = 10; }
      if (len > 8 * 1024 * 1024) return this.close();
      const need = off + (masked ? 4 : 0) + len;
      if (this.buf.length < need) return;
      let payload = this.buf.subarray(off + (masked ? 4 : 0), need);
      if (masked) {
        const mask = this.buf.subarray(off, off + 4);
        payload = Buffer.from(payload);
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3];
      }
      this.buf = this.buf.subarray(need);
      if (op === 0x8) return this.close();
      if (op === 0x9) { this.frame(0xa, payload); continue; }
      if (op === 0xa) continue;
      if (op === 0x1 || op === 0x0) {
        this.frag = op === 0x1 ? [payload] : (this.frag || []).concat([payload]);
        if (fin) { const text = Buffer.concat(this.frag).toString('utf8'); this.frag = null; this.onmessage?.(text); }
      }
    }
  }
  frame(op, payload) {
    if (!this.open) return;
    const len = payload.length;
    const head = len < 126 ? Buffer.from([0x80 | op, len]) : len < 65536 ? Buffer.from([0x80 | op, 126, len >> 8, len & 255]) : (() => { const h = Buffer.alloc(10); h[0] = 0x80 | op; h[1] = 127; h.writeBigUInt64BE(BigInt(len), 2); return h; })();
    this.sock.write(Buffer.concat([head, payload]));
  }
  send(text) { this.frame(0x1, Buffer.from(text, 'utf8')); }
  close() {
    if (!this.open) return;
    this.open = false;
    try { this.sock.end(); } catch (e) { /* */ }
    this.onclose?.();
  }
}

// ---------------- Salas ----------------
const rooms = new Map(); // código -> { host, peers: Map(id -> conn) }
let nextId = 1;
const code = () => { let c; do { c = Math.random().toString(36).slice(2, 7).toUpperCase(); } while (rooms.has(c)); return c; };

function onConnection(ws) {
  const me = { id: nextId++, ws, room: null, name: 'Operador' };
  const send = (o) => ws.send(JSON.stringify(o));
  ws.onmessage = (text) => {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (m.t === 'host') {
      leave();
      const c = code();
      me.name = String(m.name || 'Anfitrião').slice(0, 16);
      rooms.set(c, { code: c, host: me, peers: new Map([[me.id, me]]) });
      me.room = c;
      send({ t: 'room', code: c, id: me.id, hostId: me.id });
    } else if (m.t === 'join') {
      const r = rooms.get(String(m.code || '').toUpperCase());
      if (!r) return send({ t: 'error', msg: 'Sala não encontrada' });
      if (r.peers.size >= 20) return send({ t: 'error', msg: 'Sala cheia' });
      leave();
      me.name = String(m.name || 'Operador').slice(0, 16);
      me.room = r.code; r.peers.set(me.id, me);
      send({ t: 'joined', code: r.code, id: me.id, hostId: r.host.id });
      r.host.ws.send(JSON.stringify({ t: 'peer', id: me.id, name: me.name }));
    } else if (m.t === 'to') {
      const r = rooms.get(me.room);
      if (!r) return;
      const out = JSON.stringify({ t: 'msg', from: me.id, d: m.d });
      if (m.to === 'host') r.host.ws.send(out);
      else if (m.to === 'all') { for (const p of r.peers.values()) if (p !== me && p.id !== m.ex) p.ws.send(out); }
      else r.peers.get(m.to)?.ws.send(out);
    } else if (m.t === 'leave') leave();
    else if (m.t === 'ping') send({ t: 'pong', at: m.at });
  };
  function leave() {
    const r = rooms.get(me.room);
    me.room = null;
    if (!r) return;
    r.peers.delete(me.id);
    if (r.host === me) {
      for (const p of r.peers.values()) { p.room = null; p.ws.send(JSON.stringify({ t: 'hostLeft' })); }
      rooms.delete(r.code);
    } else r.host.ws.send(JSON.stringify({ t: 'peerLeft', id: me.id }));
  }
  ws.onclose = leave;
}

export function serve(p = port, host = '0.0.0.0') {
  const server = http.createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    const file = path.join(root, url === '/' ? 'index.html' : url);
    if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
    fs.readFile(file, (err, data) => {
      if (err) { res.writeHead(404); return res.end('404'); }
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  });
  server.on('upgrade', (req, sock) => {
    if (new URL(req.url, 'http://x').pathname !== '/ws') return sock.destroy();
    const key = req.headers['sec-websocket-key'];
    if (!key) return sock.destroy();
    const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    sock.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    onConnection(new Socket(sock));
  });
  return new Promise((resolve) => server.listen(p, host, () => resolve(server)));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  serve().then(() => {
    console.log(`Operation Zero em http://localhost:${port}`);
    for (const list of Object.values(os.networkInterfaces())) for (const a of list || []) {
      if (a.family === 'IPv4' && !a.internal) console.log(`Na rede local (outros jogadores): http://${a.address}:${port}`);
    }
  });
}
