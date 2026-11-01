/**
 * 快速看页面：无头 Chrome 打开指定 hash 页面，收集报错并截图
 * 用法：node scripts/shot.mjs reports 1200
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';

const page = process.argv[2] ?? 'dashboard';
const width = Number(process.argv[3] ?? 1440);
const height = Number(process.argv[4] ?? 900);
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9411;
const PROFILE = `${process.env.LOCALAPPDATA}/Temp/wb_shot_profile`;

const chrome = spawn(
  CHROME,
  [
    '--headless=new',
    '--disable-gpu',
    '--no-sandbox',
    '--hide-scrollbars',
    '--no-first-run',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    `--window-size=${width},${height}`,
    `http://127.0.0.1:7788/#/${process.argv.includes('--demo') ? 'dashboard' : page}`,
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function findPage() {
  for (let i = 0; i < 50; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const target = list.find((t) => t.type === 'page');
      if (target) return target;
    } catch {
      /* ignore */
    }
    await sleep(300);
  }
  throw new Error('chrome 未就绪');
}

const target = await findPage();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});

let id = 0;
const pending = new Map();
const errors = [];
ws.addEventListener('message', (ev) => {
  const msg = JSON.parse(ev.data);
  if (msg.id && pending.has(msg.id)) {
    const p = pending.get(msg.id);
    pending.delete(msg.id);
    if (msg.error) p.reject(new Error(msg.error.message));
    else p.resolve(msg.result);
    return;
  }
  if (msg.method === 'Runtime.exceptionThrown') {
    errors.push(msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(`${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
  }
});

const send = (method, params = {}) =>
  new Promise((resolve, reject) => {
    const i = ++id;
    pending.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
  });

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload');
await sleep(2600);

// 需要数据时先在仪表盘点「先看看示例数据」
if (process.argv.includes('--demo')) {
  const clicked = await send('Runtime.evaluate', {
    expression: `(() => {
      const btn = [...document.querySelectorAll('button')].find(b => b.textContent.includes('先看看示例数据'));
      if (!btn) return 'no-button';
      btn.click();
      return 'clicked';
    })()`,
    returnByValue: true,
  });
  console.log('DEMO', clicked.result.value);
  await sleep(1200);
  if (page !== 'dashboard') {
    await send('Runtime.evaluate', { expression: `location.hash = '#/${page}'`, returnByValue: true });
    await sleep(1600);
  }
}

const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
fs.mkdirSync('E:/vs_code_js/workbench/_review', { recursive: true });
const file = `E:/vs_code_js/workbench/_review/vue-${page}.png`;
fs.writeFileSync(file, Buffer.from(shot.data, 'base64'));

const body = await send('Runtime.evaluate', { expression: 'document.body.innerText.slice(0, 400)', returnByValue: true });
console.log('SHOT', file);
console.log('TEXT', JSON.stringify(body.result.value ?? ''));
console.log('ERRORS', errors.length ? JSON.stringify(errors.slice(0, 8), null, 1) : 'none');

ws.close();
chrome.kill();
process.exit(0);
