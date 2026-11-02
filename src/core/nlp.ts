/**
 * 快速捕获的自然语言解析：一句话 → 结构化的待办/任务字段
 * 支持：#标签  @项目  !高/!中/!低  明天/周五/下周三/3天后/11-20  3h/2.5小时
 * 纯函数，不依赖 DOM / store，便于单测
 */
import { addDaysISO, todayISO } from './util';
import type { Priority } from './types';

export interface CaptureResult {
  /** 去掉语法标记后的标题 */
  title: string;
  tags: string[];
  priority: Priority | null;
  /** 解析出的日期（yyyy-mm-dd），没解析到为 null */
  date: string | null;
  /** 解析出的工时（小时），没解析到为 null */
  hours: number | null;
  /** @项目 里写的项目名 */
  project: string | null;
}

const WEEKDAY: Record<string, number> = {
  一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 7, 天: 7,
};

/** 本地日期 → 星期几（周一=1 … 周日=7） */
function weekdayOf(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const day = new Date(y, m - 1, d).getDay();
  return day === 0 ? 7 : day;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function validDate(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}

const RELATIVE: Array<[RegExp, number]> = [
  [/今天|今日/, 0],
  [/明天|明日/, 1],
  [/后天/, 2],
  [/大后天/, 3],
  [/昨天|昨日/, -1],
  [/前天/, -2],
];

/** 解析日期短语；返回命中的原文片段，便于从标题里剔除 */
export function parseDatePhrase(text: string, today = todayISO()): { date: string; matched: string } | null {
  const [ty, tm, td] = today.split('-').map(Number);

  // 1) 相对天：今天 / 明天 / 大后天 …（长词优先，避免「后天」吃掉「大后天」）
  for (const [re, offset] of [...RELATIVE].sort((a, b) => b[0].source.length - a[0].source.length)) {
    const m = re.exec(text);
    if (m) return { date: addDaysISO(today, offset), matched: m[0] };
  }

  // 2) N 天后 / N 天之后
  const inDays = /(\d{1,2})\s*天(?:之)?后/.exec(text);
  if (inDays) return { date: addDaysISO(today, Number(inDays[1])), matched: inDays[0] };

  // 3) 本周X / 下周X / 上周X / 周X / 星期X / 礼拜X
  const week = /(本|这|下|上)?\s*(?:周|星期|礼拜)([一二三四五六日天])/.exec(text);
  if (week) {
    const target = WEEKDAY[week[2]];
    const cur = weekdayOf(today);
    let delta = target - cur;
    if (week[1] === '下') delta += 7;
    else if (week[1] === '上') delta -= 7;
    else if (!week[1] && delta < 0) delta += 7; // 只说「周五」→ 指即将到来的周五
    return { date: addDaysISO(today, delta), matched: week[0].trim() };
  }

  // 4) N月N日 / N月N号
  const cnDate = /(\d{1,2})\s*月\s*(\d{1,2})\s*[日号]/.exec(text);
  if (cnDate) {
    const m = Number(cnDate[1]);
    const d = Number(cnDate[2]);
    // 比今天早超半年的，按明年算
    const guess = validDate(ty, m, d);
    const iso = guess && guess < addDaysISO(today, -180) ? validDate(ty + 1, m, d) : guess;
    if (iso) return { date: iso, matched: cnDate[0] };
  }

  // 5) 11-20 / 11/20 / 11.20
  const numDate = /(\d{1,2})\s*[-/.]\s*(\d{1,2})(?!\d)/.exec(text);
  if (numDate) {
    const iso = validDate(ty, Number(numDate[1]), Number(numDate[2]));
    if (iso) return { date: iso, matched: numDate[0] };
  }

  // 6) N号（本月；已过则下月）
  const dayOnly = /(?:^|\s)(\d{1,2})\s*号(?!\s*[线楼])/.exec(text);
  if (dayOnly) {
    const d = Number(dayOnly[1]);
    const thisMonth = validDate(ty, tm, d);
    if (thisMonth) {
      const iso = thisMonth < today ? validDate(ty, tm + 1, d) ?? thisMonth : thisMonth;
      return { date: iso, matched: dayOnly[0].trim() };
    }
  }

  return null;
}

/** 解析工时：3h / 3.5h / 3小时 / 半小时 / 一个半小时 */
export function parseHours(text: string): { hours: number; matched: string } | null {
  const half = /(半|一个半|1\.5)\s*(?:个)?\s*小时/.exec(text);
  if (half) return { hours: half[1] === '半' ? 0.5 : 1.5, matched: half[0] };

  const m = /(\d+(?:\.\d+)?)\s*(?:个)?\s*(?:小时|h|H)/.exec(text);
  if (m) {
    const v = Number(m[1]);
    if (v > 0 && v <= 24) return { hours: Math.round(v * 10) / 10, matched: m[0] };
  }
  return null;
}

const PRIORITY_MAP: Array<[RegExp, Priority]> = [
  [/!\s*(高|急|重要|high|h)/i, 'high'],
  [/!\s*(中|mid|m)/i, 'mid'],
  [/!\s*(低|low|l)/i, 'low'],
];

/** 主解析入口 */
export function parseCapture(raw: string, today = todayISO()): CaptureResult {
  let text = ` ${raw} `;
  const tags: string[] = [];
  let priority: Priority | null = null;
  let project: string | null = null;
  let date: string | null = null;
  let hours: number | null = null;

  // #标签（支持中文、字母数字、连字符）
  text = text.replace(/#([\p{L}\p{N}_-]{1,16})/gu, (_, tag: string) => {
    if (!tags.includes(tag)) tags.push(tag);
    return ' ';
  });

  // @项目
  text = text.replace(/@([\p{L}\p{N}_-]{1,24})/gu, (_, name: string) => {
    if (!project) project = name;
    return ' ';
  });

  // !优先级
  for (const [re, p] of PRIORITY_MAP) {
    const m = re.exec(text);
    if (m) {
      priority = p;
      text = text.replace(m[0], ' ');
      break;
    }
  }

  // 日期（先解析日期再解析工时，避免 "3天后 3h" 互相干扰）
  const d = parseDatePhrase(text, today);
  if (d) {
    date = d.date;
    const idx = text.indexOf(d.matched);
    if (idx >= 0) text = text.slice(0, idx) + ' ' + text.slice(idx + d.matched.length);
  }

  const h = parseHours(text);
  if (h) {
    hours = h.hours;
    const idx = text.indexOf(h.matched);
    if (idx >= 0) text = text.slice(0, idx) + ' ' + text.slice(idx + h.matched.length);
  }

  const title = text.replace(/\s+/g, ' ').trim();
  return { title, tags, priority, date, hours, project };
}
