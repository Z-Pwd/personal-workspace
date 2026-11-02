#!/usr/bin/env node
/**
 * 个人工作台 —— 本地轻量服务
 * 只用 Node.js 标准库，零第三方依赖。
 * 职责：
 *   1) 托管 public/ 里的前端静态文件
 *   2) 读写用户指定文件夹里的 JSON 数据（原子写入 + 版本校验 + 自动备份）
 */
import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFile } from 'node:child_process';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(SERVER_DIR, '..');
const DIST_DIR = path.join(APP_DIR, 'dist');
const STATIC_DIR = DIST_DIR;
const CONFIG_FILE = path.join(APP_DIR, 'config.json');
const DOC_NAMES = new Set(['projects', 'todos', 'ideas', 'reports', 'templates']);
const DATA_FILES = {
  projects: 'projects.json',
  todos: 'todos.json',
  ideas: 'ideas.json',
  reports: 'reports.json',
  templates: 'templates.json',
};
const BACKUP_INTERVAL_MS = 5 * 60 * 1000; // 同一文件 5 分钟最多一份自动备份
const BACKUP_KEEP = 60;                   // _backups 里最多保留 60 份
const MAX_BODY = 20 * 1024 * 1024;
const AUTO_OPEN = !process.argv.includes('--no-open');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

/* ---------------- 配置 ---------------- */
function loadConfig() {
  const fallback = { dataDir: path.join(APP_DIR, 'data'), port: 7788 };
  try {
    const raw = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    const dataDir = typeof raw.dataDir === 'string' && raw.dataDir.trim()
      ? path.resolve(raw.dataDir) : fallback.dataDir;
    const port = Number.isInteger(raw.port) && raw.port > 1024 ? raw.port : fallback.port;
    return { dataDir, port };
  } catch {
    return fallback;
  }
}
const config = loadConfig();
const backupDir = () => path.join(config.dataDir, '_backups');
const docPath = (name) => path.join(config.dataDir, DATA_FILES[name]);

function ensureDirs() {
  fs.mkdirSync(config.dataDir, { recursive: true });
  fs.mkdirSync(backupDir(), { recursive: true });
}
function saveConfig() {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
}
ensureDirs();

/* ---------------- 工具 ---------------- */
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('请求体过大（上限 20MB）'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw.trim()) return resolve(null);
      try { resolve(JSON.parse(raw)); }
      catch { reject(Object.assign(new Error('请求体不是合法 JSON'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

async function readDoc(name) {
  const file = docPath(name);
  try {
    const raw = await fsp.readFile(file, 'utf8');
    const doc = JSON.parse(raw);
    if (!doc || !Array.isArray(doc.items)) throw new SyntaxError('结构不合法');
    return {
      schema: Number(doc.schema) || 1,
      rev: Number(doc.rev) || 0,
      updatedAt: typeof doc.updatedAt === 'string' ? doc.updatedAt : null,
      items: doc.items,
    };
  } catch (err) {
    if (err.code === 'ENOENT') {
      return { schema: 1, rev: 0, updatedAt: null, items: [] };
    }
    // 文件损坏：留一份现场副本，再从零开始（原始损坏文件不删）
    const bad = `${file}.corrupt-${Date.now()}`;
    await fsp.copyFile(file, bad).catch(() => {});
    console.warn(`[warn] ${name}.json 损坏，已另存为 ${path.basename(bad)}`);
    return { schema: 1, rev: 0, updatedAt: null, items: [], recovered: path.basename(bad) };
  }
}

async function backupIfNeeded(name) {
  const file = docPath(name);
  const stampFile = path.join(backupDir(), `.stamp-${name}`);
  try {
    const st = await fsp.stat(file);
    let last = 0;
    try { last = (await fsp.stat(stampFile)).mtimeMs; } catch { last = 0; }
    if (Date.now() - last < BACKUP_INTERVAL_MS) return;
    if (st.size === 0) return;
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    await fsp.copyFile(file, path.join(backupDir(), `${name}-${ts}.json`));
    await fsp.writeFile(stampFile, String(Date.now()), 'utf8');
    await pruneBackups();
  } catch (err) {
    if (err.code !== 'ENOENT') console.warn('[warn] 备份失败：', err.message);
  }
}

async function pruneBackups() {
  try {
    const files = (await fsp.readdir(backupDir()))
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ f, t: 0 }));
    const withTime = await Promise.all(files.map(async (x) => ({
      f: x.f,
      t: (await fsp.stat(path.join(backupDir(), x.f))).mtimeMs,
    })));
    withTime.sort((a, b) => b.t - a.t);
    for (const old of withTime.slice(BACKUP_KEEP)) {
      await fsp.unlink(path.join(backupDir(), old.f)).catch(() => {});
    }
  } catch { /* 忽略 */ }
}

async function writeDoc(name, items, baseRev) {
  const current = await readDoc(name);
  if (baseRev !== undefined && baseRev !== null && Number(baseRev) !== current.rev) {
    const err = new Error('数据已被其他页面修改');
    err.status = 409;
    err.payload = { error: 'conflict', message: '数据已在其他地方被修改，请刷新后再保存', rev: current.rev };
    throw err;
  }
  const doc = {
    schema: 1,
    rev: current.rev + 1,
    updatedAt: new Date().toISOString(),
    items,
  };
  await backupIfNeeded(name);
  const file = docPath(name);
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, JSON.stringify(doc, null, 2), 'utf8');
  await fsp.rename(tmp, file); // 原子替换，避免写一半断电导致文件损坏
  return doc;
}

function openFolder(dir) {
  if (process.platform === 'win32') execFile('explorer.exe', [dir], () => {});
  else if (process.platform === 'darwin') execFile('open', [dir], () => {});
  else execFile('xdg-open', [dir], () => {});
}

/* ---------------- 静态文件 ---------------- */
function serveStatic(pathname, res) {
  const rel = pathname === '/' ? '/index.html' : pathname;
  const file = path.normalize(path.join(STATIC_DIR, rel));
  if (!file.startsWith(STATIC_DIR)) return send(res, 403, '403 Forbidden');
  fs.readFile(file, (err, buf) => {
    if (err) {
      if (!path.extname(rel)) return serveStatic('/index.html', res);
      if (rel === '/index.html') {
        return send(
          res,
          503,
          '<!doctype html><meta charset="utf-8"><title>还没构建</title>'
            + '<div style="font-family:Microsoft YaHei;padding:60px;line-height:2">'
            + '<h2>前端还没有构建</h2>'
            + '<p>双击项目目录里的 <b>重新编译.bat</b>，或在命令行执行 <code>npm run build</code>，然后刷新本页。</p></div>',
        );
      }
      return send(res, 404, `404 Not Found: ${rel}`);
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(buf);
  });
}

/* ---------------- 路由 ---------------- */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  try {
    if (!pathname.startsWith('/api/')) return serveStatic(pathname, res);

    if (pathname === '/api/health') {
      return send(res, 200, { ok: true, name: '个人工作台', dataDir: config.dataDir, port: config.port });
    }

    if (pathname === '/api/config' && req.method === 'GET') {
      return send(res, 200, { dataDir: config.dataDir, port: config.port, appDir: APP_DIR, backupDir: backupDir() });
    }

    if (pathname === '/api/config' && req.method === 'PUT') {
      const body = await readBody(req);
      const next = typeof body?.dataDir === 'string' ? body.dataDir.trim() : '';
      if (!next) return send(res, 400, { error: 'dataDir 不能为空' });
      const abs = path.resolve(next);
      try {
        fs.mkdirSync(abs, { recursive: true });
        fs.mkdirSync(path.join(abs, '_backups'), { recursive: true });
        fs.accessSync(abs, fs.constants.W_OK);
      } catch (e) {
        return send(res, 400, { error: `文件夹不可写：${e.message}` });
      }
      config.dataDir = abs;
      saveConfig();
      ensureDirs();
      return send(res, 200, { ok: true, dataDir: config.dataDir });
    }

    if (pathname === '/api/open-folder' && req.method === 'POST') {
      const body = await readBody(req);
      const target = body?.target === 'app' ? APP_DIR : config.dataDir;
      openFolder(target);
      return send(res, 200, { ok: true, dir: target });
    }

    if (pathname === '/api/docs' && req.method === 'GET') {
      const out = [];
      for (const name of DOC_NAMES) {
        const doc = await readDoc(name);
        out.push({ name, rev: doc.rev, updatedAt: doc.updatedAt, count: doc.items.length });
      }
      return send(res, 200, { dataDir: config.dataDir, docs: out });
    }

    const docMatch = pathname.match(/^\/api\/doc\/([a-z]+)$/);
    if (docMatch) {
      const name = docMatch[1];
      if (!DOC_NAMES.has(name)) return send(res, 404, { error: `未知数据文件：${name}` });
      if (req.method === 'GET') {
        const doc = await readDoc(name);
        return send(res, 200, doc);
      }
      if (req.method === 'PUT') {
        const body = await readBody(req);
        if (!Array.isArray(body?.items)) return send(res, 400, { error: 'items 必须是数组' });
        const doc = await writeDoc(name, body.items, body.baseRev);
        return send(res, 200, doc);
      }
      return send(res, 405, { error: '方法不支持' });
    }

    // 手动全量备份：把所有数据打包成一个文件
    if (pathname === '/api/backup/all' && req.method === 'POST') {
      const ts = new Date().toISOString().replace(/[:.]/g, '-');
      const snapshot = { schema: 1, kind: 'workbench-full-backup', createdAt: new Date().toISOString(), dataDir: config.dataDir, docs: {} };
      for (const name of DOC_NAMES) snapshot.docs[name] = await readDoc(name);
      const file = path.join(backupDir(), `full-${ts}.json`);
      await fsp.writeFile(file, JSON.stringify(snapshot, null, 2), 'utf8');
      await pruneBackups();
      return send(res, 200, { ok: true, file });
    }

    if (pathname === '/api/backups' && req.method === 'GET') {
      const files = await fsp.readdir(backupDir()).catch(() => []);
      const rows = await Promise.all(files.filter((f) => f.endsWith('.json')).map(async (f) => {
        const st = await fsp.stat(path.join(backupDir(), f));
        return { file: f, size: st.size, mtime: st.mtime.toISOString() };
      }));
      rows.sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
      return send(res, 200, { dir: backupDir(), files: rows.slice(0, 80) });
    }

    return send(res, 404, { error: '接口不存在' });
  } catch (err) {
    const status = err.status || 500;
    if (status >= 500) console.error('[error]', err);
    return send(res, status, err.payload || { error: err.message || '服务器内部错误' });
  }
});

/* ---------------- 启动 ---------------- */
function listenOnce(port) {
  return new Promise((resolve, reject) => {
    const onError = (e) => { server.removeListener('listening', onListening); reject(e); };
    const onListening = () => { server.removeListener('error', onError); resolve(); };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, '127.0.0.1');
  });
}

async function start() {
  let port = config.port;
  for (let i = 0; i < 12; i++) {
    try {
      await listenOnce(port);
      break;
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err;
      console.log(`端口 ${port} 被占用，换 ${port + 1}`);
      port += 1;
      if (i === 11) throw err;
    }
  }
  const urlStr = `http://127.0.0.1:${port}`;
  console.log('');
  console.log('  个人工作台已启动');
  console.log(`  地址：${urlStr}`);
  console.log(`  数据文件夹：${config.dataDir}`);
  console.log('  关闭本窗口即停止服务（数据已写入本地文件）');
  console.log('');
  if (AUTO_OPEN && process.platform === 'win32') {
    execFile('cmd', ['/c', 'start', '', urlStr], () => {});
  }
}

process.on('unhandledRejection', (e) => console.error('[unhandled]', e));
start().catch((e) => { console.error('启动失败：', e); process.exit(1); });
