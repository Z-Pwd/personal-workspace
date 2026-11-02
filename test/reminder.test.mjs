/** 提醒逻辑单测（纯函数，不依赖浏览器） */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import * as esbuild from 'esbuild';

import { ROOT } from '../scripts/env.mjs';

const tmpDir = path.join(process.env.LOCALAPPDATA ?? '/tmp', 'Temp', 'wb_rem_test');
fs.mkdirSync(tmpDir, { recursive: true });
const bundle = path.join(tmpDir, 'reminder.mjs');

await esbuild.build({
  entryPoints: [path.join(ROOT, 'src', 'core', 'reminder.ts')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  outfile: bundle,
  logLevel: 'silent',
});

const { dueReminder } = await import(pathToFileURL(bundle).href);

const results = [];
const rec = (name, ok, note = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${note ? `  —  ${note}` : ''}`);
};

const base = { enabled: true, weekday: 5, time: '17:00', monthEnd: true };
const at = (s) => new Date(s);

rec('关闭时永不触发', dueReminder({ ...base, enabled: false }, at('2026-11-06T17:00:00')) === null);
rec('周五 17:00 触发周报', dueReminder(base, at('2026-11-06T17:00:00')) === 'weekly', String(dueReminder(base, at('2026-11-06T17:00:00'))));
rec('时间不对不触发', dueReminder(base, at('2026-11-06T16:59:00')) === null);
rec('星期不对不触发', dueReminder(base, at('2026-11-05T17:00:00')) === null);
rec(
  '同一天只触发一次',
  dueReminder(base, at('2026-11-06T17:00:00'), { weekly: '2026-11-06' }) === null,
);
rec(
  '月末最后一天触发月报',
  dueReminder(base, at('2026-11-30T17:00:00')) === 'monthly',
  String(dueReminder(base, at('2026-11-30T17:00:00'))),
);
rec(
  '月末和非周五同时命中时优先月报',
  dueReminder({ ...base, weekday: 1 }, at('2026-11-30T17:00:00')) === 'monthly',
);
rec('2 月最后一天（平年 28 号）', dueReminder(base, at('2026-02-28T17:00:00')) === 'monthly');
rec('月末开关关闭时只发周报', dueReminder({ ...base, monthEnd: false }, at('2026-11-06T17:00:00')) === 'weekly');
rec(
  '月末开关关闭时月末不触发（11-30 是周一，这里用周二验证）',
  dueReminder({ ...base, monthEnd: false, weekday: 2 }, at('2026-11-30T17:00:00')) === null,
);
rec(
  '月末正好是设置的那天：月报优先',
  dueReminder({ ...base, weekday: 1 }, at('2026-11-30T17:00:00')) === 'monthly',
);

const failed = results.filter((r) => !r.ok);
console.log(`\n=== 共 ${results.length} 项，通过 ${results.length - failed.length}，失败 ${failed.length} ===`);
if (failed.length) console.log('失败项：', failed.map((f) => f.name).join(' | '));
process.exit(failed.length ? 1 : 0);
