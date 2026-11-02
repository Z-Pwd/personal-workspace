/**
 * 第二批功能验收：快速捕获（语法/三种落点/快捷键）、文本批量导入、多标签页同步
 * 用法：node test/e2e-batch2.mjs（需先启动服务）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CHROME, ROOT } from '../scripts/env.mjs';

const APP = 'http://127.0.0.1:7788';
const PORT = 9411;
const TMP = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_b2_data');
const PROF = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_b2_profile');
const REAL = `${ROOT}/data`;

fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(PROF, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });

const results = [];
const rec = (name, ok, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  —  ${note}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfg = (dir) =>
  fetch(`${APP}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataDir: dir }) });
const doc = async (name) => (await (await fetch(`${APP}/api/doc/${name}`)).json()).items;

await cfg(TMP);

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
    } catch { /* 等 Chrome */ }
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
});
const send = (method, params = {}, sessionId) =>
  new Promise((res, rej) => {
    const id = ++seq;
    pending.set(id, { resolve: res, reject: rej });
    ws.send(JSON.stringify(sessionId ? { id, method, params, sessionId } : { id, method, params }));
  });
const rpc = async (expr, sessionId) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }, sessionId);
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const ev = (expr) => rpc(expr);
const ev2 = (sid, expr) => rpc(expr, sid);

/** 往 TDesign 输入框里写值 */
const typeInto = async (sel, text, sid) => {
  const fn = sid ? (e) => ev2(sid, e) : ev;
  return fn(`(() => {
    const host = document.querySelector(${JSON.stringify(sel)});
    if (!host) return 'no-host';
    const el = host.matches('input, textarea') ? host : host.querySelector('input, textarea');
    if (!el) return 'no-input';
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, ${JSON.stringify(text)});
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return 'ok';
  })()`);
};

/** 在输入框上派发按键（可带修饰键），走文档冒泡，覆盖全局快捷键 */
const pressKey = async (sel, key, mods = {}, sid) => {
  const fn = sid ? (e) => ev2(sid, e) : ev;
  return fn(`(() => {
    const host = document.querySelector(${JSON.stringify(sel)});
    const el = host ? (host.matches('input') ? host : host.querySelector('input')) ?? host : document.body;
    const opts = { key: ${JSON.stringify(key)}, code: ${JSON.stringify(key === ' ' ? 'Space' : key === 'Enter' ? 'Enter' : key)}, bubbles: true, cancelable: true, ctrlKey: ${!!mods.ctrl}, shiftKey: ${!!mods.shift}, metaKey: false, altKey: false };
    el.dispatchEvent(new KeyboardEvent('keydown', opts));
    return true;
  })()`);
};

const waitFor = async (sel, timeout = 4000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await ev(`!!document.querySelector(${JSON.stringify(sel)})`)) return true;
    await sleep(120);
  }
  return false;
};

await send('Runtime.enable');
await send('Page.enable');
await sleep(2400);

// 先灌入示例数据（有项目可用 @ 匹配）
await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('先看看示例数据')); if (b) b.click(); return true; })()`);
await sleep(1600);

/* ================= 1. 快速捕获：按钮打开 + 语法识别 ================= */
const todoBefore = (await doc('todos')).length;
await ev(`(() => { const b = document.querySelector('[data-test="open-capture"]'); if (b) b.click(); return !!b; })()`);
await waitFor('[data-test="capture-input"]');
rec('按钮能打开快速捕获', await ev(`!!document.querySelector('[data-test="capture-overlay"]')`));

const typed = await typeInto('[data-test="capture-input"]', '明天 交周报 #周报 !高 2h @固定资产');
rec('输入内容', typed === 'ok');
await sleep(500);
const preview = await ev(`JSON.stringify({
  title: document.querySelector('[data-test="capture-title"]')?.innerText ?? '',
  chips: [...document.querySelectorAll('[data-test="capture-preview"] .t-tag')].map((x) => x.innerText.trim()),
})`);
const pv = JSON.parse(preview);
rec('预览：标题干净', pv.title.includes('交周报') && !pv.title.includes('明天'), pv.title);
rec('预览：日期/标签/优先级/工时/@项目 全部识别', pv.chips.length >= 4, pv.chips.join(' | '));

await pressKey('[data-test="capture-input"]', 'Enter');
await sleep(1400);
const todosAfter = await doc('todos');
const created = todosAfter.find((t) => t.title.includes('交周报'));
rec(
  '回车 → 写进待办并落盘',
  !!created && created.tags.includes('周报') && created.priority === 'high' && todosAfter.length === todoBefore + 1,
  created ? `date=${created.date} tags=${created.tags} pri=${created.priority}` : '没找到',
);
rec('捕获后浮层自动关闭', !(await ev(`!!document.querySelector('[data-test="capture-overlay"]')`)));

/* ================= 2. 快捷键 Ctrl+Shift+Space ================= */
await pressKey('body', ' ', { ctrl: true, shift: true });
await sleep(600);
rec('Ctrl+Shift+Space 能唤起', await ev(`!!document.querySelector('[data-test="capture-overlay"]')`));

/* ================= 3. Ctrl+Enter → 灵感 ================= */
const ideasBefore = (await doc('ideas')).length;
await typeInto('[data-test="capture-input"]', '把盘点流程做成动画讲解');
await sleep(300);
await pressKey('[data-test="capture-input"]', 'Enter', { ctrl: true });
await sleep(1400);
const ideasAfter = await doc('ideas');
rec('Ctrl+Enter → 存为灵感', ideasAfter.length === ideasBefore + 1 && ideasAfter.some((i) => i.content.includes('动画讲解')), `灵感 ${ideasBefore} → ${ideasAfter.length}`);

/* ================= 4. Ctrl+Shift+Enter → 项目任务（不存在的项目自动建） ================= */
const projectsBefore = (await doc('projects')).length;
await ev(`(() => { const b = document.querySelector('[data-test="open-capture"]'); if (b) b.click(); return !!b; })()`);
await waitFor('[data-test="capture-input"]');
await typeInto('[data-test="capture-input"]', '做扫码原型 @盘点二期 3h');
await sleep(300);
await pressKey('[data-test="capture-input"]', 'Enter', { ctrl: true, shift: true });
await sleep(1500);
const projAfter = await doc('projects');
const newProject = projAfter.find((p) => p.title.includes('盘点二期'));
const newChild = newProject?.children?.find((c) => c.title.includes('扫码原型'));
rec(
  'Ctrl+Shift+Enter → 建项目任务（自动建项目）',
  projAfter.length === projectsBefore + 1 && !!newChild && newChild.estHours === 3,
  newChild ? `${newProject.title} / ${newChild.title} est=${newChild.estHours}` : '没找到',
);

/* ================= 5. Esc 关闭 ================= */
await ev(`(() => { const b = document.querySelector('[data-test="open-capture"]'); if (b) b.click(); return !!b; })()`);
await waitFor('[data-test="capture-input"]');
await pressKey('[data-test="capture-input"]', 'Escape');
await sleep(500);
rec('Esc 能关闭浮层', !(await ev(`!!document.querySelector('[data-test="capture-overlay"]')`)));

/* ================= 6. 文本批量导入 ================= */
await ev(`location.hash = '#/settings'`);
await sleep(1200);
await ev(`(() => { const b = document.querySelector('[data-test="open-bulk"]'); if (b) b.click(); return !!b; })()`);
await sleep(800);
const bulkText = ['- 整理会议纪要', '1. 给财务发模板 #沟通 !高 明天', '3h 写盘点流程文档 #文档'].join('\n');
const typedBulk = await typeInto('[data-test="bulk-textarea"]', bulkText);
await sleep(600);
const bulkRows = await ev(`document.querySelectorAll('[data-test="bulk-preview"] .bulk-row').length`);
rec('批量导入：三行全部识别', typedBulk === 'ok' && bulkRows === 3, `预览 ${bulkRows} 行`);
await ev(`(() => { const b = document.querySelector('[data-test="bulk-import"]'); if (b) b.click(); return !!b; })()`);
await sleep(1500);
const afterBulk = await doc('todos');
const bulkTitles = afterBulk.map((t) => t.title);
rec(
  '批量导入：标题/标签/优先级/工时都落盘',
  bulkTitles.some((t) => t.includes('整理会议纪要')) &&
    bulkTitles.some((t) => t.includes('给财务发模板')) &&
    afterBulk.some((t) => t.title.includes('写盘点流程文档')) &&
    afterBulk.find((t) => t.title.includes('给财务发模板'))?.tags.includes('沟通') &&
    afterBulk.find((t) => t.title.includes('给财务发模板'))?.priority === 'high',
  `待办总数 ${afterBulk.length}`,
);

/* ================= 7. 多标签页同步 ================= */
const { targetId: tab2 } = await send('Target.createTarget', { url: `${APP}/#/todos` });
const { sessionId } = await send('Target.attachToTarget', { targetId: tab2, flatten: true });
await send('Runtime.enable', {}, sessionId);
await send('Page.enable', {}, sessionId);
await sleep(2600);
const tab2Before = await ev2(sessionId, `document.body.innerText.includes('另一个标签页写进来的待办')`);
// 在 tab1 里用快速捕获写一条
await ev(`(() => { const b = document.querySelector('[data-test="open-capture"]'); if (b) b.click(); return !!b; })()`);
await waitFor('[data-test="capture-input"]');
await typeInto('[data-test="capture-input"]', '另一个标签页写进来的待办');
await sleep(250);
await pressKey('[data-test="capture-input"]', 'Enter');
await sleep(2500);
const tab2After = await ev2(sessionId, `document.body.innerText.includes('另一个标签页写进来的待办')`);
rec('多标签页自动同步（无需手动刷新）', tab2Before === false && tab2After === true, `${tab2Before} → ${tab2After}`);

rec('第二批流程无控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '));

await cfg(REAL);
const failed = results.filter((r) => !r.ok);
console.log(`\n=== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} ===`);
if (failed.length) console.log('失败项：', failed.map((f) => f.name).join(' | '));

ws.close();
chrome.kill();
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
