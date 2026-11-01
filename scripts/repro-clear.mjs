/** 诊断/取证：设置页「清空全部数据」两步确认 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const APP = 'http://127.0.0.1:7788';
const PORT = 9392;
const TMP = path.join(process.env.LOCALAPPDATA, 'Temp', 'wb_clear_data');
const PROF = path.join(process.env.LOCALAPPDATA, 'Temp', 'wb_clear_prof');
const OUT = 'E:/vs_code_js/workbench/_review';
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(PROF, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
const cfg = (dir) => fetch(APP + '/api/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataDir: dir }) });
await cfg(TMP);

const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
  '--remote-debugging-port=' + PORT, '--user-data-dir=' + PROF, '--window-size=1440,900', APP + '/#/dashboard',
], { stdio: 'ignore' });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const l = await (await fetch('http://127.0.0.1:' + PORT + '/json/list')).json();
      const p = l.find((t) => t.type === 'page');
      if (p) return p;
    } catch { /* ignore */ }
    await sleep(300);
  }
  throw new Error('no chrome');
}
const target = await waitTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
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
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { resolve: res, reject: rej }); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};
const shot = async (name) => {
  const png = await send('Page.captureScreenshot', { format: 'png' });
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, name + '.png'), Buffer.from(png.data, 'base64'));
};
const visibleDialogs = 'JSON.stringify([...document.querySelectorAll(".t-dialog")].map(function(d){var r=d.getBoundingClientRect();var c=d.closest(".t-dialog__ctx");return {t:d.innerText.split("\\n")[0].slice(0,20),h:Math.round(r.height),ctx:c?getComputedStyle(c).display:"none"};}).filter(function(x){return x.h>10;}))';

await send('Runtime.enable');
await send('Page.enable');
await sleep(2400);
await ev('(function(){var b=[...document.querySelectorAll("button")].find(function(x){return x.textContent.includes("先看看示例数据");});if(b)b.click();return true;})()');
await sleep(1500);
console.log('初始数据 todos:', (await (await fetch(APP + '/api/doc/todos')).json()).items.length);

await ev('location.hash = "#/settings"');
await sleep(1300);
await ev('(function(){var row=[...document.querySelectorAll(".setting-row")].find(function(r){return r.innerText.includes("清空全部数据");});var b=row&&row.querySelector("button");if(b)b.click();return !!b;})()');
await sleep(800);
console.log('① 第一步确认框:', await ev(visibleDialogs));
await shot('clear-step1');

await ev('(function(){var b=document.querySelector("[data-test=\\"confirm-ok\\"]");if(b)b.click();return !!b;})()');
await sleep(1000);
console.log('② 点确定后可见弹窗:', await ev(visibleDialogs));
console.log('   二次确认输入框存在:', await ev('!!document.querySelector("[data-test=\\"prompt-input\\"]")'));
console.log('   确定清空按钮禁用:', await ev('(function(){var b=document.querySelector("[data-test=\\"prompt-ok\\"]");return b?(b.disabled||b.classList.contains("t-is-disabled")):"无按钮";})()'));
await shot('clear-step2');

await ev('(function(){var inp=document.querySelector("[data-test=\\"prompt-input\\"] input");Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value").set.call(inp,"清空");inp.dispatchEvent(new Event("input",{bubbles:true}));return true;})()');
await sleep(400);
console.log('③ 输入「清空」后按钮禁用:', await ev('(function(){var b=document.querySelector("[data-test=\\"prompt-ok\\"]");return b?(b.disabled||b.classList.contains("t-is-disabled")):"无按钮";})()'));
await ev('(function(){var b=document.querySelector("[data-test=\\"prompt-ok\\"]");if(b)b.click();return !!b;})()');
await sleep(2000);

const left = {};
for (const n of ['projects', 'todos', 'ideas', 'reports']) left[n] = (await (await fetch(APP + '/api/doc/' + n)).json()).items.length;
console.log('④ 清空后条目数:', JSON.stringify(left));
console.log('   可见弹窗:', await ev(visibleDialogs));
console.log('   提示:', await ev('document.body.innerText.includes("已清空")'));
await shot('clear-done');
console.log('⑤ 控制台报错:', errors.slice(0, 3));

await cfg('E:/vs_code_js/workbench/data');
fs.rmSync(TMP, { recursive: true, force: true });
ws.close();
chrome.kill();
process.exit(0);
