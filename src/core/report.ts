/** 周报 / 月报：周期计算、数据汇总、Markdown / 纯文本导出 */
import { store } from './store';
import { doneDateOf, hoursInRange } from './task-ops';
import { flatten, progressOf } from './tree';
import {
  PRIORITY_LABEL,
  PRIORITY_ORDER,
  QUADRANT_LABEL,
  QUADRANT_ORDER,
  STATUS_LABEL,
  type Priority,
  type Quadrant,
  type Report,
  type ReportKind,
  type ReportMetrics,
  type ReportProjectLine,
  type ReportSnapshot,
  type ReportTaskLine,
  type ReportTodoLine,
} from './types';
import {
  addDaysISO,
  daysDiff,
  monthEnd,
  monthStart,
  nowISO,
  sum,
  todayISO,
  uid,
  weekEnd,
  weekStart,
} from './util';

/** 周期起止：周报=周一到周日，月报=自然月 */
export function periodOf(kind: ReportKind, anchor: string = todayISO()): { start: string; end: string } {
  if (kind === 'week') return { start: weekStart(anchor), end: weekEnd(anchor) };
  return { start: monthStart(anchor), end: monthEnd(anchor) };
}

export function periodLength(start: string, end: string): number {
  return Math.max(1, daysDiff(end, start) + 1);
}

/** 紧邻的上一周期（等长） */
export function prevPeriod(start: string, end: string): { start: string; end: string } {
  const len = periodLength(start, end);
  const prevEnd = addDaysISO(start, -1);
  return { start: addDaysISO(prevEnd, -(len - 1)), end: prevEnd };
}

function metricsOf(start: string, end: string): Omit<ReportMetrics, 'prevTodoDone' | 'prevTodoRate' | 'prevHoursAct'> {
  const inR = (d: string): boolean => d >= start && d <= end;
  const todos = store.todos.filter((t) => inR(t.date));
  const doneTodos = todos.filter((t) => t.done);

  const quadrants: Record<Quadrant, number> = { q1: 0, q2: 0, q3: 0, q4: 0 };
  const quadrantsDone: Record<Quadrant, number> = { q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const t of todos) {
    quadrants[t.quadrant] += 1;
    if (t.done) quadrantsDone[t.quadrant] += 1;
  }

  const hits = flatten(store.projects);
  const doneTasks = hits.filter((h) => h.node.status === 'done' && inR(doneDateOf(h.node)));

  return {
    todoTotal: todos.length,
    todoDone: doneTodos.length,
    todoRate: todos.length ? Math.round((doneTodos.length / todos.length) * 100) : 0,
    todoUndone: todos.length - doneTodos.length,
    todoQuadrants: quadrants,
    todoQuadrantDone: quadrantsDone,
    taskDone: doneTasks.length,
    taskOpen: hits.filter((h) => h.node.status !== 'done').length,
    hoursEst: sum(doneTasks, (h) => h.node.estHours ?? 0),
    // 工时按「流水日期」落在周期内，而不是按任务完成日一次性计入
    hoursAct: sum(hits, (h) => hoursInRange(h.node, start, end)),
    ideaNew: store.ideas.filter((i) => inR(i.createdAt.slice(0, 10))).length,
    ideaAdopted: store.ideas.filter((i) => i.convertedTo && inR(i.updatedAt.slice(0, 10))).length,
  };
}

/** 生成一份汇报（快照冻结当前统计） */
export function buildReport(kind: ReportKind, start: string, end: string): Report {
  const base = metricsOf(start, end);
  const prev = prevPeriod(start, end);
  const prevM = metricsOf(prev.start, prev.end);
  const inR = (d: string): boolean => d >= start && d <= end;

  const hits = flatten(store.projects);
  const doneHits = hits.filter((h) => h.node.status === 'done' && inR(doneDateOf(h.node)));

  const projects: ReportProjectLine[] = store.projects
    .filter((p) => !p.deletedAt && !p.archived)
    .map((p) => {
      const descendants = flatten([p]);
      const done = descendants.filter((h) => h.node.status === 'done' && inR(doneDateOf(h.node)));
      return {
        id: p.id,
        title: p.title,
        progress: progressOf(p),
        doneInPeriod: done.length,
        hoursAct: Math.round(sum(descendants, (h) => hoursInRange(h.node, start, end)) * 10) / 10,
        due: p.due,
        status: p.status,
      };
    })
    .filter((p) => p.doneInPeriod > 0 || p.hoursAct > 0 || p.status === 'doing')
    .sort((a, b) => b.hoursAct - a.hoursAct || b.doneInPeriod - a.doneInPeriod);

  const periodTodos = store.todos.filter((t) => inR(t.date));
  const undoneTodos: ReportTodoLine[] = periodTodos
    .filter((t) => !t.done)
    .sort(
      (a, b) =>
        QUADRANT_ORDER.indexOf(a.quadrant) - QUADRANT_ORDER.indexOf(b.quadrant) ||
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority],
    )
    .map((t) => ({
      id: t.id,
      title: t.title,
      quadrant: t.quadrant,
      priority: t.priority,
      dueTime: t.dueTime,
      note: t.note,
      date: t.date,
    }));

  const len = periodLength(start, end);
  const nextEnd = addDaysISO(addDaysISO(end, 1), len - 1);
  const undoneTasks: ReportTaskLine[] = hits
    .filter((h) => h.node.status !== 'done' && !h.node.archived && h.node.due && h.node.due <= nextEnd)
    .sort((a, b) => (a.node.due ?? '').localeCompare(b.node.due ?? ''))
    .slice(0, 20)
    .map((h) => ({
      id: h.node.id,
      title: h.node.title,
      project: h.root.title,
      due: h.node.due,
      priority: h.node.priority,
    }));

  const ideas = store.ideas
    .filter((i) => inR(i.createdAt.slice(0, 10)) || (i.convertedTo && inR(i.updatedAt.slice(0, 10))))
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 12)
    .map((i) => ({
      id: i.id,
      content: i.content,
      convertedTo: i.convertedTo ? `${i.convertedTo.type === 'todo' ? '待办' : '任务'}：${i.convertedTo.title}` : null,
      createdAt: i.createdAt,
    }));

  const highlights = doneHits
    .map((h) => ({
      id: h.node.id,
      title: h.node.title,
      project: h.root.title,
      hours: hoursInRange(h.node, start, end),
    }))
    .sort((a, b) => b.hours - a.hours)
    .slice(0, 5);

  const dailyHours: { date: string; hours: number }[] = [];
  for (let i = 0; i < periodLength(start, end); i++) {
    const day = addDaysISO(start, i);
    const hours = sum(hits, (h) => hoursInRange(h.node, day, day));
    dailyHours.push({ date: day, hours: Math.round(hours * 10) / 10 });
  }

  const snapshot: ReportSnapshot = {
    metrics: {
      ...base,
      prevTodoDone: prevM.todoDone,
      prevTodoRate: prevM.todoRate,
      prevHoursAct: prevM.hoursAct,
    },
    projects,
    undoneTodos,
    doneTodos: periodTodos.filter((t) => t.done).map((t) => ({ id: t.id, title: t.title })),
    undoneTasks,
    ideas,
    highlights,
    dailyHours,
  };

  return {
    id: uid(),
    kind,
    start,
    end,
    title: `${start} ~ ${end} ${kind === 'week' ? '周报' : '月报'}`,
    status: 'draft',
    snapshot,
    manual: { summary: '', highlights: '', risks: '', nextPlan: '' },
    generatedAt: nowISO(),
    updatedAt: nowISO(),
  };
}

/** 重新生成：只刷新自动统计，手写内容与状态保留 */
export function refreshSnapshot(report: Report): void {
  const fresh = buildReport(report.kind, report.start, report.end);
  report.snapshot = fresh.snapshot;
  report.title = fresh.title;
  report.generatedAt = nowISO();
  report.updatedAt = nowISO();
}

export function kindLabel(kind: ReportKind): string {
  return kind === 'week' ? '周报' : '月报';
}

export function statusLabel(status: Report['status']): string {
  return status === 'final' ? '已定稿' : '草稿';
}

/* ---------------- 导出 ---------------- */
function projectLine(p: ReportProjectLine): string {
  const parts = [`进度 ${p.progress}%`];
  if (p.doneInPeriod) parts.push(`本期完成 ${p.doneInPeriod} 个任务`);
  if (p.hoursAct) parts.push(`投入 ${round1(p.hoursAct)}h`);
  if (p.due) parts.push(`截止 ${p.due}`);
  return `${p.title}：${parts.join('，')}`;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

function deltaText(now: number, prev: number, unit = ''): string {
  if (!prev) return now ? `（上期无数据）` : '（无变化）';
  const d = now - prev;
  const sign = d > 0 ? '+' : d < 0 ? '−' : '±';
  return `（较上期 ${sign}${round1(Math.abs(d))}${unit}）`;
}

export function toMarkdown(r: Report): string {
  const m = r.snapshot.metrics;
  const L: string[] = [];
  L.push(`# ${r.start} ~ ${r.end} ${kindLabel(r.kind)}`, '');

  L.push('## 一、本期工作概览', '');
  L.push(`- 待办完成：${m.todoDone}/${m.todoTotal}（完成率 ${m.todoRate}%）`);
  L.push(`- 完成任务：${m.taskDone} 个；实际工时 ${round1(m.hoursAct)}h（预计 ${round1(m.hoursEst)}h）`);
  L.push(
    `- 与上期对比：完成待办 ${m.todoDone} 条${deltaText(m.todoDone, m.prevTodoDone, ' 条')}，工时 ${round1(m.hoursAct)}h${deltaText(m.hoursAct, m.prevHoursAct, 'h')}`,
  );
  L.push('');

  L.push('## 二、重点项目进展', '');
  if (r.snapshot.projects.length) {
    for (const p of r.snapshot.projects) L.push(`- ${projectLine(p)}`);
  } else {
    L.push('- 本期无进行中的项目');
  }
  L.push('');

  L.push('## 三、待办完成情况', '');
  L.push(
    `四象限分布：${QUADRANT_ORDER.map((q) => `${QUADRANT_LABEL[q]} ${m.todoQuadrants[q]} 条`).join('、')}`,
  );
  if (r.snapshot.undoneTodos.length) {
    L.push('', '未完成事项：');
    for (const t of r.snapshot.undoneTodos) {
      L.push(`- ${t.title}（${QUADRANT_LABEL[t.quadrant]}${t.dueTime ? `，计划 ${t.dueTime}` : ''}）`);
    }
  } else {
    L.push('', '本期待办全部完成。');
  }
  L.push('');

  L.push('## 四、灵感与沉淀', '');
  L.push(`本期新增灵感 ${m.ideaNew} 条，转成行动 ${m.ideaAdopted} 条`);
  for (const i of r.snapshot.ideas.slice(0, 6)) {
    const first = i.content.split('\n')[0];
    L.push(`- ${first}${i.convertedTo ? `（已转${i.convertedTo}）` : ''}`);
  }
  L.push('');

  L.push('## 五、下期计划', '');
  if (r.snapshot.undoneTodos.length) {
    L.push('顺延事项：');
    for (const t of r.snapshot.undoneTodos) L.push(`- [ ] ${t.title}`);
    L.push('');
  }
  L.push(r.manual.nextPlan.trim() || '（待补充）', '');

  L.push('## 六、本期总结', '');
  L.push(r.manual.summary.trim() || '（待补充）', '');
  if (r.manual.highlights.trim()) {
    L.push('亮点：', r.manual.highlights.trim(), '');
  }
  if (r.manual.risks.trim()) {
    L.push('风险与问题：', r.manual.risks.trim(), '');
  }

  L.push('---', `生成时间：${r.generatedAt.slice(0, 16).replace('T', ' ')} · 状态：${statusLabel(r.status)}`);
  return L.join('\n');
}

export function toPlainText(r: Report): string {
  return toMarkdown(r)
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*/g, '')
    .replace(/^---$/gm, '————————')
    .replace(/^- \[ \] /gm, '· ')
    .replace(/^- /gm, '· ');
}

/** 一段话摘要，方便直接粘到群里 */
export function summaryLine(r: Report): string {
  const m = r.snapshot.metrics;
  const kindCn = r.kind === 'week' ? '本周' : '本月';
  const diff = m.hoursAct - m.prevHoursAct;
  const diffTxt = m.prevHoursAct
    ? `（较上期${diff >= 0 ? '+' : ''}${round1(diff)}h）`
    : '';
  const proj = r.snapshot.projects
    .filter((p) => p.doneInPeriod > 0 || p.hoursAct > 0)
    .slice(0, 2)
    .map((p) => `${p.title} 进度 ${p.progress}%`)
    .join('、');
  const plan = r.manual.nextPlan.trim().split('\n')[0];
  return [
    `${kindCn}（${r.start.slice(5)}~${r.end.slice(5)}）完成待办 ${m.todoDone}/${m.todoTotal}（${m.todoRate}%），`,
    `完成任务 ${m.taskDone} 个、实际工时 ${round1(m.hoursAct)}h${diffTxt}。`,
    proj ? `重点：${proj}。` : '',
    plan ? `下期：${plan.slice(0, 50)}` : '',
  ].join('');
}

/** 供页面提示用：本期是否已有汇报 */
export function reportOfPeriod(start: string, end: string): Report | null {
  return store.reports.find((r) => r.start === start && r.end === end) ?? null;
}

export function sortReports(list: Report[]): Report[] {
  return [...list].sort((a, b) => {
    if (a.start === b.start) return a.updatedAt < b.updatedAt ? 1 : -1;
    return a.start < b.start ? 1 : -1;
  });
}

export { PRIORITY_LABEL, STATUS_LABEL };
