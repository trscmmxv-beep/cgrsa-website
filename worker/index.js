/* CGRSA member portal – server (Cloudflare Worker + D1).
   Every permission check happens here; the browser only ever receives the data its user may see. */

const SETUP_HASH = "95668b1b2318877359f15f479e18c0bf53474ea2a71f7308082bc1767941b40e"; // sha-256 of the one-time setup / recovery code
const COOKIE = "cgrsa_s";
const SESSION_DAYS = 7, ADMIN_SESSION_HOURS = 12;
const MAX_FILE = 1900 * 1024;
const enc = new TextEncoder();

/* ---------------- helpers ---------------- */
const json = (d, s = 200, h = {}) => new Response(JSON.stringify(d), { status: s, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...h } });
const bad = (m, s = 400) => json({ error: m }, s);
class HttpError extends Error { constructor(m, s = 400) { super(m); this.s = s; } }
const nowISO = () => new Date().toISOString();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const rand = (n) => crypto.getRandomValues(new Uint8Array(n));
const rid = (p) => p + b64u(rand(9)).replace(/[-_]/g, "x").toLowerCase().slice(0, 10);
async function sha256hex(s) { return [...new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join(""); }
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i); return r === 0; }
const pwOk = (p) => typeof p === "string" && p.length >= 8 && p.length <= 128 && /\d/.test(p) && /[A-Za-z]/.test(p);
const phoneOk = (p) => /^[6-9]\d{9}$/.test(p || "");
const str = (v, max = 200) => String(v ?? "").trim().slice(0, max);

async function hashPw(pw) {
  const salt = rand(16), key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations: 100000 }, key, 256);
  return `pbkdf2$100000$${b64(salt)}$${b64(bits)}`;
}
async function checkPw(pw, stored) {
  if (!stored || typeof pw !== "string") return false;
  const [, it, s, h] = stored.split("$"), key = await crypto.subtle.importKey("raw", enc.encode(pw), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt: unb64(s), iterations: +it }, key, 256);
  return safeEq(b64(bits), h);
}

/* TOTP (RFC 6238) for the admin's authenticator app */
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
function b32enc(bytes) { let bits = "", out = ""; for (const b of bytes) bits += b.toString(2).padStart(8, "0"); for (let i = 0; i + 5 <= bits.length; i += 5) out += B32[parseInt(bits.slice(i, i + 5), 2)]; return out; }
function b32dec(s) { let bits = ""; for (const c of s.replace(/=+$/, "")) bits += B32.indexOf(c).toString(2).padStart(5, "0"); const out = []; for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2)); return new Uint8Array(out); }
async function totpAt(secret, step) {
  const key = await crypto.subtle.importKey("raw", b32dec(secret), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const msg = new ArrayBuffer(8), dv = new DataView(msg); dv.setUint32(0, Math.floor(step / 2 ** 32)); dv.setUint32(4, step >>> 0);
  const h = new Uint8Array(await crypto.subtle.sign("HMAC", key, msg)), o = h[19] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1e6).padStart(6, "0");
}
async function totpOk(secret, code) {
  if (!/^\d{6}$/.test(code || "")) return false; const step = Math.floor(Date.now() / 30000);
  for (const d of [-1, 0, 1]) if ((await totpAt(secret, step + d)) === code) return true; return false;
}

/* ---------------- database ---------------- */
let READY = false;
async function init(env) {
  if (READY) return; const db = env.DB;
  await db.batch([
    db.prepare("CREATE TABLE IF NOT EXISTS docs (coll TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, g TEXT, k TEXT, u TEXT, PRIMARY KEY (coll, id))"),
    db.prepare("CREATE INDEX IF NOT EXISTS docs_g ON docs (coll, g)"),
    db.prepare("CREATE INDEX IF NOT EXISTS docs_k ON docs (coll, k)"),
    db.prepare("CREATE INDEX IF NOT EXISTS docs_u ON docs (coll, u)"),
    db.prepare("CREATE TABLE IF NOT EXISTS creds (uid TEXT PRIMARY KEY, pass TEXT, totp TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS sessions (h TEXT PRIMARY KEY, uid TEXT NOT NULL, exp INTEGER NOT NULL, mfa INTEGER NOT NULL DEFAULT 1, pend TEXT)"),
    db.prepare("CREATE TABLE IF NOT EXISTS fails (k TEXT PRIMARY KEY, n INTEGER NOT NULL, until INTEGER NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS files (id TEXT PRIMARY KEY, owner TEXT NOT NULL, mime TEXT NOT NULL, name TEXT, data BLOB NOT NULL, created TEXT NOT NULL)"),
    db.prepare("CREATE TABLE IF NOT EXISTS meta (k TEXT PRIMARY KEY, v TEXT)"),
  ]);
  const seeded = await db.prepare("SELECT v FROM meta WHERE k='seeded'").first();
  if (!seeded) await seed(db);
  READY = true;
}
async function seed(db) {
  // Clubs and coaches as listed on cgskate.com; the championship from the CGRSA circular.
  const clubs = [["c1", "Trueno Sports Management", ""], ["c2", "Royalion Speed Skating Club", ""], ["c3", "Golden Roller Skating Club", "Raipur"],
    ["c4", "Raigarh Skating Club (Rolling Stones)", "Raigarh"], ["c5", "Bastar Roller Skating Club", "Bastar"], ["c6", "Sandbox's Innovation", ""]]
    .map(([id, name, district]) => ({ id, name, district, active: true }));
  const coaches = [["Vishal Roy", "Bilaspur"], ["Shikhar Singh Thakur", ""], ["Tanmay Nair", "Bilaspur"], ["Vicky Roy", "Bilaspur"], ["Akshat Jain", "Raipur"],
    ["Sumit Chaurasia", "Durg, Mahasamund"], ["Simant Avadia", "Raipur"], ["Indra Kumar Sahu", "Dhamtari"], ["Shresht Das", "Bhilai"], ["Kamran Ahmed", "Raipur"],
    ["Divyani Asrani", "Raipur"], ["Anurag Bhandari", "Durg, Raipur, Mahasamund, Dhamtari, Rajnandgaon"]]
    .map(([name, area], i) => ({ id: "k" + (i + 1), name, area, phone: "", email: "", active: true }));
  const events = [{ id: "e1", name: "Chhattisgarh State Roller Sports Ranking Championship 2027", date: "2027-01-08", end: "2027-01-10", time: "08:00", venue: "Pink Ground, Bilaspur",
    cutoff: "2027-12-31", rule: "cgrsa", custom: 2, races: ["q1", "q2", "q3", "i1", "i2", "i3", "i4", "i6"],
    cats: ["Quad", "Inline", "Promotional – Toy Inline", "Promotional – Tenacity", "Artistic", "Skateboarding"], open: true, certs: false }];
  const put = (coll, d) => db.prepare("INSERT OR IGNORE INTO docs (coll, id, data) VALUES (?, ?, ?)").bind(coll, d.id, JSON.stringify(d));
  await db.batch([...clubs.map((d) => put("clubs", d)), ...coaches.map((d) => put("coaches", d)), ...events.map((d) => put("events", d)),
    db.prepare("INSERT OR REPLACE INTO meta (k, v) VALUES ('seeded', ?)").bind(nowISO()), db.prepare("INSERT OR IGNORE INTO meta (k, v) VALUES ('v', '1')")]);
}
const parse = (row) => (row ? JSON.parse(row.data) : null);
async function getDoc(db, coll, id) { return parse(await db.prepare("SELECT data FROM docs WHERE coll=? AND id=?").bind(coll, id).first()); }
async function all(db, sql, ...args) { return (await db.prepare(sql).bind(...args).all()).results; }
async function usersByLogin(db, login) {
  const l = String(login || "").trim().toLowerCase(); if (!l) return [];
  return (await all(db, "SELECT data FROM docs WHERE coll='users' AND (lower(json_extract(data,'$.login'))=? OR lower(json_extract(data,'$.alt'))=?)", l, l)).map(parse);
}
async function version(db) { return +((await db.prepare("SELECT v FROM meta WHERE k='v'").first())?.v || 1); }
const bump = (db) => db.prepare("UPDATE meta SET v = CAST(v AS INTEGER) + 1 WHERE k='v'");
const audit = (db, who, what) => db.prepare("INSERT INTO docs (coll, id, data) VALUES ('audit', ?, ?)").bind(rid("a"), JSON.stringify({ t: nowISO(), who, what: str(what, 600) }));
async function adminExists(db) { return !!(await db.prepare("SELECT 1 FROM docs WHERE coll='users' AND json_extract(data,'$.role')='admin' LIMIT 1").first()); }

/* login throttling: 5 wrong tries → 15 minutes */
async function throttled(db, k) { const f = await db.prepare("SELECT n, until FROM fails WHERE k=?").bind(k).first(); return f && f.until > Date.now(); }
async function failed(db, k) {
  const f = (await db.prepare("SELECT n, until FROM fails WHERE k=?").bind(k).first()) || { n: 0, until: 0 };
  let n = f.n + 1, until = 0; if (n >= 5) { n = 0; until = Date.now() + 15 * 60e3; }
  await db.prepare("INSERT OR REPLACE INTO fails (k, n, until) VALUES (?, ?, ?)").bind(k, n, until).run();
}
const cleared = (db, k) => db.prepare("DELETE FROM fails WHERE k=?").bind(k).run();

/* ---------------- sessions ---------------- */
function cookieOf(req) { const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`)); return m ? m[1] : null; }
async function newSession(db, user, mfa, pend = null) {
  const tok = b64u(rand(32)), ms = user.role === "admin" ? ADMIN_SESSION_HOURS * 3600e3 : SESSION_DAYS * 86400e3;
  await db.prepare("INSERT INTO sessions (h, uid, exp, mfa, pend) VALUES (?, ?, ?, ?, ?)").bind(await sha256hex(tok), user.id, Date.now() + ms, mfa ? 1 : 0, pend).run();
  return `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(ms / 1000)}`;
}
async function session(req, db) {
  const tok = cookieOf(req); if (!tok) return null;
  const s = await db.prepare("SELECT * FROM sessions WHERE h=?").bind(await sha256hex(tok)).first();
  if (!s || s.exp < Date.now()) return null;
  const user = await getDoc(db, "users", s.uid); if (!user || user.active === false || user.pending) return null;
  return { ...s, user };
}
const clearCookie = `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

/* ---------------- what each person may see ---------------- */
async function state(db, me) {
  const isA = me.role === "admin", D = {};
  const coll = async (c) => (await all(db, "SELECT data FROM docs WHERE coll=?", c)).map(parse);
  D.clubs = await coll("clubs"); D.events = await coll("events");
  D.results = Object.fromEntries((await coll("results")).map((d) => [d.id, d.v]));
  D.res = Object.fromEntries((await coll("res")).map((d) => [d.id, d.v]));
  const coaches = await coll("coaches");
  if (isA) {
    D.coaches = coaches; D.students = await coll("students"); D.regs = await coll("regs"); D.payments = await coll("payments"); D.objections = await coll("objections");
    const creds = new Set((await all(db, "SELECT uid FROM creds WHERE pass IS NOT NULL")).map((r) => r.uid));
    D.users = (await coll("users")).map((u) => ({ ...u, pass: creds.has(u.id) }));
    D.audit = (await all(db, "SELECT data FROM docs WHERE coll='audit' ORDER BY json_extract(data,'$.t') DESC LIMIT 3000")).map(parse);
  } else {
    D.coaches = coaches.map(({ id, name, area, active }) => ({ id, name, area, active }));
    const [col, val] = me.role === "coach" ? ["k", me.coachId || "-"] : ["g", me.guardianId || "-"];
    D.students = (await all(db, `SELECT data FROM docs WHERE coll='students' AND ${col}=?`, val)).map(parse);
    D.regs = (await all(db, `SELECT data FROM docs WHERE coll='regs' AND ${col}=?`, val)).map(parse);
    const regIds = new Set(D.regs.map((r) => r.id));
    D.payments = (await coll("payments")).filter((p) => p.by === me.id || (p.regIds || []).some((x) => regIds.has(x))).map(({ thumb, ...p }) => (p.by === me.id ? { ...p, thumb } : p));
    D.objections = (await all(db, "SELECT data FROM docs WHERE coll='objections' AND u=?", me.id)).map(parse);
    const gids = new Set(D.students.map((s) => s.guardianId));
    const guardians = me.role === "coach" ? (await coll("users")).filter((u) => u.role === "guardian" && gids.has(u.guardianId)).map(({ id, role, guardianId, name, login, active }) => ({ id, role, guardianId, name, login, active })) : [];
    const self = { ...me }; delete self.resetCode; delete self.resetUntil;
    const pass = !!(await db.prepare("SELECT 1 FROM creds WHERE uid=? AND pass IS NOT NULL").bind(me.id).first());
    D.users = [{ ...self, pass }, ...guardians.filter((g) => g.id !== me.id)];
    D.audit = [];
  }
  return D;
}

/* ---------------- changes sent by the browser ---------------- */
const ADMIN_COLLS = ["clubs", "coaches", "events", "students", "regs", "payments", "objections", "users", "results", "res"];
const USER_COLLS = ["students", "regs", "payments", "objections", "users"];
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

async function sync(db, me, body) {
  const isA = me.role === "admin", ch = body.changes || {}, stmts = [], notes = [];
  for (const c of Object.keys(ch)) if (!(isA ? ADMIN_COLLS : USER_COLLS).includes(c)) throw new HttpError("You don’t have permission to change this.", 403);
  for (const c of Object.keys(ch)) if ((ch[c].del || []).length && !isA) throw new HttpError("You don’t have permission to delete this.", 403);
  const puts = (c) => (ch[c]?.put || []).filter((d) => d && typeof d.id === "string" && d.id.length <= 80);
  const upsert = (c, d, g = null, k = null, u = null) => stmts.push(db.prepare("INSERT OR REPLACE INTO docs (coll, id, data, g, k, u) VALUES (?, ?, ?, ?, ?, ?)").bind(c, d.id, JSON.stringify(d), g, k, u));
  const canSee = (s) => isA || (me.role === "coach" ? s.coachId === me.coachId : s.guardianId === me.guardianId);

  // users (accounts)
  const gmap = {}, newGuardians = new Set();
  for (const d of puts("users")) {
    const ex = await getDoc(db, "users", d.id); delete d.pass;
    if (isA) {
      if (d.login && (!ex || ex.login !== d.login)) { const dup = (await usersByLogin(db, d.login)).filter((u) => u.id !== d.id && u.login.toLowerCase() === d.login.toLowerCase()); if (dup.length) throw new HttpError(`${d.login} is already used by another account.`); }
      if (ex && ex.role === "admin" && d.role !== "admin") throw new HttpError("The admin account can’t be changed to another role.");
      upsert("users", { ...d, login: str(d.login, 120) });
      continue;
    }
    if (ex) { if (ex.id !== me.id) throw new HttpError("You can only change your own account.", 403); upsert("users", { ...ex, name: str(d.name, 80) || ex.name, alt: str(d.alt, 120) }); continue; }
    // a coach registering a skater whose parent has no account yet
    if (me.role !== "coach" || d.role !== "guardian" || !phoneOk(d.login) || !/^g[a-z0-9]{5,20}$/.test(d.guardianId || "")) throw new HttpError("You don’t have permission to create accounts.", 403);
    const owner = (await usersByLogin(db, d.login)).find((u) => u.login === d.login);
    if (owner && owner.role !== "guardian") throw new HttpError("This mobile number belongs to a staff account. Use the parent’s number.");
    if (owner) { gmap[d.guardianId] = owner.guardianId; continue; }
    upsert("users", { id: d.id, role: "guardian", guardianId: d.guardianId, name: str(d.name, 80), login: d.login, active: true, created: nowISO() });
    newGuardians.add(d.guardianId);
  }

  // skaters
  const batchStudents = {};
  for (const d0 of puts("students")) {
    const d = { ...d0, guardianId: gmap[d0.guardianId] || d0.guardianId }, ex = await getDoc(db, "students", d.id);
    if (!isA) {
      if (ex && !canSee(ex)) throw new HttpError("You can’t change this skater.", 403);
      if (!canSee(d)) throw new HttpError(me.role === "coach" ? "Skaters you register must have you as their coach." : "You can only register your own children.", 403);
      if (me.role === "coach" && !newGuardians.has(d.guardianId) && !(await db.prepare("SELECT 1 FROM docs WHERE coll='users' AND json_extract(data,'$.guardianId')=?").bind(d.guardianId).first())) throw new HttpError("The parent’s account couldn’t be found.");
      if (!str(d.name) || !/^\d{4}-\d{2}-\d{2}$/.test(d.dob || "")) throw new HttpError("Skater name and date of birth are required.");
    }
    batchStudents[d.id] = d; upsert("students", d, d.guardianId, d.coachId);
    stmts.push(db.prepare("UPDATE docs SET g=?, k=? WHERE coll='regs' AND json_extract(data,'$.studentId')=?").bind(d.guardianId, d.coachId, d.id));
  }
  const student = async (id) => batchStudents[id] || (await getDoc(db, "students", id));

  // payments (checked before registrations so a registration can point at a new payment)
  const newPays = {};
  for (const d of puts("payments")) {
    const ex = await getDoc(db, "payments", d.id);
    if (!isA) {
      if (ex) { if (same(ex, d)) continue; throw new HttpError("A submitted payment can’t be changed. Contact the CGRSA office.", 403); }
      if (!/^\d{12}$/.test(d.utr || "")) throw new HttpError("Enter the 12-digit UTR.");
      Object.assign(d, { by: me.id, status: "pending" }); delete d.verifiedBy; delete d.verifiedAt; delete d.reason;
      d.amount = Math.max(0, Math.round(+d.amount || 0)); d.payerName = str(d.payerName, 80);
    }
    if (!ex || ex.utr !== d.utr) {
      const dup = await db.prepare("SELECT 1 FROM docs WHERE ((coll='payments' AND json_extract(data,'$.status')!='rejected') OR (coll='objections' AND json_extract(data,'$.fee')!='rejected')) AND json_extract(data,'$.utr')=? AND id!=? LIMIT 1").bind(d.utr, d.id).first();
      if (dup) throw new HttpError(`UTR ${d.utr} has already been submitted. If this is a mistake, contact the CGRSA office.`);
    }
    newPays[d.id] = d; upsert("payments", d, null, null, d.by);
  }

  // registrations
  for (const d of puts("regs")) {
    const ex = await getDoc(db, "regs", d.id), s = await student((ex || d).studentId);
    if (!s) throw new HttpError("Skater not found.");
    if (!isA) {
      if (!canSee(s)) throw new HttpError("You can’t change this registration.", 403);
      if (ex) {
        Object.assign(d, { studentId: ex.studentId, eventId: ex.eventId, raceNo: ex.raceNo ?? null, by: ex.by, created: ex.created });
        const okMove = d.status === ex.status || (["unpaid", "rejected"].includes(ex.status) && d.status === "pending" && newPays[d.paymentId]?.regIds?.includes(d.id));
        if (!okMove) throw new HttpError("Payment status can only be changed by CGRSA.", 403);
        if (d.status === ex.status) d.paymentId = ex.paymentId;
      } else {
        const e = await getDoc(db, "events", d.eventId); if (!e || !e.open) throw new HttpError("Registration for this championship is closed.");
        const dup = await db.prepare("SELECT 1 FROM docs WHERE coll='regs' AND json_extract(data,'$.studentId')=? AND json_extract(data,'$.eventId')=?").bind(d.studentId, d.eventId).first();
        if (dup) throw new HttpError(`${s.name} is already registered for this championship.`);
        Object.assign(d, { raceNo: null, by: me.id, created: nowISO() });
        if (!(d.status === "unpaid" || (d.status === "pending" && newPays[d.paymentId]?.regIds?.includes(d.id)))) d.status = "unpaid";
      }
    }
    upsert("regs", d, s.guardianId, s.coachId, d.by);
  }

  // objections
  for (const d of puts("objections")) {
    const ex = await getDoc(db, "objections", d.id);
    if (!isA) {
      if (ex) { if (same(ex, d)) continue; throw new HttpError("A submitted objection can’t be changed.", 403); }
      if (!/^\d{12}$/.test(d.utr || "")) throw new HttpError("Enter the 12-digit UTR.");
      Object.assign(d, { by: me.id, fee: "pending", decision: "review", created: nowISO() }); delete d.decisionNote; delete d.feeNote; delete d.decidedBy; delete d.decidedAt;
    }
    if (!ex || ex.utr !== d.utr) {
      const dup = await db.prepare("SELECT 1 FROM docs WHERE ((coll='payments' AND json_extract(data,'$.status')!='rejected') OR (coll='objections' AND json_extract(data,'$.fee')!='rejected')) AND json_extract(data,'$.utr')=? AND id!=? LIMIT 1").bind(d.utr, d.id).first();
      if (dup) throw new HttpError(`UTR ${d.utr} has already been used.`);
    }
    upsert("objections", d, null, null, d.by);
  }

  // admin-only collections
  if (isA) {
    for (const c of ["clubs", "coaches", "events"]) for (const d of puts(c)) upsert(c, d);
    for (const c of ["results", "res"]) for (const d of puts(c)) upsert(c, { id: d.id, v: d.v });
    for (const c of Object.keys(ch)) for (const id of ch[c].del || []) {
      if (c === "users") { const u = await getDoc(db, "users", id); if (u?.role === "admin") throw new HttpError("The admin account can’t be deleted."); stmts.push(db.prepare("DELETE FROM creds WHERE uid=?").bind(id), db.prepare("DELETE FROM sessions WHERE uid=?").bind(id)); }
      stmts.push(db.prepare("DELETE FROM docs WHERE coll=? AND id=?").bind(c, String(id)));
    }
    // a disabled account is signed out everywhere
    for (const d of puts("users")) if (d.active === false) stmts.push(db.prepare("DELETE FROM sessions WHERE uid=?").bind(d.id));
  }

  for (const a of (body.audit || []).slice(0, isA ? 200 : 20)) stmts.push(audit(db, me.name, a.what));
  if (!stmts.length) return { ok: true, notes };
  stmts.push(bump(db));
  for (let i = 0; i < stmts.length; i += 90) await db.batch(stmts.slice(i, i + 90));
  return { ok: true, notes };
}

/* ---------------- routes ---------------- */
async function api(req, env, url) {
  const db = env.DB; await init(env);
  const path = url.pathname.replace(/^\/api\//, ""), method = req.method;
  if (method === "POST" && req.headers.get("x-cgrsa") !== "1") return bad("Bad request.", 400); // simple CSRF guard
  const body = method === "POST" && !path.startsWith("file") ? await req.json().catch(() => ({})) : {};
  const ip = req.headers.get("cf-connecting-ip") || "";

  if (path === "state" && method === "GET") {
    const s = await session(req, db);
    if (!s || !s.mfa) return json({ me: null, setup: !(await adminExists(db)) });
    const v = await version(db);
    if (url.searchParams.get("v") === String(v)) return json({ same: true });
    const db2 = await state(db, s.user);
    return json({ v, me: db2.users.find((u) => u.id === s.user.id), db: db2 });
  }

  if (path === "login" && method === "POST") {
    const id = str(body.id, 120).toLowerCase(), k = "login:" + id;
    if (!id || (await throttled(db, k))) return bad("Too many attempts. Please wait 15 minutes and try again.", 429);
    const list = await usersByLogin(db, id);
    let user = null;
    for (const u of list) { const c = await db.prepare("SELECT pass FROM creds WHERE uid=?").bind(u.id).first(); if (c && (await checkPw(body.pw, c.pass))) { user = u; break; } }
    if (!user) { await failed(db, k); return bad("Mobile number/email or password is incorrect.", 401); }
    await cleared(db, k);
    if (user.active === false) return bad("This account has been disabled. Contact the CGRSA office.", 403);
    if (user.pending) return json({ pending: true, name: user.name });
    if (user.role === "admin") {
      const c = await db.prepare("SELECT totp FROM creds WHERE uid=?").bind(user.id).first();
      if (!c.totp) { const secret = b32enc(rand(20)); const ck = await newSession(db, user, false, secret);
        return json({ mfa: "setup", secret, uri: `otpauth://totp/CGRSA%20Portal:${encodeURIComponent(user.login)}?secret=${secret}&issuer=CGRSA%20Portal` }, 200, { "set-cookie": ck }); }
      return json({ mfa: "code" }, 200, { "set-cookie": await newSession(db, user, false) });
    }
    await db.batch([audit(db, user.name, `Signed in (${user.login})`)]);
    return json({ ok: true }, 200, { "set-cookie": await newSession(db, user, true) });
  }

  if (path === "mfa" && method === "POST") {
    const tok = cookieOf(req); if (!tok) return bad("Please sign in again.", 401);
    const h = await sha256hex(tok), s = await db.prepare("SELECT * FROM sessions WHERE h=?").bind(h).first();
    if (!s || s.exp < Date.now()) return bad("Please sign in again.", 401);
    const k = "mfa:" + s.uid; if (await throttled(db, k)) return bad("Too many attempts. Please wait 15 minutes and try again.", 429);
    const c = await db.prepare("SELECT totp FROM creds WHERE uid=?").bind(s.uid).first(), secret = s.pend || c?.totp;
    if (!secret || !(await totpOk(secret, str(body.code, 6)))) { await failed(db, k); return bad("That code isn’t right. Check the time on your phone and try again.", 401); }
    await cleared(db, k);
    const user = await getDoc(db, "users", s.uid), st = [db.prepare("UPDATE sessions SET mfa=1, pend=NULL WHERE h=?").bind(h), audit(db, user.name, "Signed in (admin, with authenticator code)")];
    if (s.pend) st.push(db.prepare("UPDATE creds SET totp=? WHERE uid=?").bind(s.pend, s.uid), audit(db, user.name, "Set up the authenticator app"));
    await db.batch(st); return json({ ok: true });
  }

  if (path === "logout" && method === "POST") {
    const tok = cookieOf(req); if (tok) await db.prepare("DELETE FROM sessions WHERE h=?").bind(await sha256hex(tok)).run();
    return json({ ok: true }, 200, { "set-cookie": clearCookie });
  }

  if (path === "signup" && method === "POST") {
    const k = "signup:" + ip; if (await throttled(db, k)) return bad("Too many attempts. Please wait 15 minutes and try again.", 429);
    const role = body.role === "coach" ? "coach" : "guardian", name = str(body.name, 80).replace(/\s+/g, " "), phone = str(body.phone, 10), email = str(body.email, 120);
    if (name.split(" ").length < 2) return bad("Please enter your full name (first and last name).");
    if (!phoneOk(phone)) return bad("Enter a valid 10-digit mobile number.");
    if (email && !/^\S+@\S+\.\S+$/.test(email)) return bad("Enter a valid email address, or leave it empty.");
    if (!pwOk(body.p1)) return bad("Use at least 8 characters, with letters and a number.");
    const ex = (await usersByLogin(db, phone)).find((u) => u.login === phone);
    const hasPass = ex && (await db.prepare("SELECT 1 FROM creds WHERE uid=? AND pass IS NOT NULL").bind(ex.id).first());
    if (hasPass) return bad("An account already exists for this mobile number. Sign in, or use “Forgot password?”.");
    const pass = await hashPw(body.p1);
    if (role === "guardian") {
      if (ex) {
        if (ex.role !== "guardian") return bad("This mobile number belongs to another account. Contact the CGRSA office.");
        const kids = (await all(db, "SELECT data FROM docs WHERE coll='students' AND g=?", ex.guardianId)).map(parse);
        if (!body.cdob) return json({ claim: true, error: "Skaters are already registered under this number. Enter one child’s date of birth to confirm." }, 400);
        if (!kids.some((s) => s.dob === body.cdob)) { await failed(db, k); return json({ claim: true, error: "That date of birth doesn’t match the skaters registered under this number." }, 400); }
        await db.batch([db.prepare("UPDATE docs SET data=? WHERE coll='users' AND id=?").bind(JSON.stringify({ ...ex, name, alt: email }), ex.id),
          db.prepare("INSERT OR REPLACE INTO creds (uid, pass) VALUES (?, ?)").bind(ex.id, pass), audit(db, name, `Created parent account ${phone} (linked ${kids.length} existing skater${kids.length > 1 ? "s" : ""})`), bump(db)]);
        return json({ ok: true, msg: `Account created. ${kids.length} skater${kids.length > 1 ? "s are" : " is"} linked to your account. Please sign in.` });
      }
      const gid = rid("g"), u = { id: "u-" + gid, role: "guardian", guardianId: gid, name, login: phone, alt: email, active: true, created: nowISO() };
      await db.batch([db.prepare("INSERT INTO docs (coll, id, data) VALUES ('users', ?, ?)").bind(u.id, JSON.stringify(u)), db.prepare("INSERT INTO creds (uid, pass) VALUES (?, ?)").bind(u.id, pass), audit(db, name, `Created parent account ${phone}`), bump(db)]);
      return json({ ok: true, msg: "Account created. Please sign in." });
    }
    if (ex) return bad("This mobile number is already registered as a parent’s number. Use a different number for your coach account, or contact the CGRSA office.");
    const u = { id: rid("u-req"), role: "coach", coachId: null, pending: true, name, login: phone, alt: email, active: true, created: nowISO() };
    await db.batch([db.prepare("INSERT INTO docs (coll, id, data) VALUES ('users', ?, ?)").bind(u.id, JSON.stringify(u)), db.prepare("INSERT INTO creds (uid, pass) VALUES (?, ?)").bind(u.id, pass), audit(db, name, `Requested a coach account (${phone})`), bump(db)]);
    return json({ ok: true, pending: true, name });
  }

  if (path === "reset" && method === "POST") {
    const id = str(body.id, 120).toLowerCase(), k = "reset:" + id;
    if (await throttled(db, k)) return bad("Too many attempts. Please wait 15 minutes and try again.", 429);
    const u = (await usersByLogin(db, id)).find((x) => x.resetCode);
    if (!u || !safeEq(String(u.resetCode), str(body.code, 6)) || Date.now() > (u.resetUntil || 0)) { await failed(db, k); return bad("That reset code isn’t valid. Ask CGRSA for a new one."); }
    if (!pwOk(body.p1)) return bad("Use at least 8 characters, with letters and a number.");
    const nu = { ...u }; delete nu.resetCode; delete nu.resetUntil;
    await db.batch([db.prepare("UPDATE docs SET data=? WHERE coll='users' AND id=?").bind(JSON.stringify(nu), u.id), db.prepare("INSERT OR REPLACE INTO creds (uid, pass, totp) VALUES (?, ?, (SELECT totp FROM creds WHERE uid=?))").bind(u.id, await hashPw(body.p1), u.id),
      db.prepare("DELETE FROM sessions WHERE uid=?").bind(u.id), audit(db, u.name, `Set a new password with a reset code (${u.login})`), bump(db)]);
    await cleared(db, k); return json({ ok: true, login: u.login });
  }

  if (path === "setup" && method === "POST") {
    const k = "setup"; if (await throttled(db, k)) return bad("Too many attempts. Please wait 15 minutes and try again.", 429);
    if (!safeEq(await sha256hex(str(body.code, 40).toUpperCase()), SETUP_HASH)) { await failed(db, k); return bad("That setup code isn’t right."); }
    const email = str(body.email, 120).toLowerCase(), name = str(body.name, 80);
    if (!/^\S+@\S+\.\S+$/.test(email)) return bad("Enter a valid email address.");
    if (!pwOk(body.p1)) return bad("Use at least 8 characters, with letters and a number.");
    const admin = parse(await db.prepare("SELECT data FROM docs WHERE coll='users' AND json_extract(data,'$.role')='admin' LIMIT 1").first());
    if (admin) { // recovery: new password, authenticator set up again at next sign-in
      if (admin.login.toLowerCase() !== email) return bad("Enter the admin account’s current login email.");
      await db.batch([db.prepare("INSERT OR REPLACE INTO creds (uid, pass, totp) VALUES (?, ?, NULL)").bind(admin.id, await hashPw(body.p1)), db.prepare("DELETE FROM sessions WHERE uid=?").bind(admin.id), audit(db, admin.name, "Recovered the admin account with the setup code"), bump(db)]);
      return json({ ok: true, msg: "Admin password reset. Sign in and set up your authenticator app again." });
    }
    if (name.length < 3) return bad("Enter your name.");
    const u = { id: "u-admin", role: "admin", name, login: email, mfa: true, active: true, created: nowISO() };
    await db.batch([db.prepare("INSERT INTO docs (coll, id, data) VALUES ('users', ?, ?)").bind(u.id, JSON.stringify(u)), db.prepare("INSERT INTO creds (uid, pass) VALUES (?, ?)").bind(u.id, await hashPw(body.p1)), audit(db, name, "Created the admin account"), bump(db)]);
    await cleared(db, k); return json({ ok: true, msg: "Admin account created. Sign in to set up your authenticator app." });
  }

  // everything below needs a signed-in user
  const s = await session(req, db);
  if (!s || !s.mfa) return bad("Please sign in again.", 401);
  const me = s.user;

  if (path === "password" && method === "POST") {
    const c = await db.prepare("SELECT pass FROM creds WHERE uid=?").bind(me.id).first();
    if (!(await checkPw(body.cur, c?.pass))) return bad("Current password is incorrect.");
    if (!pwOk(body.p1)) return bad("Use at least 8 characters, with letters and a number.");
    await db.batch([db.prepare("UPDATE creds SET pass=? WHERE uid=?").bind(await hashPw(body.p1), me.id), db.prepare("DELETE FROM sessions WHERE uid=? AND h!=?").bind(me.id, await sha256hex(cookieOf(req))), audit(db, me.name, "Changed own password")]);
    return json({ ok: true });
  }

  if (path === "sync" && method === "POST") {
    try { return json(await sync(db, me, body)); } catch (e) { if (e instanceof HttpError) return bad(e.message, e.s); throw e; }
  }

  if (path === "file" && method === "POST") {
    const ct = req.headers.get("content-type") || "";
    if (!/^(image\/(jpeg|png)|application\/pdf)$/.test(ct)) return bad("Only JPG, PNG or PDF files can be uploaded.");
    const buf = await req.arrayBuffer(); if (!buf.byteLength || buf.byteLength > MAX_FILE) return bad("The file is too large (maximum 1.9 MB).");
    const today = await db.prepare("SELECT COUNT(*) n FROM files WHERE owner=? AND created > ?").bind(me.id, new Date(Date.now() - 86400e3).toISOString()).first();
    if (me.role !== "admin" && today.n > 300) return bad("Too many uploads today. Contact the CGRSA office.", 429);
    const id = rid("f"); await db.prepare("INSERT INTO files (id, owner, mime, name, data, created) VALUES (?, ?, ?, ?, ?, ?)").bind(id, me.id, ct, str(req.headers.get("x-name"), 120), buf, nowISO()).run();
    return json({ url: "/api/file/" + id });
  }
  const fm = path.match(/^file\/(f[a-z0-9]{6,12})$/);
  if (fm && method === "GET") {
    const f = await db.prepare("SELECT owner, mime, data FROM files WHERE id=?").bind(fm[1]).first();
    if (!f || (me.role !== "admin" && f.owner !== me.id)) return bad("Not found.", 404);
    return new Response(f.data, { headers: { "content-type": f.mime, "cache-control": "private, max-age=3600", "x-content-type-options": "nosniff", "content-security-policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox" } });
  }
  return bad("Not found.", 404);
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname.startsWith("/api/")) {
      try { return await api(req, env, url); }
      catch (e) { console.error(e && e.stack || e); return bad("Something went wrong on the server. Please try again.", 500); }
    }
    return env.ASSETS.fetch(req);
  },
};
