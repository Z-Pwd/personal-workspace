/**
 * 新版（Vue + TDesign）端到端冒烟测试
 * 用法：node test/smoke-vue.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

import { CHROME, ROOT } from '../scripts/env.mjs';
const APP = 'http://127.0.0.1:7788';
const PORT = 9333;
const PROFILE = path.join(process.env.LOCALAPPDATA ?? 'C:/Windows/Temp', 'Temp', 'wb_vue_profile');
const SHOTS = `${ROOT}/_review`;
const REAL_DATA = `${ROOT}/data`;
const TMP_DATA = path.join(process.env.LOCALAPPDATA ?? 'C:/Windows/Temp', 'Temp', 'wb_vue_data');

const results = [];
const record = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  —  ${detail}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const marks = [];
const mark = (stage) => marks.push(`${stage}:${errors.length}`);

/* ---------------- CDP 客户端 ---------------- */
let ws;
let msgId = 0;
const pending = new Map();
const errors = [];

const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

async function evaluate(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (res.exceptionDetails) {
    const d = res.exceptionDetails.exception?.description || res.exceptionDetails.text;
    throw new Error(`页面执行出错: ${d}`);
  }
  return res.result.value;
}

/** 给 TDesign 的输入框赋值：内部才是真正的 input/textarea */
async function setInput(selector, value) {
  return evaluate(`(() => {
    const host = document.querySelector(${JSON.stringify(selector)});
    if (!host) return 'no-host';
    const field = host.matches('input, textarea') ? host : host.querySelector('input, textarea');
    if (!field) return 'no-field';
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
}

async function clickText(selector, text, wait = 400) {
  const ok = await evaluate(`(() => {
    const want = ${JSON.stringify(text.replace(/\s+/g, ''))};
    const els = [...document.querySelectorAll(${JSON.stringify(selector)})];
    const el = els.find((e) => (e.textContent || '').replace(/\\s+/g, '').includes(want));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  fs.mkdirSync(SHOTS, { recursive: true });
  await fsp.writeFile(path.join(SHOTS, `${name}.png`), Buffer.from(res.data, 'base64'));
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

/* ---------------- 启动 ---------------- */
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.rmSync(TMP_DATA, { recursive: true, force: true });
fs.mkdirSync(TMP_DATA, { recursive: true });
await fetch(`${APP}/api/config`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dataDir: TMP_DATA }),
});

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
    '--window-size=1440,900',
    `${APP}/#/dashboard`,
  ],
  { stdio: 'ignore' },
);

async function waitForChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const page = list.find((t) => t.type === 'page');
      if (page) return page;
    } catch {
      /* 还没起来 */
    }
    await sleep(300);
  }
  throw new Error('无头 Chrome 没有启动成功');
}

const target = await waitForChrome();
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
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
    const d = msg.params.exceptionDetails;
    const desc = d.exception?.description || d.text;
    void send('Runtime.evaluate', { expression: 'location.hash', returnByValue: true })
      .then((r) => errors.push(`[@${r.result.value}] ${desc}`))
      .catch(() => errors.push(desc));
  }
  if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') {
    errors.push(`${msg.params.entry.text} ${msg.params.entry.url ?? ''}`);
  }
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') {
    errors.push(msg.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (msg.method === 'Page.javascriptDialogOpening') {
    void send('Page.handleJavaScriptDialog', { accept: true });
  }
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload');
await sleep(2600);

/* ---------------- 1. 首屏 ---------------- */
record('页面渲染出内容', (await evaluate('document.body.innerText.length')) > 50);
record('欢迎引导出现', (await evaluate(`document.body.innerText.includes('个人工作台') && document.body.innerText.includes('先看看示例数据')`)) === true);
record('无控制台报错（首屏）', errors.length === 0, errors.slice(0, 2).join(' | '));
await shot('v2-01-dashboard-empty');

/* ---------------- 2. 示例数据 ---------------- */
record('点击「先看看示例数据」', await clickText('button', '先看看示例数据', 1200));
record('统计卡渲染', (await evaluate(`document.body.innerText.includes('今日待办') && document.body.innerText.includes('本周工时')`)) === true);
const projectsFile1 = await readJson(path.join(TMP_DATA, 'projects.json'));
mark('seed');
record('projects.json 已落盘', !!projectsFile1 && projectsFile1.items.length === 2, `items=${projectsFile1?.items?.length} rev=${projectsFile1?.rev}`);
await shot('v2-02-dashboard');

/* ---------------- 3. 项目管理 ---------------- */
await evaluate(`location.hash = '#/projects'`);
await sleep(900);
record('项目树显示示例项目', (await evaluate(`document.body.innerText.includes('固定资产盘点系统')`)) === true);
record('多级子任务展开', (await evaluate(`document.body.innerText.includes('访谈财务 / 行政')`)) === true);
record('进度自动汇总有百分比', (await evaluate(`/\\d+%/.test(document.body.innerText)`)) === true);
await shot('v2-03-projects');

record('点击「新建项目」打开弹窗', await clickText('button', '新建项目', 700));
record('弹窗出现', (await evaluate(`!!document.querySelector('.t-dialog')`)) === true);
record('填写项目名', (await setInput('.t-dialog .t-input', '测试项目 A')) === 'ok');
await sleep(300);
record('点击创建', await clickText('.t-dialog button', '创建', 1000));
record('新项目出现在列表', (await evaluate(`document.body.innerText.includes('测试项目 A')`)) === true);
const projectsFile2 = await readJson(path.join(TMP_DATA, 'projects.json'));
mark('projects-create');
record('新项目写入 projects.json', projectsFile2?.items?.length === 3, `items=${projectsFile2?.items?.length} rev=${projectsFile2?.rev}`);

/* ---------------- 4. 今日待办 ---------------- */
await evaluate(`location.hash = '#/todos'`);
await sleep(900);
record('四象限看板有 4 列', (await evaluate(`document.querySelectorAll('.qcol').length`)) === 4);
record('示例待办出现', (await evaluate(`document.body.innerText.includes('确认扫码枪型号与到货时间')`)) === true);
await shot('v2-04-todos');

const beforeDone = await evaluate(`document.body.innerText.match(/已完成\\s*(\\d+)\\s*\\/\\s*(\\d+)/)?.[1] ?? '0'`);
await evaluate(`(() => {
  const card = [...document.querySelectorAll('.todo-card')].find(c => c.innerText.includes('确认扫码枪型号'));
  const cb = card?.querySelector('.t-checkbox__input') || card?.querySelector('input[type=checkbox]') || card?.querySelector('.t-checkbox');
  if (!cb) return false;
  cb.click();
  return true;
})()`);
await sleep(1200);
const afterDone = await evaluate(`document.body.innerText.match(/已完成\\s*(\\d+)\\s*\\/\\s*(\\d+)/)?.[1] ?? '0'`);
record('勾选待办后完成数 +1', Number(afterDone) === Number(beforeDone) + 1, `${beforeDone} → ${afterDone}`);
const todosFile1 = await readJson(path.join(TMP_DATA, 'todos.json'));
mark('todo-toggle');
record('完成状态写入 todos.json', (todosFile1?.items ?? []).some((t) => t.title.includes('确认扫码枪') && t.done === true));

// 拖拽换象限
const dragged = await evaluate(`(() => {
  const card = [...document.querySelectorAll('.todo-card')].find(c => c.innerText.includes('把原型给财务看一眼'));
  if (!card) return 'no-card';
  const target = document.querySelectorAll('.qbody')[3];
  if (!target) return 'no-target';
  const dt = new DataTransfer();
  card.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
  target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
  card.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
  return 'ok';
})()`);
await sleep(1200);
const todosFile2 = await readJson(path.join(TMP_DATA, 'todos.json'));
mark('todo-drag');
const moved = (todosFile2?.items ?? []).find((t) => t.title.includes('把原型给财务看一眼'));
record('拖拽换象限生效', dragged === 'ok' && moved?.quadrant === 'q4', `quadrant=${moved?.quadrant} drag=${dragged}`);
await shot('v2-05-todos-after-drag');

// 快速添加（回车）
await evaluate(`(() => {
  const host = document.querySelector('.quick-add .t-input');
  const field = host?.querySelector('input');
  if (!field) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(field, '冒烟测试新增待办');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  field.dispatchEvent(new KeyboardEvent('keyup', { key: 'Enter', bubbles: true }));
  return true;
})()`);
await sleep(1000);
const todosFile3 = await readJson(path.join(TMP_DATA, 'todos.json'));
record('回车快速添加写入 todos.json', (todosFile3?.items ?? []).some((t) => t.title === '冒烟测试新增待办'));

/* ---------------- 5. 灵感 ---------------- */
await evaluate(`location.hash = '#/ideas'`);
await sleep(900);
record('灵感时间线有 3 条', (await evaluate(`document.querySelectorAll('.idea-card').length`)) === 3);
await shot('v2-06-ideas');

record('填写灵感内容', (await setInput('.composer .t-textarea', '冒烟测试：灵感可以多行')) === 'ok');
record('点击「记录」', await clickText('.composer button', '记录', 1000));
const ideasFile1 = await readJson(path.join(TMP_DATA, 'ideas.json'));
mark('idea-add');
record('灵感写入 ideas.json', (ideasFile1?.items ?? []).some((i) => i.content.includes('冒烟测试：灵感可以多行')));

record('点击「转成行动」', await clickText('.idea-card button', '转成行动', 700));
record('转换弹窗出现', (await evaluate(`!!document.querySelector('.t-dialog')`)) === true);
record('确认转换', await clickText('.t-dialog button', '转换', 1200));
const ideasFile2 = await readJson(path.join(TMP_DATA, 'ideas.json'));
const adopted = (ideasFile2?.items ?? []).find((i) => i.status === 'adopted' && i.convertedTo);
record('灵感标记已采纳', !!adopted, adopted ? `${adopted.convertedTo.type}` : '');
const todosFile4 = await readJson(path.join(TMP_DATA, 'todos.json'));
record('转成的待办已落盘', !!adopted && (todosFile4?.items ?? []).some((t) => t.id === adopted.convertedTo.id));
await shot('v2-07-ideas');

/* ---------------- 6. 工作汇报 ---------------- */
await evaluate(`location.hash = '#/reports'`);
await sleep(900);
record('汇报页显示生成器', (await evaluate(`document.body.innerText.includes('生成汇报') && document.body.innerText.includes('一键生成')`)) === true);
await shot('v2-08-reports-list');
record('点击「一键生成」', await clickText('button', '一键生成', 1400));
record(
  '进入汇报详情',
  (await evaluate(`document.body.innerText.includes('重点项目进展') && !!document.querySelector('[data-test="manual-section"]')`)) === true,
);
record('环形进度图渲染', (await evaluate(`!!document.querySelector('.t-progress--circle')`)) === true);
record('每日工时柱状图渲染', (await evaluate(`document.querySelectorAll('.cols .col').length`)) >= 7);
const reportsFile1 = await readJson(path.join(TMP_DATA, 'reports.json'));
mark('report-generate');
const rep = reportsFile1?.items?.[0];
record('reports.json 已落盘', !!rep, rep ? `${rep.start}~${rep.end}` : 'none');
record(
  '统计与待办数据一致',
  !!rep && rep.snapshot.metrics.todoTotal === (todosFile4?.items ?? []).filter((t) => t.date >= rep.start && t.date <= rep.end).length,
  rep ? `todoTotal=${rep.snapshot.metrics.todoTotal}` : '',
);
await shot('v2-09-report-detail');

record('填写本期总结', (await setInput('.t-textarea', '本周把盘点流程跑通了')) === 'ok');
await sleep(1200);
const reportsFile2 = await readJson(path.join(TMP_DATA, 'reports.json'));
record('手写总结自动保存', (reportsFile2?.items?.[0]?.manual?.summary ?? '').includes('盘点流程跑通'));

record('点击「标记定稿」', await clickText('button', '标记定稿', 900));
const reportsFile3 = await readJson(path.join(TMP_DATA, 'reports.json'));
record('定稿状态写入 reports.json', reportsFile3?.items?.[0]?.status === 'final');

/* ---------------- 7. 全局搜索 ---------------- */
await evaluate(`location.hash = '#/dashboard'`);
await sleep(800);
await evaluate(`(() => {
  const host = document.querySelector('.search-box .t-input');
  const field = host?.querySelector('input');
  if (!field) return false;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set;
  setter.call(field, '盘点');
  field.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await sleep(700);
const hits = await evaluate(`document.querySelectorAll('.search-item').length`);
record('全局搜索出结果', hits > 0, `命中 ${hits} 条`);
await shot('v2-10-search');
await evaluate(`(() => { document.querySelector('.search-item')?.click(); return true; })()`);
await sleep(1000);
record('点结果跳转', (await evaluate('location.hash')) !== '#/dashboard', await evaluate('location.hash'));

/* ---------------- 8. 设置页 + 深色 ---------------- */
await evaluate(`location.hash = '#/settings'`);
await sleep(900);
record('设置页显示数据目录', (await evaluate(`document.body.innerText.includes('projects.json')`)) === true);
await evaluate(`(() => { const sw = document.querySelector('.t-switch'); if (!sw) return false; sw.click(); return true; })()`);
await sleep(800);
record('深色模式生效', (await evaluate(`document.documentElement.getAttribute('theme-mode')`)) === 'dark');
await shot('v2-11-settings-dark');
mark('settings-dark');

/* ---------------- 9. 持久化 ---------------- */
await send('Page.navigate', { url: `${APP}/#/projects` });
await sleep(2600);
record(
  '刷新后数据仍在',
  (await evaluate(`document.body.innerText.includes('固定资产盘点系统') && document.body.innerText.includes('测试项目 A')`)) === true,
);
record('深色模式保持', (await evaluate(`document.documentElement.getAttribute('theme-mode')`)) === 'dark');
record('全流程无控制台报错', errors.length === 0, errors.slice(0, 3).join(' | '));

/* ---------------- 收尾 ---------------- */
await fetch(`${APP}/api/config`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dataDir: REAL_DATA }),
});
fs.rmSync(TMP_DATA, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log('');
console.log('MARKS', marks.join(' | '));
console.log(`共 ${results.length} 项，通过 ${results.length - failed.length} 项，失败 ${failed.length} 项`);
if (failed.length) console.log('失败项：', failed.map((f) => f.name).join(' | '));
await fsp.writeFile(path.join(SHOTS, 'smoke-vue-result.json'), JSON.stringify({ results, errors }, null, 2));

ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
