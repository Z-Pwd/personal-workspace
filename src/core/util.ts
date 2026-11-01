/** 纯工具函数 */

export function uid(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

const pad = (n: number): string => (n < 10 ? `0${n}` : String(n));

export function toISODate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, (m || 1) - 1, d || 1);
}

export function addDaysISO(iso: string, days: number): string {
  const dt = parseISODate(iso);
  dt.setDate(dt.getDate() + days);
  return toISODate(dt);
}

/** iso 与 from 相差的天数（正数=将来） */
export function daysDiff(iso: string, from: string = todayISO()): number {
  const a = parseISODate(iso).getTime();
  const b = parseISODate(from).getTime();
  return Math.round((a - b) / 86400000);
}

export function weekStart(iso: string = todayISO()): string {
  const dt = parseISODate(iso);
  const wd = (dt.getDay() + 6) % 7; // 周一=0
  dt.setDate(dt.getDate() - wd);
  return toISODate(dt);
}

export function weekEnd(iso: string = todayISO()): string {
  return addDaysISO(weekStart(iso), 6);
}

export function monthStart(iso: string = todayISO()): string {
  return `${iso.slice(0, 7)}-01`;
}

export function monthEnd(iso: string = todayISO()): string {
  const [y, m] = iso.split('-').map(Number);
  return toISODate(new Date(y, m, 0));
}

export function isOverdue(due: string | null, done = false): boolean {
  if (!due || done) return false;
  return daysDiff(due) < 0;
}

/** 截止日期的人类可读标签 */
export function dueLabel(due: string | null, done = false): string {
  if (!due) return '';
  if (done) return `${due.slice(5)} 截止`;
  const d = daysDiff(due);
  if (d === 0) return '今天截止';
  if (d === 1) return '明天截止';
  if (d === -1) return '逾期 1 天';
  if (d < -1) return `逾期 ${-d} 天`;
  if (d <= 7) return `${d} 天后截止`;
  return due.slice(5) + ' 截止';
}

export function dueClass(due: string | null, done = false): string {
  if (!due || done) return '';
  const d = daysDiff(due);
  if (d < 0) return 'overdue';
  if (d <= 3) return 'due-soon';
  return '';
}

export function toNumberOrNull(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function fmtHours(v: number | null | undefined): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '—';
  return Number.isInteger(v) ? `${v}h` : `${v.toFixed(1)}h`;
}

export function sum<T>(arr: T[], pick: (x: T) => number): number {
  return arr.reduce((acc, x) => acc + pick(x), 0);
}

export function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

export function parseTags(raw: string): string[] {
  return raw
    .split(/[,，\s]+/)
    .map((s) => s.trim().replace(/^#/, ''))
    .filter(Boolean)
    .filter((v, i, a) => a.indexOf(v) === i)
    .slice(0, 12);
}

export function tagsToText(tags: string[]): string {
  return tags.join(' ');
}

export function debounce<A extends unknown[]>(fn: (...args: A) => void, ms: number): (...args: A) => void {
  let timer: number | undefined;
  return (...args: A) => {
    if (timer !== undefined) window.clearTimeout(timer);
    timer = window.setTimeout(() => fn(...args), ms);
  };
}

export function download(filename: string, content: string, mime = 'application/json'): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function timeAgo(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min} 分钟前`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return new Date(iso).toLocaleDateString('zh-CN');
}

export function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return `${toISODate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function dateLabelCN(iso: string): string {
  const dt = parseISODate(iso);
  const week = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'][dt.getDay()];
  const d = daysDiff(iso);
  const rel = d === 0 ? '今天' : d === 1 ? '明天' : d === -1 ? '昨天' : '';
  return `${iso.slice(5)} ${week}${rel ? ` · ${rel}` : ''}`;
}

export function downloadJSON(filename: string, data: unknown): void {
  download(filename, JSON.stringify(data, null, 2), 'application/json');
}
