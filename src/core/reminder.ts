/** 定时提醒：周五写周报 / 月末写月报（浏览器通知 + 页面内提示） */
const KEY = 'wb-reminder-prefs';

export interface ReminderPrefs {
  enabled: boolean;
  /** 0=周日 … 6=周六 */
  weekday: number;
  /** HH:mm */
  time: string;
  monthEnd: boolean;
}

const DEFAULT: ReminderPrefs = { enabled: false, weekday: 5, time: '17:00', monthEnd: true };

export function loadReminder(): ReminderPrefs {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULT };
    const parsed = JSON.parse(raw) as Partial<ReminderPrefs>;
    const weekday = Number(parsed.weekday);
    const time = typeof parsed.time === 'string' && /^\d{2}:\d{2}$/.test(parsed.time) ? parsed.time : DEFAULT.time;
    return {
      enabled: parsed.enabled === true,
      weekday: Number.isInteger(weekday) && weekday >= 0 && weekday <= 6 ? weekday : DEFAULT.weekday,
      time,
      monthEnd: parsed.monthEnd !== false,
    };
  } catch {
    return { ...DEFAULT };
  }
}

export function saveReminder(prefs: ReminderPrefs): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    /* 隐私模式下 localStorage 可能不可用，忽略 */
  }
}

export type ReminderKind = 'weekly' | 'monthly';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function todayKey(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function isLastDayOfMonth(d: Date): boolean {
  const next = new Date(d.getFullYear(), d.getMonth() + 1, 1);
  next.setDate(0);
  return next.getDate() === d.getDate();
}

/** 测试用：判断某个时刻是否该提醒 */
export function dueReminder(
  prefs: ReminderPrefs,
  now: Date,
  lastFired: { weekly?: string; monthly?: string } = {},
): ReminderKind | null {
  if (!prefs.enabled) return null;
  const hhmm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  if (hhmm !== prefs.time) return null;
  const key = todayKey(now);
  if (prefs.monthEnd && isLastDayOfMonth(now) && lastFired.monthly !== key) return 'monthly';
  if (now.getDay() === prefs.weekday && lastFired.weekly !== key) return 'weekly';
  return null;
}

/** 请求通知权限（用户点按钮时才调用） */
export async function askNotifyPermission(): Promise<string> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted') return 'granted';
  if (Notification.permission === 'denied') return 'denied';
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export function showNotification(title: string, body: string): void {
  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification(title, { body, tag: 'workbench-reminder' });
    }
  } catch {
    /* 通知失败不影响页面内提示 */
  }
}

/** 启动轮询：每 30 秒检查一次，命中就回调（同一时段只触发一次） */
export function startReminder(onFire: (kind: ReminderKind) => void): () => void {
  const fired: { weekly?: string; monthly?: string } = {};
  const tick = (): void => {
    const prefs = loadReminder();
    const kind = dueReminder(prefs, new Date(), fired);
    if (!kind) return;
    fired[kind === 'weekly' ? 'weekly' : 'monthly'] = todayKey();
    onFire(kind);
  };
  const timer = window.setInterval(tick, 30_000);
  window.setTimeout(tick, 3_000);
  return () => window.clearInterval(timer);
}
