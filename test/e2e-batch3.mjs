/**
 * 第三批验收：汇报模板（顺序/标题/开关）、Word 导出（docx 结构）、季度报、提醒设置
 * 用法：node test/e2e-batch3.mjs（需先启动服务）
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CHROME, ROOT } from '../scripts/env.mjs';

const APP = 'http://127.0.0.1:7788';
const PORT = 9431;
const TMP = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_b3_data');
const PROF = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_b3_profile');
const DL = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_b3_dl');
const REAL = `${ROOT}/data`;

for (const d of [TMP, PROF, DL]) fs.rmSync(d, { recursive: true, force: true });
for (const d of [TMP, DL]) fs.mkdirSync(d, { recursive: true });

const results = [];
const rec = (name, ok, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  —  ${note}` : ''}`);
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const cfg = (dir) =>
  fetch(`${APP}/api/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ dataDir: dir }) });

/* ---------- 极小 ZIP 读取器（够验证我们生成的 docx） ---------- */
function readZip(buf) {
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('不是有效 ZIP（未找到 EOCD）');
  const count = view.getUint16(eocd + 10, true);
  let off = view.getUint32(eocd + 16, true);
  const files = new Map();
  for (let i = 0; i < count; i++) {
    if (view.getUint32(off, true) !== 0x02014b50) throw new Error('中央目录损坏');
    const crc = view.getUint32(off + 16, true);
    const size = view.getUint32(off + 20, true);
    const nameLen = view.getUint16(off + 28, true);
    const extraLen = view.getUint16(off + 30, true);
    const commentLen = view.getUint16(off + 32, true);
    const localOff = view.getUint32(off + 42, true);
    const name = new TextDecoder().decode(buf.subarray(off + 46, off + 46 + nameLen));
    const dataStart = localOff + 30 + view.getUint16(localOff + 26, true) + view.getUint16(localOff + 28, true);
    files.set(name, { data: buf.subarray(dataStart, dataStart + size), crc });
    off += 46 + nameLen + extraLen + commentLen;
  }
  return files;
}

function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c ^= bytes[i];
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  return (c ^ 0xffffffff) >>> 0;
}

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
const setInput = async (sel, text) => ev(`(() => {
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
const waitFile = async (dir, ext, timeout = 8000) => {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    const f = fs.readdirSync(dir).find((x) => x.endsWith(ext) && !x.endsWith('.crdownload'));
    if (f) return path.join(dir, f);
    await sleep(200);
  }
  return null;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: DL });
await sleep(2400);

// 造点数据：示例数据 + 一条带工时的任务（让报告有内容）
await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('先看看示例数据')); if (b) b.click(); return true; })()`);
await sleep(1800);

/* ================= 1. 生成周报 ================= */
await ev(`location.hash = '#/reports'`);
await sleep(1200);
await clickText('button', '一键生成', 2600);
const reports1 = await (await fetch(`${APP}/api/doc/reports`)).json();
rec('生成周报', reports1.items.length === 1, `${reports1.items.length} 份`);
const reportId = reports1.items[0].id;
const sectionsBefore = reports1.items[0].snapshot.sections ?? [];
rec('报告记录了生成时的章节模板', sectionsBefore.length === 6, `章节数 ${sectionsBefore.length}`);

await ev(`location.hash = '#/reports?id=${reportId}'`);
await sleep(1300);

/* ================= 2. 模板：改名 / 关章节 / 调顺序 ================= */
await ev(`(() => { document.querySelector('[data-test="open-template"]')?.click(); return true; })()`);
await sleep(900);
const tplOpen = await ev(`!!document.querySelector('[data-test="tpl-list"]')`);
rec('模板弹窗能打开', tplOpen === true);

// 关掉「灵感」章节
await ev(`(() => {
  const row = document.querySelector('[data-key="ideas"]');
  const sw = row?.querySelector('.t-switch');
  if (sw) sw.click();
  return !!sw;
})()`);
await sleep(400);

// 把「待办完成情况」改名
await setInput('[data-test="tpl-title-todos"]', '任务完成情况');
await sleep(300);

// 把「概览」下移一位
await ev(`(() => {
  const row = document.querySelector('[data-key="overview"]');
  const btns = row ? [...row.querySelectorAll('button')] : [];
  const down = btns.find((b) => b.textContent.includes('↓'));
  if (down) down.click();
  return !!down;
})()`);
await sleep(400);

const draftState = await ev(`JSON.stringify({
  rows: [...document.querySelectorAll('.tpl-row')].map((r) => r.getAttribute('data-key')),
  ideasOn: !document.querySelector('[data-key="ideas"]')?.querySelector('.t-switch')?.classList.contains('t-is-checked'),
})`);
await ev(`(() => { document.querySelector('[data-test="tpl-save"]')?.click(); return true; })()`);
await sleep(1500);

const tplDoc = await (await fetch(`${APP}/api/doc/templates`)).json();
const saved = tplDoc.items[0];
rec('模板已落盘到 templates.json', !!saved && saved.sections.length === 6, JSON.stringify(saved?.sections?.map((s) => `${s.key}:${s.enabled ? 'on' : 'off'}`)));
rec('关掉的章节被记录为关闭', saved?.sections?.find((s) => s.key === 'ideas')?.enabled === false);
rec('改名的章节已保存', saved?.sections?.find((s) => s.key === 'todos')?.title === '任务完成情况', saved?.sections?.find((s) => s.key === 'todos')?.title);
rec('顺序已调整（概览不再排第一）', saved?.sections?.[0]?.key !== 'overview', `首位=${saved?.sections?.[0]?.key}（原顺序：${JSON.parse(draftState).rows.join('>')}）`);

/* ================= 3. 详情页按模板渲染 ================= */
const detailHasIdeas = await ev(`document.body.innerText.includes('灵感与沉淀')`);
rec('关掉的章节在详情页隐藏', detailHasIdeas === false);
const detailTitle = await ev(`document.body.innerText.includes('任务完成情况')`);
rec('改名的章节在详情页生效', detailTitle === true);

/* ================= 4. 导出 Markdown（顺序/开关/标题） ================= */
await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('导出')); if (b) b.click(); return !!b; })()`);
await sleep(700);
await ev(`(() => { const it = [...document.querySelectorAll('.t-dropdown__item')].find((x) => x.textContent.includes('Markdown')); if (it) it.click(); return !!it; })()`);
await sleep(1200);
const mdPath = await waitFile(DL, '.md');
const md = mdPath ? fs.readFileSync(mdPath, 'utf8') : '';
const headings = md.split('\n').filter((l) => l.startsWith('## '));
rec('Markdown 导出成功', md.length > 50, `${md.length} 字`);
rec('导出不含关闭的章节', !md.includes('灵感与沉淀'));
rec('导出包含改名后的章节', md.includes('任务完成情况'), headings.slice(0, 2).join(' / '));
rec(
  '导出章节顺序跟随模板',
  headings[0]?.includes('重点项目进展') || headings[0]?.includes('本期工作概览') ? !headings[0].includes('本期工作概览') : true,
  headings.map((h) => h.replace('## ', '')).join(' | '),
);

/* ================= 5. 导出 Word ================= */
await ev(`(() => { const b = [...document.querySelectorAll('button')].find((x) => x.textContent.includes('导出')); if (b) b.click(); return !!b; })()`);
await sleep(700);
await ev(`(() => { const it = [...document.querySelectorAll('.t-dropdown__item')].find((x) => x.textContent.includes('Word')); if (it) it.click(); return !!it; })()`);
await sleep(1500);
const docxPath = await waitFile(DL, '.docx');
let docxOk = false;
let docxNote = '';
let xml = '';
if (docxPath) {
  const buf = new Uint8Array(fs.readFileSync(docxPath));
  try {
    const files = readZip(buf);
    const doc = files.get('word/document.xml');
    const types = files.get('[Content_Types].xml');
    xml = doc ? new TextDecoder().decode(doc.data) : '';
    const crcOk = doc ? crc32(doc.data) === doc.crc : false;
    docxOk = !!doc && !!types && crcOk && xml.includes('<w:document') && xml.includes('任务完成情况');
    docxNote = `${buf.length} 字节 · 条目=${[...files.keys()].join(',')} · CRC=${crcOk ? 'ok' : 'bad'}`;
  } catch (err) {
    docxNote = `解析失败：${err.message}`;
  }
} else {
  docxNote = '没有下载到 .docx';
}
rec('Word 导出为合法 docx', docxOk, docxNote);
rec('docx 内容按模板（含改名章节、不含关闭章节）', xml.includes('任务完成情况') && !xml.includes('灵感与沉淀'));

/* ================= 6. 季度报 ================= */
await ev(`location.hash = '#/reports'`);
await sleep(1200);
const quarterClicked = await ev(`(() => {
  const b = document.querySelector('[data-test="gen-quarter"]');
  if (b) { b.click(); return true; }
  return false;
})()`);
await sleep(2600);
const reports2 = (await (await fetch(`${APP}/api/doc/reports`)).json()).items;
const quarter = reports2.find((r) => r.kind === 'quarter');
rec('生成季度报', quarterClicked && !!quarter, quarter ? `${quarter.start}~${quarter.end}` : '未生成');
if (quarter) {
  const startMonth = Number(quarter.start.slice(5, 7));
  const okRange = [1, 4, 7, 10].includes(startMonth) && quarter.start.endsWith('-01');
  rec('季度范围正确（1/4/7/10 月起）', okRange, quarter.start);
  rec('标题含「季报」', quarter.title.includes('季报'), quarter.title);
}

/* ================= 7. 提醒设置持久化 ================= */
await ev(`location.hash = '#/settings'`);
await sleep(1200);
await ev(`(() => { const sw = document.querySelector('[data-test="reminder-toggle"] .t-switch') || document.querySelector('[data-test="reminder-toggle"]'); if (sw) sw.click(); return !!sw; })()`);
await sleep(600);
const prefs = await ev(`localStorage.getItem('wb-reminder-prefs')`);
rec('提醒开关写入本地配置', !!prefs && JSON.parse(prefs).enabled === true, prefs ?? '空');

await send('Page.reload');
await sleep(2500);
await ev(`location.hash = '#/settings'`);
await sleep(1200);
const stillOn = await ev(`(() => {
  const el = document.querySelector('[data-test="reminder-toggle"]');
  return el ? el.classList.contains('t-is-checked') : null;
})()`);
rec('刷新后提醒开关保持开启', stillOn === true, `checked=${stillOn}`);

rec('第三批流程无控制台报错', errors.length === 0, errors.slice(0, 2).join(' | '));

await cfg(REAL);
const failed = results.filter((r) => !r.ok);
console.log(`\n=== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} ===`);
if (failed.length) console.log('失败项：', failed.map((f) => f.name).join(' | '));

ws.close();
chrome.kill();
fs.rmSync(TMP, { recursive: true, force: true });
fs.rmSync(DL, { recursive: true, force: true });
process.exit(failed.length ? 1 : 0);
