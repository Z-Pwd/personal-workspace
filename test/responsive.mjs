/**
 * 自适应布局验收：5 种宽度 × 6 个页面，检查横向溢出、抽屉菜单、弹窗不出界
 * 用法：node test/responsive.mjs（需先启动服务）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CHROME, REVIEW, ROOT } from '../scripts/env.mjs';

const APP = 'http://127.0.0.1:7788';
const PORT = 9421;
const TMP = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_resp_data');
const PROF = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_resp_profile');
const SHOTS = path.join(REVIEW, 'responsive');
const REAL = `${ROOT}/data`;

fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(PROF, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(SHOTS, { recursive: true });

const results = [];
const rec = (name, ok, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  —  ${note}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfg = (dir) =>
  fetch(`${APP}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataDir: dir }) });

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
const send = (method, params = {}) => new Promise((res, rej) => {
  const id = ++seq;
  pending.set(id, { resolve: res, reject: rej });
  ws.send(JSON.stringify({ id, method, params }));
});
const ev = async (expr) => {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const png = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(SHOTS, `${name}.png`), Buffer.from(png.data, 'base64'));
};
const setViewport = async (width, height = 900) => {
  await send('Emulation.setDeviceMetricsOverride', {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: width <= 767,
  });
  await sleep(400);
};

await send('Runtime.enable');
await send('Page.enable');
await sleep(2400);
await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('先看看示例数据')); if (b) b.click(); return true; })()`);
await sleep(1600);

const ROUTES = ['dashboard', 'projects', 'todos', 'ideas', 'reports', 'settings'];
const WIDTHS = [2560, 1920, 1440, 1200, 992, 768, 430];

for (const width of WIDTHS) {
  await setViewport(width);
  let worst = { route: '', overflow: 0 };
  for (const route of ROUTES) {
    await ev(`location.hash = '#/${route}'`);
    await sleep(700);
    const info = await ev(`JSON.stringify({ sw: document.documentElement.scrollWidth, iw: window.innerWidth })`);
    const { sw, iw } = JSON.parse(info);
    const over = Math.max(0, sw - iw);
    if (over > worst.overflow) worst = { route, overflow: over };
  }
  rec(`${width}px：6 个页面无横向溢出`, worst.overflow <= 1, worst.overflow ? `${worst.route} 溢出 ${worst.overflow}px` : '全部贴合');
  // 顶栏搜索框与内容区右边缘必须对齐（这是"右侧白边"的直接检查）
  const align = await ev(`(() => {
    const box = document.querySelector('.search-box');
    const content = document.querySelector('.content');
    if (!box || !content) return 'none';
    const b = box.getBoundingClientRect();
    const c = content.getBoundingClientRect();
    // 内容区右边缘要减去它自己的 padding-right，才是"可见内容的右边界"
    const padR = parseFloat(getComputedStyle(content).paddingRight) || 0;
    return JSON.stringify({ gap: Math.round(c.right - padR - b.right), contentW: Math.round(c.width), vw: window.innerWidth });
  })()`);
  if (align === 'none') {
    rec(`${width}px：搜索框与内容区右对齐`, false, '找不到元素');
  } else {
    const a = JSON.parse(align);
    rec(`${width}px：搜索框与内容区右对齐`, Math.abs(a.gap) <= 2, `偏差 ${a.gap}px · 内容宽 ${a.contentW}/${a.vw}`);
  }

  if (width === 992 || width === 768) {
    await ev(`location.hash = '#/dashboard'`);
    await sleep(700);
    await shot(`${width}-dashboard`);
    await ev(`location.hash = '#/todos'`);
    await sleep(700);
    await shot(`${width}-todos`);
  }
  if (width === 1920 || width === 2560) {
    await ev(`location.hash = '#/dashboard'`);
    await sleep(700);
    await shot(`${width}-dashboard`);
  }
}

/* ===== 抽屉菜单 ===== */
await setViewport(430);
await ev(`location.hash = '#/todos'`);
await sleep(700);
const mobileState = await ev(`(() => {
  const btn = document.querySelector('[data-test="menu-btn"]');
  const side = document.querySelector('.side');
  const box = side.getBoundingClientRect();
  return JSON.stringify({
    btnVisible: !!btn && getComputedStyle(btn).display !== 'none',
    sideRight: Math.round(box.right),
  });
})()`);
const ms = JSON.parse(mobileState);
rec('430px：汉堡按钮出现、侧栏默认收起', ms.btnVisible && ms.sideRight <= 0, JSON.stringify(ms));

await ev(`(() => { document.querySelector('[data-test="menu-btn"]').click(); return true; })()`);
await sleep(500);
const opened = await ev(`(() => {
  const side = document.querySelector('.side');
  const box = side.getBoundingClientRect();
  const mask = document.querySelector('[data-test="side-mask"]');
  return JSON.stringify({ left: Math.round(box.left), width: Math.round(box.width), mask: !!mask });
})()`);
const op = JSON.parse(opened);
rec('430px：点汉堡能拉出侧栏（带遮罩）', op.left >= 0 && op.width > 200 && op.mask, JSON.stringify(op));
await shot('430-todos-drawer');

await ev(`(() => { document.querySelector('[data-test="side-mask"]').click(); return true; })()`);
await sleep(500);
const closed = await ev(`(() => Math.round(document.querySelector('.side').getBoundingClientRect().right))()`);
rec('430px：点遮罩能收起侧栏', closed <= 0, `right=${closed}`);

/* ===== 桌面端不应出现汉堡 ===== */
await setViewport(1440);
await sleep(400);
const desktopBtn = await ev(`(() => { const b = document.querySelector('[data-test="menu-btn"]'); return b ? getComputedStyle(b).display : 'none'; })()`);
const desktopSide = await ev(`Math.round(document.querySelector('.side').getBoundingClientRect().width)`);
rec('1440px：无汉堡按钮、侧栏常驻', desktopBtn === 'none' && desktopSide > 190, `btn=${desktopBtn} side=${desktopSide}`);

/* ===== 手机端弹窗不出界 ===== */
await setViewport(430);
await ev(`location.hash = '#/todos'`);
await sleep(800);
await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('新建待办（填写细节）')); if (b) b.click(); return !!b; })()`);
await sleep(900);
const dlg = await ev(`(() => {
  const d = [...document.querySelectorAll('.t-dialog')].filter((x) => x.getBoundingClientRect().height > 10).pop();
  if (!d) return 'none';
  const r = d.getBoundingClientRect();
  return JSON.stringify({ left: Math.round(r.left), right: Math.round(r.right), width: Math.round(r.width), vw: window.innerWidth });
})()`);
if (dlg === 'none') {
  rec('430px：弹窗不超出屏幕', false, '没找到弹窗');
} else {
  const dv = JSON.parse(dlg);
  rec('430px：弹窗不超出屏幕', dv.left >= 0 && dv.right <= dv.vw + 1, dlg);
  await shot('430-todo-dialog');
}

/* ===== 手机端三条主页面截图（供人工核对） ===== */
await ev(`(() => { const b = [...document.querySelectorAll('.t-dialog button')].find((x) => x.textContent.trim() === '取消'); if (b) b.click(); return !!b; })()`);
await sleep(600);
for (const route of ROUTES) {
  await ev(`location.hash = '#/${route}'`);
  await sleep(800);
  await shot(`430-${route}`);
}

rec('自适应流程无控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '));

await cfg(REAL);
const failed = results.filter((r) => !r.ok);
console.log(`\n=== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} ===`);
if (failed.length) console.log('失败项：', failed.map((f) => f.name).join(' | '));

ws.close();
chrome.kill();
fs.rmSync(TMP, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
