/**
 * 生成 README 用的截图（临时数据目录 + 示例数据，跑完还原配置）
 * 用法：node scripts/capture.mjs
 * 产出：docs/screenshots/*.png
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const APP = 'http://127.0.0.1:7788';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9361;
const OUT = path.join(process.cwd(), 'docs', 'screenshots');
const TMP = process.env.CAPTURE_DATA_DIR || 'E:/工作台数据';
const PROFILE = path.join(process.env.LOCALAPPDATA ?? 'C:/Windows/Temp', 'Temp', 'wb_capture_profile');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 1) 记住真实数据目录，切到临时目录
const realCfg = await (await fetch(`${APP}/api/config`)).json();
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
await fetch(`${APP}/api/config`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dataDir: TMP }),
});

// 2) 启动浏览器
const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,900', `${APP}/#/dashboard`,
], { stdio: 'ignore' });

async function waitTarget() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch { /* ignore */ }
    await sleep(300);
  }
  throw new Error('chrome 未就绪');
}

const target = await waitTarget();
const ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message)); else p.resolve(m.result);
  }
});
const send = (method, params = {}) => new Promise((res, rej) => {
  const i = ++id;
  pending.set(i, { resolve: res, reject: rej });
  ws.send(JSON.stringify({ id: i, method, params }));
});
const ev = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1.5, mobile: false });
await sleep(2400);

// 3) 载入示例数据
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('先看看示例数据')); if (b) b.click(); return true; })()`);
await sleep(1600);

await fsp.mkdir(OUT, { recursive: true });

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png' });
  const file = path.join(OUT, `${name}.png`);
  await fsp.writeFile(file, Buffer.from(res.data, 'base64'));
  const kb = Math.round(Buffer.from(res.data, 'base64').length / 1024);
  console.log(`SHOT ${name}.png  ${kb} KB`);
}

const pages = [
  ['dashboard', '#/dashboard', '仪表盘'],
  ['projects', '#/projects', '项目管理'],
  ['todos', '#/todos', '今日待办'],
  ['ideas', '#/ideas', '灵光一闪'],
  ['reports', '#/reports', '工作汇报'],
];

for (const [name, hash] of pages) {
  await ev(`location.hash = '${hash}'`);
  await sleep(1500);
  await shot(name);
}

// 汇报详情（先生成一份）
await ev(`(() => { const b = [...document.querySelectorAll('button')].find(x => x.textContent.includes('一键生成')); if (b) b.click(); return true; })()`);
await sleep(3600);
await shot('report-detail');

// 深色模式（回到仪表盘）
await ev(`location.hash = '#/dashboard'`);
await sleep(1200);
await ev(`(() => { const s = document.querySelector('.side-foot .t-button'); if (s) s.click(); return true; })()`);
await sleep(1200);
await shot('dashboard-dark');

// 4) 收尾：还原数据目录，清理临时文件
await fetch(`${APP}/api/config`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dataDir: realCfg.dataDir }),
});
fs.rmSync(TMP, { recursive: true, force: true });

ws.close();
chrome.kill();
console.log('DONE 数据目录已还原为', realCfg.dataDir);
process.exit(0);
