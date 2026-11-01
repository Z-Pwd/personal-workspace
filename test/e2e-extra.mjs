/**
 * 补充端到端：导出文件内容、导入、改数据目录、离线可用、并发版本冲突
 * 用法：node test/e2e-extra.mjs（需先启动服务）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { CHROME, ROOT } from '../scripts/env.mjs';

const APP = 'http://127.0.0.1:7788';
const PORT = 9401;
const TMP = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_extra_data');
const PROF = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_extra_profile');
const DL = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_extra_dl');
const REAL = `${ROOT}/data`;

for (const d of [TMP, PROF, DL]) fs.rmSync(d, { recursive: true, force: true });
for (const d of [TMP, DL]) fs.mkdirSync(d, { recursive: true });

const results = [];
const rec = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  —  ${note}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const putConfig = (dir) =>
  fetch(`${APP}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataDir: dir }) });

await putConfig(TMP);

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROF}`, '--window-size=1440,900', `${APP}/#/dashboard`,
], { stdio: 'ignore' });

async function waitTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch { /* 还没起来 */ }
    await sleep(300);
  }
  throw new Error('Chrome 没起来');
}

const target = await waitTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', () => r(null), { once: true }));

let seq = 0;
const pending = new Map();
const errors = [];
const requests = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { resolve: res, reject: rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const clickText = async (sel, text, wait = 900) => {
  const ok = await ev(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
};
const confirmOk = async () => {
  await ev(`(() => { const b = document.querySelector('[data-test="confirm-ok"]'); if (b) b.click(); return !!b; })()`);
  await sleep(900);
};

await send('Runtime.enable');
await send('Page.enable');
await send('Network.enable');
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await sleep(2400);

/* ===== 0. 首启动（空数据）===== */
const emptyHint = await ev(`document.body.innerText.includes('先看看示例数据') || document.body.innerText.includes('新建')`);
rec('空数据首次打开有引导', emptyHint === true);

await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('先看看示例数据')); if (b) b.click(); return true; })()`);
await sleep(1600);

/* ===== 1. 导出全部数据（JSON 内容可用）===== */
await ev(`location.hash = '#/settings'`);
await sleep(1300);
const exportClicked = await clickText('button', '导出全部数据', 1500);
const files1 = fs.readdirSync(DL).filter((f) => !f.endsWith('.crdownload'));
let exportOk = false;
let exportNote = files1.join(',');
if (files1.length) {
  const raw = fs.readFileSync(path.join(DL, files1[0]), 'utf8');
  try {
    const json = JSON.parse(raw);
    exportOk = json.kind === 'workbench-full-backup' && Object.keys(json.docs ?? {}).length === 4 && (json.docs.projects.items ?? []).length > 0;
    exportNote = `${files1[0]} · docs=${Object.keys(json.docs ?? {}).join('/')} · 项目 ${json.docs.projects.items.length} 个`;
  } catch (err) {
    exportNote = `JSON 解析失败：${err.message}`;
  }
}
rec('导出全部数据（文件内容可解析）', exportClicked && exportOk, exportNote);

/* ===== 2. 导出汇报为 Markdown ===== */
await ev(`location.hash = '#/reports'`);
await sleep(1300);
await clickText('button', '一键生成', 2600);
const before = new Set(fs.readdirSync(DL));
await ev(`(() => {
  const trigger = [...document.querySelectorAll('button')].find((b) => b.textContent.includes('导出'));
  if (trigger) trigger.click();
  return !!trigger;
})()`);
await sleep(700);
const menuItems = await ev(`JSON.stringify([...document.querySelectorAll('.t-dropdown__item, .t-dropdown-menu__item')].map((x) => x.innerText.trim()).filter(Boolean))`);
await ev(`(() => {
  const it = [...document.querySelectorAll('.t-dropdown__item, .t-dropdown-menu__item')].find((x) => x.innerText.includes('Markdown') || x.innerText.includes('md'));
  if (it) it.click();
  return !!it;
})()`);
await sleep(1600);
const after = fs.readdirSync(DL).filter((f) => !before.has(f) && !f.endsWith('.crdownload'));
let mdOk = false;
let mdNote = `${menuItems} → ${after.join(',')}`;
if (after.length) {
  const md = fs.readFileSync(path.join(DL, after[0]), 'utf8');
  mdOk = md.includes('# ') && md.length > 80;
  mdNote = `${after[0]} ${md.length} 字 · 前 40 字：${md.slice(0, 40).replace(/\n/g, ' ')}`;
}
rec('导出汇报 Markdown 有内容', mdOk, mdNote);

/* ===== 3. 导入数据（覆盖）===== */
const importPayload = {
  kind: 'workbench-full-backup',
  exportedAt: new Date().toISOString(),
  docs: {
    projects: { items: [{ id: 'imp-p1', title: '导入进来的项目', note: '', status: 'doing', priority: 'high', due: null, tags: ['导入'], estHours: 2, actHours: null, doneAt: null, timeLogs: [], children: [], createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), archived: false, deletedAt: null }] },
    todos: { items: [] },
    ideas: { items: [] },
    reports: { items: [] },
  },
};
const importFile = path.join(TMP, 'import-test.json');
fs.writeFileSync(importFile, JSON.stringify(importPayload), 'utf8');

await ev(`location.hash = '#/settings'`);
await sleep(1400);

const { root } = await send('DOM.getDocument', { depth: -1 });
const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector: 'input[type=file]' });
if (nodeId) {
  await send('DOM.setFileInputFiles', { files: [importFile], nodeId });
  await sleep(1200);
  await confirmOk();
  const doc = await (await fetch(`${APP}/api/doc/projects`)).json();
  rec('导入 JSON 覆盖数据', doc.items.length === 1 && doc.items[0].id === 'imp-p1', `导入后项目数=${doc.items.length}`);
} else {
  rec('导入 JSON 覆盖数据', false, '找不到 file input');
}

/* ===== 4. 改数据目录 ===== */
const NEWDIR = path.join(TMP, 'moved');
await ev(`location.hash = '#/settings'`);
await sleep(1000);
const inputSel = '.setting-row input, .t-input input';
const typedDir = await ev(`(() => {
  const inp = document.querySelector('.t-input input[placeholder^="例如"]');
  if (!inp) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, ${JSON.stringify(NEWDIR)});
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(400);
const saved = await clickText('button', '保存路径', 900);
await confirmOk(); // 切换目录需要确认
await sleep(1200);
const health = await (await fetch(`${APP}/api/health`)).json();
rec('修改数据目录生效', typedDir && saved && health.dataDir === NEWDIR, `dataDir=${health.dataDir}`);
await putConfig(TMP);

/* ===== 5. 离线：不请求任何外部域名 ===== */
requests.length = 0;
await send('Page.reload');
await sleep(3000);
const external = [...new Set(requests.filter((u) => u.startsWith('http') && !u.includes('127.0.0.1') && !u.includes('localhost')))];
rec('运行时零外网请求', external.length === 0, external.slice(0, 3).join(' | ') || `${requests.length} 个本地请求`);

/* ===== 6. 并发版本冲突（API 层）===== */
const cur = await (await fetch(`${APP}/api/doc/todos`)).json();
const put1 = await fetch(`${APP}/api/doc/todos`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: cur.rev, items: [] }) });
const put2 = await fetch(`${APP}/api/doc/todos`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ baseRev: cur.rev, items: [{ id: 'x' }] }) });
rec('旧版本号写入被拒绝（409）', put1.ok && put2.status === 409, `第一次 ${put1.status} / 第二次 ${put2.status}`);

rec('补充流程无控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '));

await putConfig(REAL);
console.log(`\n=== 共 ${results.length} 项，通过 ${results.filter((r) => r.ok).length}，失败 ${results.filter((r) => !r.ok).length} ===`);
const failed = results.filter((r) => !r.ok).map((r) => r.name);
if (failed.length) console.log('失败项：', failed.join(' | '));

ws.close();
chrome.kill();
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(DL, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
