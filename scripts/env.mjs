/** 脚本/测试共用：项目根目录、截图目录、Chrome 可执行文件位置（跨平台） */
import fs from 'node:fs';
import path from 'node:path';

/** 本文件所在目录的上一级 = 项目根目录 */
export const ROOT = path.resolve(import.meta.dirname, '..');
export const REVIEW = path.join(ROOT, '_review');
export const DATA = path.join(ROOT, 'data');
export const DOCS = path.join(ROOT, 'docs');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);

/** 找得到就用第一个存在的，找不到就返回第一个候选（让报错信息可读） */
export const CHROME = CANDIDATES.find((p) => fs.existsSync(p)) ?? CANDIDATES[0];

if (!fs.existsSync(CHROME)) {
  console.warn(`[warn] 没找到 Chrome，可用 CHROME_PATH 环境变量指定：当前=${CHROME}`);
}
