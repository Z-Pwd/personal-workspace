/**
 * 全面自测：按用户路径把功能点一遍，记录异常
 * 用法：node test/audit.mjs
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';

const APP = 'http://127.0.0.1:7788';
const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9345;
const PROFILE = path.join(process.env.LOCALAPPDATA ?? 'C:/Windows/Temp', 'Temp', 'wb_audit_profile');
const TMP_DATA = path.join(process.env.LOCALAPPDATA ?? 'C:/Windows/Temp', 'Temp', 'wb_audit_data');
const REAL_DATA = 'E:/vs_code_js/workbench/data';
const SHOTS = 'E:/vs_code_js/workbench/_review/audit';

const findings = [];
const errors = [];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws;
let msgId = 0;
const pending = new Map();
const send = (method, params = {}) => {
  const id = ++msgId;
  ws.send(JSON.stringify({ id, method, params }));
  return new Promise((resolve, reject) => pending.set(id, { resolve, reject }));
};

async function ev(expression) {
  const res = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true, userGesture: true });
  if (res.exceptionDetails) throw new Error(res.exceptionDetails.exception?.description || res.exceptionDetails.text);
  return res.result.value;
}

const text = () => ev('document.body.innerText');
const dialogOpen = () => ev(`!!document.querySelector('.t-dialog')`);

async function setField(selector, value) {
  return ev(`(() => {
    const host = document.querySelector(${JSON.stringify(selector)});
    if (!host) return 'no-host';
    const field = host.matches('input, textarea') ? host : host.querySelector('input, textarea');
    if (!field) return 'no-field';
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
}

async function clickText(selector, needle, wait = 400) {
  const ok = await ev(`(() => {
    const want = ${JSON.stringify(needle.replace(/\s+/g, ''))};
    const el = [...document.querySelectorAll(${JSON.stringify(selector)})]
      .find((e) => (e.textContent || '').replace(/\\s+/g, '').includes(want));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
}

async function clickSel(selector, index = 0) {
  const ok = await ev(`(() => {
    const el = document.querySelectorAll(${JSON.stringify(selector)})[${index}];
    if (!el) return false;
    el.click();
    return true;
  })()`);
  await sleep(350);
  return ok;
}

/** 打开下拉并选中一项 */
async function chooseOption(selectSelector, optionText, wait = 400) {
  await mouseClick(`${selectSelector} .t-input, ${selectSelector}`, 450);
  const ok = await ev(`(() => {
    const want = ${JSON.stringify(optionText.replace(/\s+/g, ''))};
    const opts = [...document.querySelectorAll('.t-select-option, .t-select__dropdown li, .t-cascader__item')];
    const el = opts.find((o) => (o.textContent || '').replace(/\\s+/g, '').includes(want));
    if (!el) return false;
    el.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
}

const VISIBLE_DIALOG = `[...document.querySelectorAll('.t-dialog')].filter((d) => d.getBoundingClientRect().height > 10).pop()`;

/** 真实鼠标点击（TDesign 的下拉依赖 mousedown，脚本 click() 打不开） */
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

/** 点击当前可见弹窗里的按钮 */
async function dialogClick(text, wait = 900) {
  for (let i = 0; i < 12; i++) {
    const ready = await ev(`(() => {
      const dlg = ${VISIBLE_DIALOG};
      if (!dlg) return false;
      return [...dlg.querySelectorAll('button')].some((b) => b.textContent.includes(${JSON.stringify(text)}));
    })()`);
    if (ready) break;
    await sleep(250);
  }
  const ok = await ev(`(() => {
    const dlg = ${VISIBLE_DIALOG};
    if (!dlg) return false;
    const btn = [...dlg.querySelectorAll('button')].find((b) => b.textContent.includes(${JSON.stringify(text)}));
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
}

/** 在当前可见弹窗里填第一个输入框 */
async function dialogSetField(value) {
  const r = await ev(`(() => {
    const dlg = ${VISIBLE_DIALOG};
    if (!dlg) return 'no-dialog';
    const field = dlg.querySelector('input, textarea');
    if (!field) return 'no-field';
    const proto = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(field, ${JSON.stringify(value)});
    field.dispatchEvent(new Event('input', { bubbles: true }));
    field.dispatchEvent(new Event('change', { bubbles: true }));
    return 'ok';
  })()`);
  await sleep(200);
  return r;
}

/** 在当前可见弹窗里：点开第 index 个下拉并选项 */
async function dialogChoose(index, optionText, wait = 600) {
  const box = await ev(`(() => {
    const dlg = ${VISIBLE_DIALOG};
    if (!dlg) return null;
    const sel = dlg.querySelectorAll('.t-select')[${index}];
    if (!sel) return null;
    const el = sel.querySelector('.t-input') || sel;
    const r = el.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  })()`);
  if (!box) return false;
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: box.x, y: box.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: box.x, y: box.y, button: 'left', clickCount: 1 });
  await sleep(500);
  const ok = await ev(`(() => {
    const o = [...document.querySelectorAll('.t-select-option')].find((x) => x.textContent.includes(${JSON.stringify(optionText)}));
    if (!o) return false;
    o.click();
    return true;
  })()`);
  await sleep(wait);
  return ok;
}

async function shot(name) {
  const res = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  await fsp.mkdir(SHOTS, { recursive: true });
  await fsp.writeFile(path.join(SHOTS, `${name}.png`), Buffer.from(res.data, 'base64'));
}

async function readJson(name) {
  try {
    return JSON.parse(await fsp.readFile(path.join(TMP_DATA, `${name}.json`), 'utf8'));
  } catch {
    return null;
  }
}

async function check(name, fn, opts = {}) {
  const before = errors.length;
  try {
    const r = await fn();
    const ok = r === true || (r && r.ok === true);
    const note = typeof r === 'object' && r ? r.note ?? '' : '';
    const newErr = errors.slice(before);
    if (!ok) await shot(`fail-${findings.length + 1}`);
    findings.push({ name, ok, note, errors: newErr, severity: opts.severity ?? 'medium' });
    console.log(`${ok ? 'OK  ' : 'BUG '} ${name}${note ? `  — ${note}` : ''}${newErr.length ? `  [console: ${newErr[0].slice(0, 90)}]` : ''}`);
  } catch (err) {
    await shot(`fail-${findings.length + 1}`);
    findings.push({ name, ok: false, note: `脚本异常：${err.message}`, errors: [], severity: opts.severity ?? 'medium' });
    console.log(`BUG  ${name}  — 脚本异常：${err.message}`);
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

async function waitChrome() {
  for (let i = 0; i < 60; i++) {
    try {
      const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
      const p = list.find((t) => t.type === 'page');
      if (p) return p;
    } catch {
      /* ignore */
    }
    await sleep(300);
  }
  throw new Error('chrome 未就绪');
}

const target = await waitChrome();
ws = new WebSocket(target.webSocketDebuggerUrl);
await new Promise((res, rej) => {
  ws.addEventListener('open', res, { once: true });
  ws.addEventListener('error', rej, { once: true });
});
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) {
    const p = pending.get(m.id);
    pending.delete(m.id);
    if (m.error) p.reject(new Error(m.error.message));
    else p.resolve(m.result);
    return;
  }
  if (m.method === 'Runtime.exceptionThrown') {
    errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
  }
  if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') {
    errors.push(m.params.args.map((a) => a.value ?? a.description).join(' '));
  }
  if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') {
    errors.push(`${m.params.entry.text} ${m.params.entry.url ?? ''}`);
  }
  if (m.method === 'Page.javascriptDialogOpening') void send('Page.handleJavaScriptDialog', { accept: true });
});

await send('Runtime.enable');
await send('Log.enable');
await send('Page.enable');
await send('Page.reload');
await sleep(2600);

/* ============ A. 导航与菜单 ============ */
await check('A1 侧边菜单 6 项齐全', async () => {
  const n = await ev(`document.querySelectorAll('.side-menu .t-menu__item').length`);
  return { ok: n === 6, note: `菜单项 ${n} 个` };
});

await check('A2 点击菜单能切页且高亮跟随', async () => {
  const results = [];
  for (const [label, hash] of [['今日待办', '#/todos'], ['灵光一闪', '#/ideas'], ['工作汇报', '#/reports'], ['设置', '#/settings'], ['项目管理', '#/projects']]) {
    await clickText('.side-menu .t-menu__item', label, 700);
    const h = await ev('location.hash');
    const activeText = await ev(`(document.querySelector('.side-menu .t-is-active, .side-menu .t-menu__item--active')?.innerText || '').replace(/\\s+/g,'')`);
    results.push({ label, h, activeText });
    if (h !== hash) return { ok: false, note: `${label} 点击后 hash=${h}` };
    if (!activeText.includes(label)) return { ok: false, note: `${label} 点击后高亮在「${activeText}」` };
  }
  return { ok: true, note: results.map((r) => r.h).join(' ') };
});

await check('A3 菜单高亮块不溢出侧边栏', async () => {
  const r = await ev(`(() => {
    const item = document.querySelector('.side-menu .t-is-active, .side-menu .t-menu__item--active');
    const side = document.querySelector('.side');
    if (!item || !side) return { ok: false, note: 'no el' };
    const a = item.getBoundingClientRect(), b = side.getBoundingClientRect();
    const menu = document.querySelector('.side-menu .t-menu')?.getBoundingClientRect();
    const cs = getComputedStyle(item);
    const overflowLeft = Math.round(b.left - a.left), overflowRight = Math.round(a.right - b.right);
    return {
      ok: a.left >= b.left - 1 && a.right <= b.right + 1 && a.top >= b.top,
      note: 'item ' + Math.round(a.left) + '~' + Math.round(a.right) + ' / side ' + Math.round(b.left) + '~' + Math.round(b.right) + ' / menu ' + (menu ? Math.round(menu.left) + '~' + Math.round(menu.right) : '-') + ' / w=' + Math.round(a.width) + ' margin=' + cs.marginLeft + ' padding=' + cs.paddingLeft,
    };
  })()`);
  return r;
});

await check('A4 侧边栏菜单无滚动溢出（滚动条出现）', async () => {
  const r = await ev(`(() => {
    const m = document.querySelector('.side-menu');
    return { ok: m.scrollHeight <= m.clientHeight + 2, note: 'scrollHeight ' + m.scrollHeight + ' vs ' + m.clientHeight };
  })()`);
  return r;
});

/* ============ B. 示例数据与项目 ============ */
await ev(`location.hash = '#/dashboard'`);
await sleep(900);
await check('B1 载入示例数据', async () => {
  const clicked = await clickText('button', '先看看示例数据', 1400);
  const pf = await readJson('projects');
  return { ok: clicked && pf?.items?.length === 2, note: `项目 ${pf?.items?.length} 个` };
});

await ev(`location.hash = '#/projects'`);
await sleep(900);

await check('B2 项目树渲染多级子任务', async () => {
  const t = await text();
  return { ok: t.includes('固定资产盘点系统') && t.includes('访谈财务 / 行政') };
});

await check('B3 行内状态下拉可改状态并落盘', async () => {
  const before = await readJson('projects');
  const beforeStatus = before.items[0].status;
  const ok = await chooseOption('.node-row .status-select', '已搁置', 900);
  const after = await readJson('projects');
  const afterStatus = after?.items?.[0]?.status;
  return { ok: ok && afterStatus === 'shelved', note: `${beforeStatus} → ${afterStatus}` };
});

await check('B4 节点「⋯」菜单能打开', async () => {
  const clicked = await ev(`(() => {
    const btn = document.querySelector('.node-row [data-test="node-menu"]');
    if (!btn) return false;
    btn.click();
    return true;
  })()`);
  await sleep(700);
  const items = await ev(`document.querySelectorAll('.t-dropdown__item').length`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  return { ok: clicked && items > 0, note: `${items} 个菜单项` };
});

await check('B5 菜单里「添加子任务」能开弹窗', async () => {
  const clicked = await clickText('.t-dropdown__item', '添加子任务', 900);
  const open = await dialogOpen();
  if (open) await dialogClick('取消', 500);
  return { ok: clicked && open, note: clicked ? '' : '菜单项点不到' };
});

await check('B6 新建项目（无筛选）', async () => {
  await clickText('button', '新建项目', 600);
  const typed = await dialogSetField('审计项目 A');
  await sleep(200);
  await dialogClick('创建', 900);
  const pf = await readJson('projects');
  return { ok: typed === 'ok' && pf.items.some((p) => p.title === '审计项目 A'), note: `项目数 ${pf?.items?.length}` };
});

await check('B7 筛选「已完成」后新建项目 → 是否可见（创建后被筛选隐藏）', async () => {
  await chooseOption('[data-test="filter-status"]', '已完成', 700);
  await clickText('button', '新建项目', 600);
  await dialogSetField('审计项目 B');
  await sleep(200);
  await dialogClick('创建', 900);
  const visible = (await text()).includes('审计项目 B');
  const pf = await readJson('projects');
  const persisted = pf.items.some((p) => p.title === '审计项目 B');
  return { ok: visible, note: persisted ? (visible ? '可见' : '已创建但被筛选条件隐藏，用户会以为创建失败') : '未落盘' };
}, { severity: 'high' });

await check('B8 新建后筛选自动清空（避免"创建了却看不见"）', async () => {
  const filterText = await ev(`document.querySelector('[data-test="filter-status"] input')?.value || ''`);
  const visible = (await text()).includes('审计项目 B');
  return { ok: filterText.includes('全部状态') && visible, note: `筛选框=${filterText.replace(/\s+/g, '') || '空'} 新项目可见=${visible}` };
}, { severity: 'high' });

await check('B9 归档后默认列表隐藏，勾选「含归档」后出现', async () => {
  await ev(`(() => {
    const row = [...document.querySelectorAll('.node-row')].find(r => r.innerText.includes('审计项目 A'));
    row.querySelector('[data-test="node-menu"]').click();
    return true;
  })()`);
  await sleep(700);
  await clickText('.t-dropdown__item', '归档', 900);
  const hiddenText = await text();
  const hidden = !hiddenText.includes('审计项目 A');
  await ev(`(() => { const cb = document.querySelector('.toolbar .t-checkbox'); cb.click(); return true; })()`);
  await sleep(700);
  const shown = (await text()).includes('审计项目 A');
  return { ok: hidden && shown, note: `归档后隐藏=${hidden} 含归档后显示=${shown}` };
});

await check('B10 删除进回收站 → 恢复', async () => {
  await ev(`(() => {
    const row = [...document.querySelectorAll('.node-row')].find(r => r.innerText.includes('审计项目 A'));
    row.querySelector('[data-test="node-menu"]').click();
    return true;
  })()`);
  await sleep(700);
  await clickText('.t-dropdown__item', '删除', 900);
  // 确认弹窗
  await dialogClick('确定', 900);
  const pf = await readJson('projects');
  const deleted = pf.items.find((p) => p.title === '审计项目 A')?.deletedAt;
  await clickText('button', '回收站', 700);
  const inTrash = (await text()).includes('审计项目 A');
  await clickText('button', '恢复', 800);
  const pf2 = await readJson('projects');
  const restored = !pf2.items.find((p) => p.title === '审计项目 A')?.deletedAt;
  await clickText('button', '回收站', 500);
  return { ok: !!deleted && inTrash && restored, note: `deletedAt=${!!deleted} 回收站可见=${inTrash} 恢复=${restored}` };
}, { severity: 'high' });

await check('B11 批量选择 + 批量改优先级', async () => {
  await ev(`(() => {
    const cbs = [...document.querySelectorAll('.node-row .t-checkbox__input, .node-row .t-checkbox')];
    cbs[0]?.click(); cbs[1]?.click(); return true;
  })()`);
  await sleep(600);
  const barShown = (await text()).includes('已选');
  await chooseOption('.batch-bar .t-select', '高', 800);
  const pf = await readJson('projects');
  const high = pf.items.filter((p) => p.priority === 'high').length;
  return { ok: barShown && high >= 1, note: `批量条=${barShown} 高优先级项目=${high}` };
});

/* ============ C. 今日待办 ============ */
await ev(`location.hash = '#/todos'`);
await sleep(900);

await check('C1 四象限 4 列 + 卡片渲染', async () => {
  const cols = await ev(`document.querySelectorAll('.qcol').length`);
  const cards = await ev(`document.querySelectorAll('.todo-card').length`);
  return { ok: cols === 4 && cards >= 4, note: `${cols} 列 / ${cards} 张卡` };
});

await check('C2 快速添加（回车）到指定象限', async () => {
  const before = await ev(`document.querySelectorAll('.qcol')[3].querySelectorAll('.todo-card').length`);
  await chooseOption('[data-test="quick-quadrant"]', '不重要不紧急', 600);
  await ev(`(() => {
    const f = document.querySelector('.quick-add .t-input input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(f, '审计-快速添加');
    f.dispatchEvent(new Event('input', { bubbles: true }));
    f.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    return true;
  })()`);
  await sleep(900);
  const tf = await readJson('todos');
  const created = tf.items.find((t) => t.title === '审计-快速添加');
  return { ok: !!created && created.quadrant === 'q4', note: created ? `象限=${created.quadrant}（拖前 ${before} 张）` : '未创建' };
});

await check('C3 勾选完成 → 落盘 + 复盘数字更新', async () => {
  const before = await ev(`document.body.innerText.match(/已完成\\s*(\\d+)/)?.[1]`);
  await ev(`(() => {
    const card = [...document.querySelectorAll('.todo-card')].find(c => c.innerText.includes('回一封不重要的邮件'));
    (card.querySelector('.t-checkbox__input') || card.querySelector('.t-checkbox')).click();
    return true;
  })()`);
  await sleep(1000);
  const after = await ev(`document.body.innerText.match(/已完成\\s*(\\d+)/)?.[1]`);
  const tf = await readJson('todos');
  const done = tf.items.find((t) => t.title.includes('回一封'));
  return { ok: Number(after) === Number(before) + 1 && done?.done, note: `${before} → ${after}` };
}, { severity: 'high' });

await check('C4 重复待办完成后，下一期生成到正确日期', async () => {
  const before = await readJson('todos');
  const weekly = before.items.find((t) => t.title.includes('整理本周工作记录'));
  await ev(`(() => {
    const card = [...document.querySelectorAll('.todo-card')].find(c => c.innerText.includes('整理本周工作记录'));
    (card.querySelector('.t-checkbox__input') || card.querySelector('.t-checkbox')).click();
    return true;
  })()`);
  await sleep(1200);
  const after = await readJson('todos');
  const spawned = after.items.filter((t) => t.repeatOf === weekly.id);
  const expected = weekly.date;
  const actual = spawned[0]?.date;
  return {
    ok: spawned.length === 1 && actual !== expected,
    note: spawned.length ? `生成日期 ${actual}（原日期 ${expected}，期望 +7 天）` : '没有生成下一期',
  };
}, { severity: 'critical' });

await check('C5 顺延未完成到次日', async () => {
  const before = await readJson('todos');
  const pending = before.items.filter((t) => t.date === new Date().toISOString().slice(0, 10) && !t.done).length;
  const ok = await clickText('button', '顺延未完成', 900);
  const clickedConfirm = await dialogClick('确定', 1400);
  const after = await readJson('todos');
  const tomorrow = after.items.filter((t) => t.date > new Date().toISOString().slice(0, 10)).length;
  const dlg = await ev(`(() => { const d = [...document.querySelectorAll('.t-dialog')].filter(x => x.getBoundingClientRect().height > 10).pop(); return d ? d.innerText.replace(/\\s+/g,' ').slice(0, 60) : '无弹窗'; })()`);
  return { ok: ok && tomorrow >= pending, note: `未完成 ${pending} 条 → 次日共 ${tomorrow} 条；确定按钮点击=${clickedConfirm}；当前弹窗=${dlg}` };
}, { severity: 'high' });

await check('C6 切换列表视图', async () => {
  await clickText('.toolbar .t-radio-button, .toolbar label', '列表', 800);
  const groups = await ev(`document.querySelectorAll('.list-view .t-card').length`);
  const boardGone = (await ev(`document.querySelectorAll('.qcol').length`)) === 0;
  return { ok: groups > 0 && boardGone, note: `列表分组 ${groups} 个` };
});

await check('C7 详情弹窗新建待办（明天）', async () => {
  await clickText('button', '新建待办（填写细节）', 700);
  const opened = await dialogOpen();
  await dialogSetField('审计-弹窗新建');
  await sleep(200);
  await dialogClick('添加', 1000);
  const tf = await readJson('todos');
  return { ok: opened && tf.items.some((t) => t.title === '审计-弹窗新建'), note: '' };
}, { severity: 'high' });

await check('C8 从项目引入', async () => {
  await clickText('button', '从项目引入', 700);
  const opened = await dialogOpen();
  const sel = await ev(`!!document.querySelector('.t-dialog .t-select')`);
  await dialogClick('加入待办', 1000);
  const tf = await readJson('todos');
  const linked = tf.items.filter((t) => t.taskId).length;
  return { ok: opened && sel && linked >= 1, note: `带来源标记的待办 ${linked} 条` };
});

await check('C9 卡片悬浮操作：置顶', async () => {
  const target = await ev(`(() => {
    const card = document.querySelector('.todo-card');
    if (!card) return null;
    const pin = card.querySelector('[data-test="todo-pin"]');
    if (!pin) return null;
    pin.click();
    return card.dataset.todoId;
  })()`);
  await sleep(900);
  const tf = await readJson('todos');
  const item = tf.items.find((t) => t.id === target);
  return { ok: !!target && item?.pinned === true, note: target ? `待办「${item?.title?.slice(0, 10)}」pinned=${item?.pinned}` : '没有卡片' };
});

/* ============ D. 灵感 ============ */
await ev(`location.hash = '#/ideas'`);
await sleep(900);

await check('D1 时间线渲染', async () => {
  const n = await ev(`document.querySelectorAll('.idea-card').length`);
  return { ok: n === 3, note: `${n} 条` };
});

await check('D2 记录灵感（含标签）', async () => {
  await setField('.composer .t-textarea', '审计：这是一条测试灵感');
  await setField('.composer .t-input', '测试 审计');
  await sleep(200);
  await clickText('.composer button', '记录', 1000);
  const f = await readJson('ideas');
  const created = f.items.find((i) => i.content.includes('审计：这是一条测试灵感'));
  return { ok: !!created && created.tags.length === 2, note: `标签 ${created?.tags?.join('/')}` };
});

await check('D3 收藏后置顶', async () => {
  const firstBefore = await ev(`document.querySelector('.idea-card')?.innerText.slice(0, 20)`);
  await ev(`(() => {
    const card = [...document.querySelectorAll('.idea-card')].find(c => c.innerText.includes('审计：这是一条测试灵感'));
    const star = card?.querySelector('[data-test="idea-star"]');
    if (!star) return false;
    star.click();
    return true;
  })()`);
  await sleep(800);
  const f = await readJson('ideas');
  const fav = f.items.find((i) => i.content.includes('审计：这是一条测试灵感'));
  const firstId = await ev(`document.querySelector('.idea-card')?.dataset.ideaId`);
  return { ok: fav?.favorite === true && firstId === fav.id, note: `favorite=${fav?.favorite} 首条=${firstId === fav?.id ? '是它' : '不是它'}` };
});

await check('D4 转成项目任务（新建项目）', async () => {
  await ev(`(() => {
    const card = [...document.querySelectorAll('.idea-card')].find(c => c.innerText.includes('审计：这是一条测试灵感'));
    [...card.querySelectorAll('button')].find(b => b.innerText.includes('转成行动')).click();
    return true;
  })()`);
  await sleep(700);
  const chosen = await dialogChoose(0, '转成项目里的任务', 700);
  await dialogClick('转换', 1300);
  const pf = await readJson('projects');
  const has = pf.items.some((p) => p.children?.some((c) => c.title.includes('审计：这是一条测试灵感')));
  const f = await readJson('ideas');
  const adopted = f.items.find((i) => i.content.includes('审计：这是一条测试灵感'));
  return { ok: has && adopted?.status === 'adopted', note: `选下拉=${chosen} 任务创建=${has} 状态=${adopted?.status}` };
}, { severity: 'high' });

await check('D5 随机回顾弹窗', async () => {
  await clickText('button', '随机回顾', 700);
  const open = await dialogOpen();
  await dialogClick('关闭', 500);
  return { ok: open };
});

/* ============ E. 工作汇报 ============ */
await ev(`location.hash = '#/reports'`);
await sleep(900);

await check('E1 一键生成周报', async () => {
  await clickText('button', '一键生成', 1600);
  const t = await text();
  const rf = await readJson('reports');
  return { ok: t.includes('重点项目进展') && rf.items.length === 1, note: `报告 ${rf?.items?.length} 份` };
}, { severity: 'high' });

await check('E2 手写总结：输入后未失焦是否已保存', async () => {
  const ok = await setField('.t-textarea', '审计：边打字边保存验证');
  await sleep(1200);
  const rf = await readJson('reports');
  return {
    ok: (rf.items[0].manual.summary ?? '').includes('边打字边保存'),
    note: ok === 'ok' ? '' : '输入失败',
  };
}, { severity: 'high' });

await check('E3 重新生成（确认弹窗 → 保留手写）', async () => {
  await clickText('button', '重新生成', 800);
  const confirmShown = await dialogOpen();
  await clickText('.t-dialog button', '确定', 1400);
  const rf = await readJson('reports');
  return {
    ok: confirmShown && rf.items[0].manual.summary.includes('边打字边保存'),
    note: `确认弹窗=${confirmShown} 手写保留=${rf.items[0].manual.summary.includes('边打字边保存')}`,
  };
}, { severity: 'high' });

await check('E4 标记定稿 → 落盘', async () => {
  await clickText('button', '标记定稿', 900);
  const rf = await readJson('reports');
  return { ok: rf.items[0].status === 'final', note: rf.items[0].status };
});

await check('E5 导出下拉能打开', async () => {
  await ev(`(() => {
    const b = [...document.querySelectorAll('button')].find(x => x.innerText.includes('导出'));
    if (!b) return false; b.click(); return true;
  })()`);
  await sleep(600);
  const items = await ev(`document.querySelectorAll('.t-dropdown__item').length`);
  await ev(`document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}))`);
  await sleep(300);
  return { ok: items >= 3, note: `${items} 个导出项` };
});

await check('E6 复制摘要', async () => {
  const before = (await text()).includes('摘要已复制');
  await clickText('button', '复制摘要', 900);
  const after = (await text()).includes('摘要已复制');
  return { ok: after, note: before ? '之前就有提示' : '' };
});

await check('E7 顺延未完成到下期', async () => {
  const rf = await readJson('reports');
  const undone = rf.items[0].snapshot.undoneTodos.length;
  const ok = await clickText('button', '顺延到下期', 1200);
  await dialogClick('确定', 1800);
  const tf = await readJson('todos');
  const moved = tf.items.filter((t) => rf.items[0].snapshot.undoneTodos.some((u) => u.id === t.id && t.date !== u.date)).length;
  return { ok: ok && moved === undone && undone > 0, note: `未完成 ${undone} 条，实际移动 ${moved} 条` };
}, { severity: 'high' });

await check('E8 删除汇报回到列表', async () => {
  await clickText('button', '删除', 900);
  await dialogClick('确定', 1800);
  const rf = await readJson('reports');
  const list = (await text()).includes('历史汇报');
  return { ok: rf.items.length === 0 && list, note: `剩余 ${rf.items.length} 份` };
});

/* ============ F. 设置 ============ */
await ev(`location.hash = '#/settings'`);
await sleep(900);

await check('F1 备份列表弹窗', async () => {
  await clickText('button', '查看备份列表', 1000);
  const open = await dialogOpen();
  const rows = await ev(`document.querySelectorAll('.backup-row').length`);
  await dialogClick('关闭', 500);
  return { ok: open && rows >= 1, note: `${rows} 个备份文件` };
});

await check('F2 深色模式切换并持久化', async () => {
  await ev(`(() => { const s = document.querySelector('.t-switch'); s.click(); return true; })()`);
  await sleep(800);
  const mode = await ev(`document.documentElement.getAttribute('theme-mode')`);
  await send('Page.reload');
  await sleep(2400);
  const mode2 = await ev(`document.documentElement.getAttribute('theme-mode')`);
  return { ok: mode === 'dark' && mode2 === 'dark', note: `${mode} / 刷新后 ${mode2}` };
});

/* ============ G. 搜索 ============ */
await check('G1 搜索 → 点结果 → 高亮目标', async () => {
  await ev(`(() => {
    const f = document.querySelector('.search-box .t-input input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(f, '盘点');
    f.dispatchEvent(new Event('input', { bubbles: true }));
    return true;
  })()`);
  await sleep(700);
  const hits = await ev(`document.querySelectorAll('.search-item').length`);
  await ev(`document.querySelector('.search-item').click()`);
  await sleep(1400);
  const hash = await ev('location.hash');
  const flashed = await ev(`!!document.querySelector('.flash')`);
  return { ok: hits > 0 && hash.includes('projects') && flashed, note: `命中 ${hits} 条，跳转 ${hash}，高亮=${flashed}` };
}, { severity: 'high' });

/* ============ H. 窄屏 ============ */
await check('H1 900px 窄屏布局不崩', async () => {
  await send('Emulation.setDeviceMetricsOverride', { width: 900, height: 900, deviceScaleFactor: 1, mobile: false });
  await ev(`location.hash = '#/todos'`);
  await sleep(1200);
  const overflow = await ev(`document.documentElement.scrollWidth - document.documentElement.clientWidth`);
  await shot('narrow-900');
  await send('Emulation.clearDeviceMetricsOverride');
  return { ok: overflow <= 2, note: `横向溢出 ${overflow}px` };
});

/* ---------------- 收尾 ---------------- */
await fetch(`${APP}/api/config`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ dataDir: REAL_DATA }),
});
fs.rmSync(TMP_DATA, { recursive: true, force: true });

const bugs = findings.filter((f) => !f.ok);
console.log('');
console.log(`=== 共 ${findings.length} 项检查，通过 ${findings.length - bugs.length}，异常 ${bugs.length} ===`);
for (const b of bugs) console.log(`- [${b.severity}] ${b.name}｜${b.note}`);
console.log(`控制台报错总数：${errors.length}`);
if (errors.length) console.log(errors.slice(0, 5).join('\n'));

await fsp.mkdir(SHOTS, { recursive: true });
await fsp.writeFile(path.join(SHOTS, 'audit-result.json'), JSON.stringify({ findings, errors }, null, 2));

ws.close();
chrome.kill();
process.exit(0);
