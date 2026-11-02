/**
 * 自然语言解析单测（纯函数，跑得很快）
 * 用法：node test/nlp.test.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as esbuild from 'esbuild';

import { ROOT } from '../scripts/env.mjs';

const tmpDir = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_nlp_test');
fs.mkdirSync(tmpDir, { recursive: true });
const bundle = path.join(tmpDir, 'nlp.mjs');

await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'core', 'nlp.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'silent',
});

const { parseCapture, parseDatePhrase, parseHours } = await import(pathToFileURL(bundle).href);

const results = [];
const rec = (name, ok, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  —  ${note}` : ''}`);
};

const TODAY = '2026-11-02'; // 周一
const dateOf = (text) => parseDatePhrase(text, TODAY)?.date ?? null;

/* ===== 日期 ===== */
const cases = [
  ['今天', '2026-11-02'],
  ['明天', '2026-11-03'],
  ['后天', '2026-11-04'],
  ['大后天', '2026-11-05'],
  ['3天后', '2026-11-05'],
  ['周五', '2026-11-06'],
  ['这周五', '2026-11-06'],
  ['下周三', '2026-11-11'],
  ['上周五', '2026-10-30'],
  ['周日', '2026-11-08'],
  ['11-20', '2026-11-20'],
  ['11月25日', '2026-11-25'],
  ['20号', '2026-11-20'],
  ['5号', '2026-11-05'],
  ['1号', '2026-12-01'], // 已过 → 下月
];
for (const [text, want] of cases) {
  const got = dateOf(text);
  rec(`日期「${text}」→ ${want}`, got === want, got === want ? '' : `实际 ${got}`);
}
rec('无日期短语返回 null', dateOf('写周报') === null);

/* ===== 工时 ===== */
rec('工时 3h', parseHours('3h')?.hours === 3);
rec('工时 2.5小时', parseHours('2.5小时')?.hours === 2.5);
rec('工时 半小时', parseHours('半小时')?.hours === 0.5);
rec('工时 一个半小时', parseHours('一个半小时')?.hours === 1.5);
rec('工时 25小时超范围不解析', parseHours('25小时') === null);

/* ===== 组合 ===== */
const c1 = parseCapture('#产品 写周报 明天 2h', TODAY);
rec(
  '组合：标签+日期+工时',
  c1.title === '写周报' && c1.tags[0] === '产品' && c1.date === '2026-11-03' && c1.hours === 2,
  JSON.stringify(c1),
);

const c2 = parseCapture('@工作台 修登录 bug !高', TODAY);
rec(
  '组合：项目+优先级',
  c2.project === '工作台' && c2.priority === 'high' && c2.title === '修登录 bug',
  JSON.stringify(c2),
);

const c3 = parseCapture('周五 复盘本周数据 !中', TODAY);
rec(
  '组合：周五+优先级，标题不含日期',
  c3.date === '2026-11-06' && c3.priority === 'mid' && c3.title === '复盘本周数据',
  JSON.stringify(c3),
);

const c4 = parseCapture('3天后 3h 把方案定下来', TODAY);
rec(
  '日期与工时互不干扰',
  c4.date === '2026-11-05' && c4.hours === 3 && c4.title === '把方案定下来',
  JSON.stringify(c4),
);

const c5 = parseCapture('买咖啡豆 #生活 #生活 #采购', TODAY);
rec('重复标签去重', c5.tags.length === 2 && c5.tags.join(',') === '生活,采购', JSON.stringify(c5.tags));

const c6 = parseCapture('就是一句普通的话 没有语法', TODAY);
rec(
  '无语法：标题保留原文',
  c6.title === '就是一句普通的话 没有语法' && c6.date === null && c6.hours === null && c6.tags.length === 0,
  JSON.stringify(c6),
);

const c7 = parseCapture('  多余   空格   ', TODAY);
rec('标题压缩多余空格', c7.title === '多余 空格', JSON.stringify(c7.title));

/* ===== 边界 ===== */
const c8 = parseCapture('#a @b !低 明天 2h 干活', TODAY);
rec(
  '全部语法同时出现',
  c8.tags[0] === 'a' && c8.project === 'b' && c8.priority === 'low' && c8.date === '2026-11-03' && c8.hours === 2 && c8.title === '干活',
  JSON.stringify(c8),
);

const c8b = parseCapture('明天 11-20 对一下时间', TODAY);
rec(
  '多个日期只取第一个',
  c8b.date === '2026-11-03' && c8b.title.includes('11-20'),
  JSON.stringify(c8b),
);

const c9 = parseCapture('#标签', TODAY);
rec('只有标签时标题为空', c9.tags[0] === '标签' && c9.title === '', JSON.stringify(c9));

const failed = results.filter((r) => !r.ok);
console.log(`\n=== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} ===`);
if (failed.length) console.log('失败项：', failed.map((f) => f.name).join(' | '));
process.exit(failed.length ? 1 : 0);
