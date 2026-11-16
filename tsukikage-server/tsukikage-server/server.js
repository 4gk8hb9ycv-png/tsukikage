'use strict';
// 월영 학원 테스트 서버 — 외부 패키지 없이 Node.js 기본 기능만 써요.
// 하는 일: 게임 화면(public/index.html)을 보여 주고, 접속한 사람들끼리 위치·채팅을 실시간으로 이어 줘요.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 3000;
const ADMIN_KEY = process.env.ADMIN_KEY || '';     // 주인 비밀번호 (Render 환경 변수)
const INVITE_CODE = process.env.INVITE_CODE || ''; // 가입할 때 필요한 입장 코드 (Render 환경 변수)
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'accounts.json');
const INDEX = path.join(__dirname, 'public', 'index.html');
const MAX_PEERS = 60;          // 동시 접속 최대 인원
const MAX_PATCH = 120 * 1024;  // 한 번에 보낼 수 있는 상태 크기
const MAX_STATE = 200 * 1024;  // 한 사람 상태 전체 크기

const peers = new Map(); // id -> { res, presence, last, user }

// ---------- 계정 (아이디 중복 금지 + 비밀번호) ----------
// 비밀번호는 브라우저에서 한 번 바꾼 값(key)만 오고, 서버는 그것을 다시 scrypt로 바꿔서 저장해요.
let db = { users: {}, sessions: {} };
try { fs.mkdirSync(DATA_DIR, { recursive: true }); db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); db.users = db.users || {}; db.sessions = db.sessions || {}; } catch (e) { /* 처음이면 빈 상태 */ }
let dirty = false;
setInterval(() => { if (!dirty) return; dirty = false; try { fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db)); fs.renameSync(DB_FILE + '.tmp', DB_FILE); } catch (e) { dirty = true; } }, 3000);
const idOK = id => typeof id === 'string' && /^[가-힣A-Za-z0-9_]{2,16}$/.test(id);
const keyOK = k => typeof k === 'string' && /^[a-f0-9]{64}$/.test(k);
const hashKey = (key, salt) => crypto.scryptSync(key, salt, 32).toString('hex');
function newSession(uid) { const t = crypto.randomBytes(24).toString('hex'); db.sessions[t] = { uid, at: Date.now() }; dirty = true; return t; }
const userOf = token => (typeof token === 'string' && db.sessions[token]) ? db.sessions[token].uid : null;
// 같은 곳에서 너무 많이 시도하면 잠깐 막기
const tries = new Map();
function tooMany(req) { const ip = (req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim(); const now = Date.now(); const t = tries.get(ip) || { n: 0, at: now }; if (now - t.at > 60000) { t.n = 0; t.at = now; } t.n++; tries.set(ip, t); return t.n > 30; }

function send(res, event, data) {
  try { res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); } catch (e) { /* 끊긴 연결 */ }
}
function broadcast(event, data, exceptId) {
  for (const [id, p] of peers) if (id !== exceptId) send(p.res, event, data);
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}
function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > limit) { reject(new Error('too big')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const validId = id => typeof id === 'string' && /^[a-z0-9]{8,40}$/.test(id);
function sameKey(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;

  // 게임 화면
  if (req.method === 'GET' && (p === '/' || p === '/index.html')) {
    fs.readFile(INDEX, (err, buf) => {
      if (err) { res.writeHead(500); return res.end('index.html을 찾지 못했어요.'); }
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(buf);
    });
    return;
  }
  if (p === '/health') return json(res, 200, { ok: true, online: peers.size });

  // 가입
  if (req.method === 'POST' && p === '/api/register') {
    if (tooMany(req)) return json(res, 429, { error: 'slow' });
    let b = {}; try { b = JSON.parse(await readBody(req, 4096)); } catch (e) { return json(res, 400, { error: 'bad' }); }
    if (INVITE_CODE && !(typeof b.invite === 'string' && sameKey(b.invite.trim(), INVITE_CODE))) return json(res, 403, { error: 'invite' });
    if (!idOK(b.id)) return json(res, 400, { error: 'id' });
    if (!keyOK(b.key)) return json(res, 400, { error: 'key' });
    const lid = b.id.toLowerCase();
    if (db.users[lid]) return json(res, 409, { error: 'taken' });
    const salt = crypto.randomBytes(16).toString('hex');
    db.users[lid] = { id: b.id, salt, hash: hashKey(b.key, salt), created: Date.now() }; dirty = true;
    return json(res, 200, { ok: true, id: b.id, token: newSession(lid) });
  }
  // 로그인
  if (req.method === 'POST' && p === '/api/login') {
    if (tooMany(req)) return json(res, 429, { error: 'slow' });
    let b = {}; try { b = JSON.parse(await readBody(req, 4096)); } catch (e) { return json(res, 400, { error: 'bad' }); }
    const u = idOK(b.id) && db.users[b.id.toLowerCase()];
    if (!u) return json(res, 404, { error: 'nouser' });
    if (!keyOK(b.key) || !sameKey(hashKey(b.key, u.salt), u.hash)) return json(res, 401, { error: 'wrong' });
    return json(res, 200, { ok: true, id: u.id, token: newSession(b.id.toLowerCase()) });
  }
  // 로그인 상태 확인
  if (req.method === 'GET' && p === '/api/me') {
    const uid = userOf(url.searchParams.get('token'));
    return uid ? json(res, 200, { ok: true, id: db.users[uid].id }) : json(res, 401, { error: 'token' });
  }

  // 실시간 연결 (Server-Sent Events)
  if (req.method === 'GET' && p === '/rt/stream') {
    const id = url.searchParams.get('id');
    if (!validId(id)) return json(res, 400, { error: 'bad id' });
    const uid = userOf(url.searchParams.get('token'));
    if (!uid) return json(res, 401, { error: 'token' });
    if (!peers.has(id) && peers.size >= MAX_PEERS) return json(res, 503, { error: 'full' });
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write('retry: 3000\n\n');
    const old = peers.get(id);
    if (old) { try { old.res.end(); } catch (e) {} }
    const presence = old ? old.presence : {};
    peers.set(id, { res, presence, last: Date.now(), user: uid });
    send(res, 'hello', { you: id, peers: [...peers].map(([pid, v]) => ({ peer: pid, presence: v.presence })) });
    if (!old) broadcast('join', { peer: id, presence }, id);
    const ping = setInterval(() => { try { res.write(': ping\n\n'); } catch (e) {} }, 20000);
    req.on('close', () => {
      clearInterval(ping);
      const cur = peers.get(id);
      if (cur && cur.res === res) { peers.delete(id); broadcast('leave', { peer: id }); }
    });
    return;
  }

  // 내 상태 바꾸기 (위치, 말풍선, 얼굴 등)
  if (req.method === 'POST' && p === '/rt/presence') {
    let body;
    try { body = JSON.parse(await readBody(req, MAX_PATCH)); } catch (e) { return json(res, 413, { error: 'bad body' }); }
    const id = body && body.id, patch = body && body.patch;
    const peer = peers.get(id);
    if (!validId(id) || !peer) return json(res, 404, { error: 'not connected' });
    if (userOf(body.token) !== peer.user) return json(res, 401, { error: 'token' });
    if (!patch || typeof patch !== 'object' || Array.isArray(patch)) return json(res, 400, { error: 'bad patch' });
    const next = Object.assign({}, peer.presence);
    for (const k of Object.keys(patch).slice(0, 40)) { if (patch[k] === null) delete next[k]; else next[k] = patch[k]; }
    if (JSON.stringify(next).length > MAX_STATE) return json(res, 413, { error: 'state too big' });
    peer.presence = next; peer.last = Date.now();
    broadcast('patch', { peer: id, patch }, null);
    return json(res, 200, { ok: true });
  }

  // 주인(관리자) 확인
  if (req.method === 'POST' && p === '/rt/owner') {
    let body = {};
    try { body = JSON.parse(await readBody(req, 2048)); } catch (e) {}
    return json(res, 200, { owner: !!ADMIN_KEY && typeof body.key === 'string' && sameKey(body.key, ADMIN_KEY) });
  }

  res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end('없는 페이지예요.');
});

server.listen(PORT, () => console.log(`월영 학원 서버 실행 중: http://localhost:${PORT}  (주인 비밀번호 ${ADMIN_KEY ? '설정됨' : '없음'}, 입장 코드 ${INVITE_CODE ? '설정됨' : '없음'})`));
