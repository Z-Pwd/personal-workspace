/**
 * v3 数据层回归：旧数据迁移、doneAt、工时流水、周报区间统计、卡片常显、包体
 * 用法：node test/regression-v3.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const APP = 'http://127.0.0.1:7788';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9371;
const TMP = path.join(process.env.LOCALAPPDATA ?? 'C:/Windows/Temp', 'Temp', 'wb_v3_data');
const PROFILE = path.join(process.env.LOCALAPPDATA ?? 'C:/Windows/Temp', 'Temp', 'wb_v3_profile');
const REAL = 'E:/vs_code_js/workbench/data';

const results = [];
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const rec = (name, ok, note = '') => {
  results.push({ name, ok, note });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  —  ${note}` : ''}`);
};

/* ---------- 服务端数据操作 ---------- */
const apiGet = async (doc) => (await fetch(`${APP}/api/doc/${doc}`)).json();
const apiPut = async (doc, items) => {
  const cur = await apiGet(doc);
  const res = await fetch(`${APP}/api/doc/${doc}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items, baseRev: cur.rev }),
  });
  return res.json();
};
const setDoc = async (doc, items) => {
  // 冲突重试一次
  let r = await apiPut(doc, items);
  if (r?.error === 'conflict') r = await apiPut(doc, items);
  return r;
};

/** 写入后回读确认（页面自动保存可能覆盖外部写入，最多重试 3 次） */
const setDocVerified = async (doc, items, check) => {
  for (let i = 0; i < 3; i++) {
    await setDoc(doc, items);
    await sleep(700);
    const cur = await apiGet(doc);
    if (!check || check(cur.items)) return true;
  }
  return false;
};

/* ---------- 启动 ---------- */
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(PROFILE, { recursive: true, force: true });
fs.mkdirSync(TMP, { recursive: true });
await fetch(`${APP}/api/config`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dataDir: TMP }),
});

const chrome = spawn(CHROME, [
  '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--no-first-run',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${PROFILE}`,
  '--window-size=1440,900', `${APP}/#/projects`,
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
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
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
async function mouseClick(selector, wait = 500) {
  const box = await ev(`(() => {
    const el = document.querySelector(${JSON.stringify(selector)});
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!box) return false;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await sleep(60);
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(wait);
  return true;
}
const clickText = async (sel, text, wait = 600) => {
  const ok = await ev(`(() => {
    const el = [...document.querySelectorAll(${JSON.stringify(sel)})].find((e) => (e.textContent || '').includes(${JSON.stringify(text)}));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
};
const visibleDialog = `[...document.querySelectorAll('.t-dialog')].filter((d) => d.getBoundingClientRect().height > 10).pop()`;
async function dialogClick(text, wait = 900) {
  for (let i = 0; i < 12; i++) {
    const ready = await ev(`(() => { const d = ${visibleDialog}; return !!d && [...d.querySelectorAll('button')].some((b) => b.textContent.includes(${JSON.stringify(text)})); })()`);
    if (ready) break;
    await sleep(250);
  }
  const ok = await ev(`(() => {
    const d = ${visibleDialog};
    if (!d) return false;
    const b = [...d.querySelectorAll('button')].find((x) => x.textContent.includes(${JSON.stringify(text)}));
    if (!b) return false;
    b.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
}
async function chooseOption(selector, text, wait = 600) {
  await mouseClick(`${selector} .t-input, ${selector}`, 450);
  const ok = await ev(`(() => {
    const o = [...document.querySelectorAll('.t-select-option')].find((x) => x.textContent.includes(${JSON.stringify(text)}));
    if (!o) return false;
    o.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
}
const reload = async () => {
  await send('Page.reload');
  await sleep(2600);
};

await send('Runtime.enable');
await send('Page.enable');
await sleep(2400);

const today = new Date();
/** 本地日期，不用 toISOString（避免 UTC 差一天） */
const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = iso(today);
const longAgo = iso(new Date(today.getTime() - 40 * 86400000));

/** 等元素出现 */
async function waitFor(selector, timeout = 4000) {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    if (await ev(`!!document.querySelector(${JSON.stringify(selector)})`)) return true;
    await sleep(150);
  }
  return false;
}

/* ================= 1. 旧数据迁移 ================= */
const legacy = [
  {
    id: 'legacy-1',
    title: '旧版本任务（无 doneAt / timeLogs）',
    note: '迁移用例',
    status: 'done',
    priority: 'high',
    due: null,
    tags: [],
    estHours: 4,
    actHours: 3,
    children: [],
    createdAt: '2026-10-01T02:00:00.000Z',
    updatedAt: '2026-10-20T10:00:00.000Z',
    archived: false,
    deletedAt: null,
  },
];
await setDoc('projects', legacy);
await reload();
const migrated = await apiGet('projects');
const lt = migrated.items[0];
rec('迁移：补出 doneAt', lt.doneAt === '2026-10-20T10:00:00.000Z', `doneAt=${lt.doneAt}`);
rec('迁移：补出 timeLogs', Array.isArray(lt.timeLogs) && lt.timeLogs.length === 1, `条数=${lt.timeLogs?.length}`);
rec('迁移：旧工时保留并落到完成日', lt.timeLogs?.[0]?.date === '2026-10-20' && lt.timeLogs?.[0]?.hours === 3, `${lt.timeLogs?.[0]?.date} / ${lt.timeLogs?.[0]?.hours}h`);
rec('迁移：actHours 不变', lt.actHours === 3, `actHours=${lt.actHours}`);
rec('迁移：幂等（刷新不重复生成流水）', await (async () => {
  await reload();
  const again = await apiGet('projects');
  return again.items[0].timeLogs.length === 1;
})(), '');

/* ================= 2. doneAt 写入 / 清空 ================= */
const statusChanged = await chooseOption('.node-row .status-select', '进行中', 900);
const afterDoing = await apiGet('projects');
rec('状态改「进行中」→ doneAt 清空', statusChanged && afterDoing.items[0].doneAt === null, `status=${afterDoing.items[0].status} doneAt=${afterDoing.items[0].doneAt}`);

await chooseOption('.node-row .status-select', '已完成', 900);
const afterDone = await apiGet('projects');
rec('状态改「已完成」→ doneAt 写入', afterDone.items[0].status === 'done' && !!afterDone.items[0].doneAt, `doneAt=${afterDone.items[0].doneAt}`);

/* ================= 3. 工时流水（UI 添加） ================= */
await ev(`(() => { const t = document.querySelector('.node-row .node-title'); if (t) t.click(); return true; })()`);
await sleep(900);
const dialogOpen = await ev(`!!(${visibleDialog})`);
const rowsBefore = await ev(`document.querySelectorAll('.t-dialog .time-log-row').length`);
await clickText('.t-dialog button', '记录一条工时', 700);
const rowsAfter = await ev(`document.querySelectorAll('.t-dialog .time-log-row').length`);
{
  const png = await send('Page.captureScreenshot', { format: 'png' });
  await fsp.mkdir('E:/vs_code_js/workbench/_review', { recursive: true });
  await fsp.writeFile('E:/vs_code_js/workbench/_review/v3-task-dialog.png', Buffer.from(png.data, 'base64'));
}
await dialogClick('保存', 1400);
const withLog = await apiGet('projects');
rec('工时流水可新增一行', dialogOpen && rowsAfter === rowsBefore + 1, `${rowsBefore} → ${rowsAfter} 行`);
rec('新增流水落盘', withLog.items[0].timeLogs.length === 2, `条数=${withLog.items[0].timeLogs.length}`);
rec('实际工时自动=流水合计', Number(withLog.items[0].actHours) === Number((withLog.items[0].timeLogs.reduce((a, l) => a + l.hours, 0)).toFixed(1)), `actHours=${withLog.items[0].actHours}`);

/* ================= 4. 周报按流水日期聚合 ================= */
const t = (id, title, logDate, hours) => ({
  id,
  title,
  note: '',
  status: 'done',
  priority: 'mid',
  due: null,
  tags: [],
  estHours: 2,
  actHours: hours,
  timeLogs: [{ id: `log-${id}`, date: logDate, hours, note: '' }],
  children: [],
  createdAt: '2026-10-01T00:00:00.000Z',
  updatedAt: '2026-10-01T00:00:00.000Z',
  doneAt: `${todayStr}T09:00:00.000Z`,
  archived: false,
  deletedAt: null,
});
const seeded = await setDocVerified(
  'projects',
  [t('in-week', '本周任务（今天2h）', todayStr, 2), t('old', '上月任务（40天前3h）', longAgo, 3)],
  (items) => items.length === 2 && items.every((x) => x.timeLogs?.length === 1),
);
rec('测试数据准备（两条带流水的任务）', seeded);
await reload();
await ev(`location.hash = '#/reports'`);
await sleep(1200);
await clickText('button', '一键生成', 2600);
const rep = (await apiGet('reports')).items[0];
rec('周报生成成功', !!rep, rep ? `${rep.start}~${rep.end}` : '无');
const inRep = (d) => !!rep && d >= rep.start && d <= rep.end;
const projDoc = await apiGet('projects');
const expectedHours = projDoc.items.reduce(
  (acc, task) => acc + (task.timeLogs ?? []).filter((l) => inRep(l.date)).reduce((a, l) => a + l.hours, 0),
  0,
);
const expectedDone = projDoc.items.filter((task) => task.status === 'done' && inRep((task.doneAt ?? task.updatedAt).slice(0, 10))).length;
rec(
  '本期工时只统计周期内流水',
  Math.abs(Number(rep?.snapshot?.metrics?.hoursAct) - expectedHours) < 0.01,
  `hoursAct=${rep?.snapshot?.metrics?.hoursAct} 期望=${expectedHours}`,
);
rec('任务完成数按 doneAt 计入', rep?.snapshot?.metrics?.taskDone === expectedDone, `taskDone=${rep?.snapshot?.metrics?.taskDone} 期望=${expectedDone}`);
{
  const png = await send('Page.captureScreenshot', { format: 'png' });
  await fsp.writeFile('E:/vs_code_js/workbench/_review/v3-report.png', Buffer.from(png.data, 'base64'));
}
const seedDay = projDoc.items.find((x) => x.id === 'in-week')?.timeLogs?.[0]?.date;
const dailySeed = rep?.snapshot?.dailyHours?.find((d) => d.date === seedDay)?.hours;
rec('每日工时柱状按日期归集', Number(dailySeed) === 2, `${seedDay}=${dailySeed}h`);

/* ================= 4b. 仪表盘与周报口径一致 ================= */
await ev(`location.hash = '#/dashboard'`);
await sleep(1300);
const dashHours = await ev(`(() => {
  const el = [...document.querySelectorAll('.stat')].find((c) => c.innerText.includes('本周工时'));
  if (!el) return 'no-card';
  const num = el.querySelector('.stat-value')?.innerText ?? '';
  return Number(num.trim());
})()`);
rec('仪表盘本周工时与周报一致', Number(dashHours) === Number(rep?.snapshot?.metrics?.hoursAct), `仪表盘=${dashHours}h 周报=${rep?.snapshot?.metrics?.hoursAct}h`);

/* ================= 4c. 工时数字框：上下箭头每次 ±0.5 ================= */
await ev(`location.hash = '#/projects'`);
await waitFor('.node-row .node-title');
await sleep(300);
await ev(`(() => { const t = document.querySelector('.node-row .node-title'); t.click(); return true; })()`);
await waitFor('.t-dialog .t-form');
await sleep(600);
// 没有流水行就先加一条，保证有输入框可测
if ((await ev(`document.querySelectorAll('.t-dialog .time-log-row').length`)) === 0) {
  await clickText('.t-dialog button', '记录一条工时', 800);
}
const diag = await ev(`(() => {
  const dlg = [...document.querySelectorAll('.t-dialog')].filter((d) => d.getBoundingClientRect().height > 10).pop();
  const row = document.querySelector('.t-dialog .time-log-row');
  const inp = row?.querySelector('input');
  return JSON.stringify({ dialog: !!dlg, rows: document.querySelectorAll('.t-dialog .time-log-row').length, hasInput: !!inp, raw: inp?.value ?? null });
})()`);
const hoursBefore = await ev(`(() => {
  const row = document.querySelector('.t-dialog .time-log-row');
  const inp = row?.querySelector('.t-input-number input');
  return inp ? Number(inp.value) : null;
})()`);
const stepped = await ev(`(() => {
  const row = document.querySelector('.t-dialog .time-log-row');
  const up = row?.querySelector('.t-input-number__increase');
  if (!up) return 'no-arrow';
  up.click();
  return 'clicked';
})()`);
await sleep(400);
const hoursAfter = await ev(`(() => {
  const row = document.querySelector('.t-dialog .time-log-row');
  const inp = row?.querySelector('.t-input-number input');
  return inp ? Number(inp.value) : null;
})()`);
rec('工时数字框点▲ +0.5', stepped === 'clicked' && Number(hoursAfter) === Number(hoursBefore) + 0.5, `${hoursBefore} → ${hoursAfter}（${stepped}）诊断=${diag}`);
// 模拟真实点击节奏：两次点击之间留间隔（同 tick 连点会被组件合并成一次）
const decOnce = `(() => {
  const row = document.querySelector('.t-dialog .time-log-row');
  const down = row?.querySelector('.t-input-number__decrease');
  if (!down) return false;
  down.click();
  return true;
})()`;
const dec1 = await ev(decOnce);
await sleep(300);
const dec2 = await ev(decOnce);
await sleep(300);
const downed = dec1 && dec2 ? 'clicked' : 'no-arrow';
const hoursDown = await ev(`(() => {
  const row = document.querySelector('.t-dialog .time-log-row');
  const inp = row?.querySelector('.t-input-number input');
  return inp ? Number(inp.value) : null;
})()`);
rec('工时数字框点▼ -0.5（连点两次 -1）', downed === 'clicked' && Number(hoursDown) === Number(hoursAfter) - 1, `${hoursAfter} → ${hoursDown}`);
await dialogClick('取消', 700);

/* ================= 4d. 自定义标签（快速添加） ================= */
await ev(`location.hash = '#/todos'`);
await sleep(1100);
const tagTyped = await ev(`(() => {
  const host = document.querySelector('[data-test="quick-tags"]');
  if (!host) return 'no-host';
  const input = host.querySelector('input');
  if (!input) return 'no-input';
  input.focus();
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '审计自定义');
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', keyCode: 13, which: 13, bubbles: true }));
  return 'ok';
})()`);
await sleep(500);
await ev(`(() => {
  const f = document.querySelector('.quick-add .t-input input');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(f, '带自定义标签的待办');
  f.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await clickText('button', '添加', 1200);
const todoDoc = await apiGet('todos');
const tagged = todoDoc.items.find((t) => t.title === '带自定义标签的待办');
rec('自定义标签可输入并落盘', tagTyped === 'ok' && tagged?.tags?.includes('审计自定义'), `tags=${JSON.stringify(tagged?.tags)}`);
const filterVisible = await ev(`document.body.innerText.includes('审计自定义')`);
rec('新标签出现在标签筛选里', filterVisible === true, '');

/* ================= 5. 待办卡片操作常显 ================= */
await ev(`location.hash = '#/todos'`);
await sleep(1000);
await ev(`(() => {
  const f = document.querySelector('.quick-add .t-input input');
  if (!f) return false;
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(f, '常显测试');
  f.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await clickText('button', '添加', 1200);
const opacity = await ev(`(() => { const a = document.querySelector('.todo-actions'); return a ? getComputedStyle(a).opacity : 'none'; })()`);
rec('待办操作按钮常显（不依赖 hover）', opacity !== 'none' && Number(opacity) > 0.3, `opacity=${opacity}`);

/* ================= 6. 包体 ================= */
const distSize = (dir) => {
  let total = 0;
  for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, f.name);
    total += f.isDirectory() ? distSize(p) : fs.statSync(p).size;
  }
  return total;
};
const sizeMb = distSize('E:/vs_code_js/workbench/dist') / 1024 / 1024;
rec('包体 < 1.6MB（按需引入生效）', sizeMb < 1.6, `${sizeMb.toFixed(2)} MB`);

/* ================= 收尾 ================= */
rec('全流程无控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '));
await fetch(`${APP}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataDir: REAL }) });
fs.rmSync(TMP, { recursive: true, force: true });

const failed = results.filter((r) => !r.ok);
console.log('');
console.log(`=== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} ===`);
if (failed.length) console.log('失败项：', failed.map((f) => f.name).join(' | '));
if (errors.length) console.log('控制台报错：\n' + errors.slice(0, 5).join('\n'));
await fsp.mkdir('E:/vs_code_js/workbench/_review', { recursive: true });
await fsp.writeFile('E:/vs_code_js/workbench/_review/v3-result.json', JSON.stringify({ results, errors }, null, 2));

ws.close();
chrome.kill();
process.exit(failed.length ? 1 : 0);
