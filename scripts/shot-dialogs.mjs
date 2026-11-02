/** 临时：截取两个弹窗和待办页，用于人工核对间距 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CHROME, ROOT } from './env.mjs';
const APP = 'http://127.0.0.1:7788';
const PORT = 9381;
const TMP = path.join(process.env.LOCALAPPDATA, 'Temp', 'wb_shot_ui');
const OUT = `${ROOT}/_review`;
fs.rmSync(TMP, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
await fetch(`${APP}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataDir: TMP }) });

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${path.join(process.env.LOCALAPPDATA, 'Temp', 'wb_shot_ui_prof')}`,
  '--window-size=1440,900', `${APP}/#/dashboard`,
], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function wait() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p;
    } catch { /* ignore */ }
    await sleep(300);
  }
  throw new Error('no chrome');
}
const target = await wait();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const png = await send('Page.captureScreenshot', { format: 'png' });
  fs.writeFileSync(path.join(OUT, `${name}.png`), Buffer.from(png.data, 'base64'));
  console.log('SHOT', name);
};

await send('Runtime.enable');
await send('Page.enable');
await sleep(2400);
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('先看看示例数据')); if (b) b.click(); return true; })()`);
await sleep(1500);

await ev(`location.hash = '#/projects'`);
await sleep(1200);
await ev(`(() => { const t = document.querySelectorAll('.node-row .node-title')[1]; if (t) t.click(); return true; })()`);
await sleep(1200);
// 让弹窗里有工时流水行，便于检查数字框与备注是否重叠
if ((await ev(`document.querySelectorAll('.t-dialog .time-log-row').length`)) === 0) {
  await ev(`(() => { const b = [...document.querySelectorAll('.t-dialog button')].find(x => x.textContent.includes('记录一条工时')); if (b) b.click(); return true; })()`);
  await sleep(900);
}
await shot('ui-task-dialog');
await ev(`(() => { const b = [...document.querySelectorAll('.t-dialog button')].find(x => x.textContent.includes('取消')); if (b) b.click(); return true; })()`);
await sleep(800);

await ev(`location.hash = '#/todos'`);
await sleep(1200);
await shot('ui-todos-page');
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('新建待办（填写细节）')); if (b) b.click(); return true; })()`);
await sleep(1200);
await shot('ui-todo-dialog');
// 关掉待办弹窗，免得挡住浮层截图
await ev(`(() => { const b = [...document.querySelectorAll('.t-dialog button')].find(x => x.textContent.trim() === '取消'); if (b) b.click(); return !!b; })()`);
await sleep(900);
await ev(`(() => { const b = document.querySelector('[data-test="open-capture"]') || [...document.querySelectorAll('button')].find((x) => x.getAttribute('aria-label') === '快速捕获'); if (b) b.click(); return !!b; })()`);
await sleep(900);
await ev(`(() => {
  const inp = document.querySelector('[data-test="capture-input"] input');
  if (!inp) return false;
  inp.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(inp, '明天 交周报 #周报 !高 2h @固定资产');
  inp.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(600);
await shot('ui-capture');

await fetch(`${APP}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataDir: `${ROOT}/data` }) });
fs.rmSync(TMP, { recursive: true, force: true });
ws.close();
chrome.kill();
process.exit(0);
