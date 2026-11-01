/** 任务的原子操作：状态切换、工时流水、旧数据迁移（集中一处，避免各处漏写） */
import type { Status, Task, TimeLog } from './types';
import { nowISO, todayISO, uid } from './util';

const round1 = (n: number): number => Math.round(n * 10) / 10;

/** 统一切换状态：进入 done 记完成时间，离开 done 清空 */
export function setTaskStatus(task: Task, status: Status, when = nowISO()): void {
  if (task.status !== status) {
    task.status = status;
    task.doneAt = status === 'done' ? when : null;
  } else if (status === 'done' && !task.doneAt) {
    task.doneAt = when;
  }
  task.updatedAt = when;
}

/** 该任务记录的完成日期（老数据没 doneAt 时回退到 updatedAt） */
export function doneDateOf(task: Task): string {
  return (task.doneAt ?? task.updatedAt ?? '').slice(0, 10);
}

/** 任务的工时合计：有流水按流水算，否则用手填值 */
export function totalHours(task: Task): number {
  if (task.timeLogs && task.timeLogs.length > 0) {
    return round1(task.timeLogs.reduce((acc, log) => acc + (Number(log.hours) || 0), 0));
  }
  return round1(task.actHours ?? 0);
}

/** 指定日期区间内的工时（按流水日期聚合；没有流水时把 手填工时 归到完成日） */
export function hoursInRange(task: Task, start: string, end: string): number {
  const inR = (d: string): boolean => d >= start && d <= end;
  if (task.timeLogs && task.timeLogs.length > 0) {
    return round1(task.timeLogs.filter((l) => inR(l.date)).reduce((acc, l) => acc + (Number(l.hours) || 0), 0));
  }
  const act = task.actHours ?? 0;
  if (!act) return 0;
  return inR(doneDateOf(task)) ? round1(act) : 0;
}

/** 某一天的工时 */
export function hoursOn(task: Task, date: string): number {
  return hoursInRange(task, date, date);
}

export function addTimeLog(task: Task, date: string, hours: number, note = ''): TimeLog {
  const log: TimeLog = { id: uid(), date: date || todayISO(), hours: round1(Number(hours) || 0), note };
  task.timeLogs.push(log);
  task.actHours = totalHours(task);
  task.updatedAt = nowISO();
  return log;
}

export function updateTimeLog(task: Task, id: string, patch: Partial<TimeLog>): void {
  const log = task.timeLogs.find((l) => l.id === id);
  if (!log) return;
  Object.assign(log, patch);
  log.hours = round1(Number(log.hours) || 0);
  task.actHours = totalHours(task);
  task.updatedAt = nowISO();
}

export function removeTimeLog(task: Task, id: string): void {
  const idx = task.timeLogs.findIndex((l) => l.id === id);
  if (idx < 0) return;
  task.timeLogs.splice(idx, 1);
  task.actHours = totalHours(task);
  task.updatedAt = nowISO();
}

export interface MigrateResult {
  changed: boolean;
  tasks: number;
  logs: number;
}

/**
 * 旧数据迁移（幂等）：
 * 1. 没有 doneAt 字段 → 按状态回填（完成的任务用 updatedAt 当完成时间）
 * 2. 没有 timeLogs 字段 → 补空数组；若原本有 actHours，生成一条流水（日期=完成日）
 */
export function migrateProjects(projects: Task[]): MigrateResult {
  let changed = false;
  let tasks = 0;
  let logs = 0;

  const walk = (nodes: Task[]): void => {
    for (const node of nodes) {
      tasks += 1;
      const raw = node as unknown as Record<string, unknown>;
      if (raw.doneAt === undefined) {
        node.doneAt = node.status === 'done' ? (node.updatedAt ?? null) : null;
        changed = true;
      }
      if (!Array.isArray(node.children)) {
        node.children = [];
        changed = true;
      }
      if (!Array.isArray(node.tags)) {
        node.tags = [];
        changed = true;
      }
      if (!Array.isArray(node.timeLogs)) {
        node.timeLogs = [];
        changed = true;
        const act = Number(node.actHours) || 0;
        if (act > 0) {
          node.timeLogs.push({
            id: uid(),
            date: doneDateOf(node) || todayISO(),
            hours: round1(act),
            note: '由旧数据自动生成',
          });
          logs += 1;
        }
      }
      if (node.children?.length) walk(node.children);
    }
  };

  walk(projects);
  return { changed, tasks, logs };
}
