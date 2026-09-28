import { ROOM_ID } from './config.js';

const PEER_OPTS = {
  host: '0.peerjs.com', port: 443, path: '/', secure: true, debug: 1,
  config: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:global.stun.twilio.com:3478' },
    ],
  },
};
const OFFLINE_ERRORS = ['network', 'server-error', 'socket-error', 'socket-closed', 'browser-incompatible', 'ssl-unavailable'];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// One fixed room: whoever arrives first claims the room id and becomes host,
// everyone else connects to that id.
export class Net {
  constructor() {
    this.role = 'none';
    this.peer = null;
    this.hostConn = null;
    this.conns = new Map();
    this.handlers = {};
    this.closing = false;
  }

  on(evt, fn) { this.handlers[evt] = fn; }
  emit(evt, ...args) { this.handlers[evt]?.(...args); }

  async connect(status = () => {}) {
    this.closing = false;
    if (!window.Peer) { this.role = 'offline'; return this.role; }
    for (let attempt = 0; attempt < 4; attempt++) {
      status(attempt ? `Retrying (${attempt + 1}/4)...` : 'Looking for the office...');
      const hosted = await this.tryHost();
      if (hosted === 'ok') { this.role = 'host'; return this.role; }
      if (hosted === 'offline') break;
      status('Office found. Walking in...');
      const joined = await this.tryJoin();
      if (joined === 'ok') { this.role = 'client'; return this.role; }
      await sleep(500 + Math.random() * 900);
    }
    this.destroyPeer();
    this.role = 'offline';
    return this.role;
  }

  tryHost() {
    return new Promise(resolve => {
      let done = false;
      const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      const peer = new window.Peer(ROOM_ID, PEER_OPTS);
      this.peer = peer;
      const timer = setTimeout(() => { this.destroyPeer(); finish('offline'); }, 9000);
      peer.on('open', () => {
        peer.on('connection', conn => this.accept(conn));
        finish('ok');
      });
      peer.on('error', e => {
        if (done) { this.emit('error', e); return; }
        this.destroyPeer();
        finish(e.type === 'unavailable-id' ? 'taken' : OFFLINE_ERRORS.includes(e.type) ? 'offline' : 'taken');
      });
      peer.on('disconnected', () => { if (done && !this.closing) try { peer.reconnect(); } catch { /* broker gone */ } });
    });
  }

  tryJoin() {
    return new Promise(resolve => {
      let done = false;
      const finish = r => { if (!done) { done = true; clearTimeout(timer); resolve(r); } };
      const peer = new window.Peer(undefined, PEER_OPTS);
      this.peer = peer;
      const timer = setTimeout(() => { this.destroyPeer(); finish('fail'); }, 7000);
      peer.on('open', () => {
        const conn = peer.connect(ROOM_ID, { reliable: true });
        this.hostConn = conn;
        conn.on('open', () => finish('ok'));
        conn.on('data', msg => this.emit('message', msg, 'host'));
        conn.on('close', () => { if (done && !this.closing) this.emit('hostLost'); });
        conn.on('error', () => { if (!done) { this.destroyPeer(); finish('fail'); } });
      });
      peer.on('error', () => { if (!done) { this.destroyPeer(); finish('fail'); } else if (!this.closing) this.emit('hostLost'); });
    });
  }

  accept(conn) {
    conn.on('data', msg => {
      if (!msg || typeof msg !== 'object') return;
      if (msg.type === 'join' && msg.player?.id && !conn.pid) {
        conn.pid = String(msg.player.id).slice(0, 40);
        this.conns.set(conn.pid, conn);
      }
      if (!conn.pid) return;
      this.emit('message', msg, conn.pid);
    });
    const gone = () => {
      if (conn.pid && this.conns.get(conn.pid) === conn) {
        this.conns.delete(conn.pid);
        this.emit('peerLeft', conn.pid);
      }
    };
    conn.on('close', gone);
    conn.on('error', gone);
  }

  send(msg) {
    if (this.hostConn?.open) this.hostConn.send(msg);
  }

  sendTo(id, msg) {
    const c = this.conns.get(id);
    if (c?.open) c.send(msg);
  }

  broadcast(msg, except = null) {
    for (const [id, c] of this.conns) if (id !== except && c.open) c.send(msg);
  }

  kick(id, msg) {
    const c = this.conns.get(id);
    if (!c) return;
    if (msg) try { c.send(msg); } catch { /* closed */ }
    setTimeout(() => { try { c.close(); } catch { /* closed */ } }, 250);
    this.conns.delete(id);
  }

  destroyPeer() {
    try { this.hostConn?.close(); } catch { /* ignore */ }
    for (const c of this.conns.values()) try { c.close(); } catch { /* ignore */ }
    this.conns.clear();
    try { this.peer?.destroy(); } catch { /* ignore */ }
    this.peer = null;
    this.hostConn = null;
  }

  close() {
    this.closing = true;
    this.destroyPeer();
    this.role = 'none';
  }
}
