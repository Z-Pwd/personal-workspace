/**
 * 生成 README 封面图与功能总览图
 * 用法：node scripts/cover.mjs
 * 产出：docs/cover.png（1280×640）、docs/features.png（1280×780）
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { CHROME, DOCS, ROOT } from './env.mjs';
const SHOTS = path.join(DOCS, 'screenshots');

const b64 = (name) => `data:image/png;base64,${fs.readFileSync(path.join(SHOTS, name)).toString('base64')}`;

const cover = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    width: 1280px; height: 640px; overflow: hidden; position: relative;
    font-family: "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif;
    background: radial-gradient(900px 520px at 12% 8%, #16305c 0%, rgba(22,48,92,0) 62%),
                radial-gradient(760px 460px at 92% 96%, #3a2a6b 0%, rgba(58,42,107,0) 60%),
                linear-gradient(135deg, #070d19 0%, #0b1526 48%, #0a1020 100%);
    color: #fff;
  }
  .grid {
    position: absolute; inset: 0;
    background-image: linear-gradient(rgba(255,255,255,.035) 1px, transparent 1px),
                      linear-gradient(90deg, rgba(255,255,255,.035) 1px, transparent 1px);
    background-size: 44px 44px;
    mask-image: linear-gradient(120deg, #000 20%, transparent 78%);
  }
  .left { position: absolute; left: 68px; top: 74px; width: 566px; }
  .kicker {
    display: inline-flex; align-items: center; gap: 8px;
    font-size: 12px; letter-spacing: 2.6px; color: #7fa6e0;
    border: 1px solid rgba(122,166,255,.32); background: rgba(20,42,80,.45);
    padding: 6px 12px; border-radius: 999px; text-transform: uppercase;
  }
  .dot { width: 6px; height: 6px; border-radius: 50%; background: #4f9dff; box-shadow: 0 0 10px #4f9dff; }
  h1 { font-size: 62px; line-height: 1.08; letter-spacing: 1px; margin: 22px 0 16px; font-weight: 800; }
  h1 span { background: linear-gradient(96deg, #6fb1ff 0%, #9d8bff 55%, #6ee7d5 100%); -webkit-background-clip: text; color: transparent; }
  .sub { font-size: 23px; line-height: 1.55; color: #a8bcd8; font-weight: 400; }
  .sub b { color: #e8f1ff; font-weight: 600; }
  .feats { display: grid; grid-template-columns: 1fr 1fr; gap: 12px 20px; margin-top: 30px; }
  .feat { display: flex; align-items: center; gap: 10px; font-size: 16.5px; color: #d7e4f7; }
  .feat i {
    width: 30px; height: 30px; border-radius: 9px; display: grid; place-items: center;
    font-style: normal; font-size: 15px;
    background: linear-gradient(150deg, rgba(83,141,255,.28), rgba(120,97,255,.18));
    border: 1px solid rgba(140,175,255,.28);
  }
  .chips { position: absolute; left: 68px; bottom: 56px; display: flex; gap: 8px; }
  .chip {
    font-size: 12.5px; color: #b9cdea; padding: 6px 11px; border-radius: 7px;
    background: rgba(255,255,255,.055); border: 1px solid rgba(255,255,255,.09);
  }
  .right { position: absolute; right: 56px; top: 92px; width: 588px; }
  .frame {
    border-radius: 14px; overflow: hidden; border: 1px solid rgba(150,185,255,.26);
    box-shadow: 0 30px 70px rgba(0,0,0,.55), 0 0 0 6px rgba(20,40,76,.5);
    background: #0d1526;
  }
  .bar { height: 30px; display: flex; align-items: center; gap: 6px; padding: 0 12px; background: #141d31; border-bottom: 1px solid rgba(255,255,255,.06); }
  .bar i { width: 9px; height: 9px; border-radius: 50%; display: block; }
  .bar .url { margin-left: 10px; font-size: 11px; color: #7f93b2; font-family: Consolas, monospace; }
  .frame img { display: block; width: 100%; height: auto; }
  .glow { position: absolute; width: 380px; height: 380px; right: -60px; top: -70px; border-radius: 50%;
          background: radial-gradient(circle, rgba(90,140,255,.30), rgba(90,140,255,0) 70%); filter: blur(10px); }
  .foot { position: absolute; right: 62px; bottom: 58px; font-size: 12.5px; color: #6f88ab; letter-spacing: .4px; }
</style></head>
<body>
  <div class="grid"></div>
  <div class="glow"></div>

  <div class="left">
    <div class="kicker"><span class="dot"></span>LOCAL FIRST · 数据自持</div>
    <h1>个人<span>工作台</span></h1>
    <div class="sub">把工作量统计从 txt / Word 里解放出来：<br><b>项目拆解 → 今日执行 → 灵感沉淀 → 周报生成</b></div>
    <div class="feats">
      <div class="feat"><i>🗂</i>项目多级拆解</div>
      <div class="feat"><i>✅</i>四象限待办</div>
      <div class="feat"><i>💡</i>灵感转行动</div>
      <div class="feat"><i>📊</i>周报一键生成</div>
    </div>
  </div>

  <div class="right">
    <div class="frame">
      <div class="bar"><i style="background:#ff5f57"></i><i style="background:#febc2e"></i><i style="background:#28c840"></i>
        <span class="url">127.0.0.1:7788</span></div>
      <img src="${b64('dashboard.png')}" alt="dashboard">
    </div>
  </div>

  <div class="chips">
    <span class="chip">Vue 3</span>
    <span class="chip">TDesign 腾讯组件库</span>
    <span class="chip">TypeScript</span>
    <span class="chip">本地 JSON 存储</span>
    <span class="chip">离线可用</span>
  </div>
  <div class="foot">github.com/Z-Pwd/personal-workspace</div>
</body></html>`;

const features = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { width: 1280px; height: 500px; overflow: hidden; padding: 26px 36px;
    font-family: "Microsoft YaHei UI", "Microsoft YaHei", "Segoe UI", sans-serif;
    background: linear-gradient(160deg, #0a1220 0%, #0c1727 100%); color: #fff; }
  h2 { font-size: 21px; font-weight: 700; letter-spacing: .5px; }
  h2 em { font-style: normal; color: #6fa8ff; }
  .hint { font-size: 12.5px; color: #7f95b6; margin-top: 6px; }
  .grid { margin-top: 20px; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
  .card { background: #0f1a2c; border: 1px solid rgba(140,175,255,.16); border-radius: 12px; overflow: hidden;
          box-shadow: 0 14px 34px rgba(0,0,0,.32); }
  .card .head { display: flex; align-items: center; gap: 8px; padding: 9px 13px; border-bottom: 1px solid rgba(255,255,255,.06); }
  .card .head .t { font-size: 13px; font-weight: 600; color: #e6efff; }
  .card .head .d { font-size: 11.5px; color: #7f95b6; margin-left: auto; }
  .card img { display: block; width: 100%; height: 178px; object-fit: cover; object-position: top center; }
</style></head>
<body>
  <h2>功能演示 <em>· 四个模块一条闭环</em></h2>
  <div class="hint">项目拆解 → 今日执行 → 灵感沉淀 → 周期汇报，数据全部落在你自己的文件夹里</div>
  <div class="grid">
    <div class="card"><div class="head"><span class="t">项目管理</span><span class="d">多级树 · 进度汇总 · 回收站</span></div>
      <img src="${b64('projects.png')}" alt="projects"></div>
    <div class="card"><div class="head"><span class="t">今日待办</span><span class="d">四象限拖拽 · 顺延 · 复盘</span></div>
      <img src="${b64('todos.png')}" alt="todos"></div>
    <div class="card"><div class="head"><span class="t">灵光一闪</span><span class="d">时间线 · 标签 · 一键转任务</span></div>
      <img src="${b64('ideas.png')}" alt="ideas"></div>
    <div class="card"><div class="head"><span class="t">工作汇报</span><span class="d">一键生成 · 环比 · 导出 Markdown</span></div>
      <img src="${b64('report-detail.png')}" alt="report"></div>
  </div>
</body></html>`;

fs.mkdirSync(DOCS, { recursive: true });
fs.writeFileSync(path.join(DOCS, 'cover.html'), cover, 'utf8');
fs.writeFileSync(path.join(DOCS, 'features.html'), features, 'utf8');

function render(html, out, w, h, dsf) {
  execFileSync(CHROME, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars',
    '--force-device-scale-factor=' + dsf,
    `--window-size=${w},${h}`,
    `--screenshot=${out}`,
    'file:///' + html.replace(/\\/g, '/'),
  ], { stdio: 'ignore' });
  const kb = Math.round(fs.statSync(out).size / 1024);
  console.log(`RENDER ${path.basename(out)}  ${w * dsf}×${h * dsf}  ${kb} KB`);
}

render(path.join(DOCS, 'cover.html'), path.join(DOCS, 'cover.png'), 1280, 640, 1.5);
render(path.join(DOCS, 'features.html'), path.join(DOCS, 'features.png'), 1280, 500, 2);
console.log('DONE');
