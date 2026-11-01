/** 示例数据：第一次打开时可以先看看长什么样 */
import { newIdea, newTask, newTodo, nextOrder, store } from './store';
import { nowISO, todayISO, addDaysISO } from './util';

export function hasAnyData(): boolean {
  return store.projects.length > 0 || store.todos.length > 0 || store.ideas.length > 0;
}

export function loadDemoData(): void {
  const today = todayISO();
  const doneAt = (daysAgo: number): string => `${addDaysISO(today, -daysAgo)}T18:00:00.000Z`;

  const project = newTask({
    title: '固定资产盘点系统（示例项目）',
    note: '给公司做一套扫码盘点的工具，先跑通最小流程。',
    status: 'doing',
    priority: 'high',
    due: addDaysISO(today, 21),
    tags: ['项目', '产品'],
  });

  const phase1 = newTask({
    title: '需求与流程梳理',
    status: 'done',
    doneAt: doneAt(2),
    priority: 'high',
    due: addDaysISO(today, -2),
    tags: ['文档'],
    note: '和财务、行政各聊了 1 小时，把盘点流程画出来了。',
  });
  phase1.children.push(
    newTask({
      title: '访谈财务 / 行政',
      status: 'done',
      doneAt: doneAt(3),
      priority: 'high',
      tags: ['沟通'],
      estHours: 2,
      actHours: 2.5,
      timeLogs: [{ id: 'seed-log-1', date: addDaysISO(today, -3), hours: 2.5, note: '财务 1h + 行政 1.5h' }],
    }),
    newTask({
      title: '输出流程图 v1',
      status: 'done',
      doneAt: doneAt(1),
      priority: 'mid',
      tags: ['文档'],
      estHours: 4,
      actHours: 4.5,
      timeLogs: [{ id: 'seed-log-2', date: addDaysISO(today, -1), hours: 4.5, note: '' }],
    }),
  );

  const phase2 = newTask({
    title: '原型与开发',
    status: 'doing',
    priority: 'high',
    due: addDaysISO(today, 10),
    tags: ['开发'],
  });
  phase2.children.push(
    newTask({ title: '扫码页面原型', status: 'doing', priority: 'high', estHours: 6, actHours: 3, tags: ['开发'] }),
    newTask({ title: '数据表设计', status: 'todo', priority: 'mid', estHours: 4, tags: ['开发'] }),
    newTask({ title: '导出 Excel 报表', status: 'todo', priority: 'low', estHours: 8, tags: ['开发'] }),
  );

  project.children.push(phase1, phase2);

  const archiveDemo = newTask({
    title: '10 月部门例会纪要整理（示例）',
    status: 'done',
    doneAt: doneAt(6),
    priority: 'mid',
    tags: ['文档'],
    estHours: 1.5,
    actHours: 1.5,
    archived: true,
  });

  store.projects.push(project, archiveDemo);

  const todos = [
    newTodo(today, {
      title: '确认扫码枪型号与到货时间',
      note: '行政采购那边等我们给参数',
      priority: 'high',
      quadrant: 'q1',
      tags: ['沟通'],
      dueTime: '17:00',
      order: 1,
    }),
    newTodo(today, {
      title: '把原型给财务看一眼',
      priority: 'high',
      quadrant: 'q2',
      tags: ['沟通', '产品'],
      projectId: project.id,
      taskId: phase2.children[0].id,
      order: 1,
    }),
    newTodo(today, {
      title: '整理本周工作记录（周五汇报用）',
      priority: 'mid',
      quadrant: 'q2',
      tags: ['文档'],
      repeat: 'weekly',
      order: 2,
    }),
    newTodo(today, {
      title: '回一封不重要的邮件',
      priority: 'low',
      quadrant: 'q4',
      tags: [],
      order: 1,
    }),
    newTodo(addDaysISO(today, 1), {
      title: '数据表设计初稿',
      priority: 'mid',
      quadrant: 'q2',
      tags: ['开发'],
      order: 1,
    }),
  ];
  store.todos.push(...todos);

  store.ideas.push(
    newIdea({
      content: '盘点能不能直接用手机摄像头扫？省得买扫码枪。\n如果可行，成本能降一大截，但要在暗光仓库测试识别率。',
      tags: ['产品', '灵感'],
      favorite: true,
    }),
    newIdea({
      content: '每周五把本周完成的待办自动整理成一段汇报文字，直接粘贴到群里。',
      tags: ['效率'],
    }),
    newIdea({
      content: '给「她」加一个能力：每天问我今天最想完成的一件事，然后晚上再问有没有做到。',
      tags: ['生活'],
    }),
  );

  store.touch('projects');
  store.touch('todos');
  store.touch('ideas');
}

/** 手动造一条今天的测试待办（用于自检） */
export function addQuickTodo(title: string): void {
  store.todos.push(
    newTodo(todayISO(), {
      title,
      order: nextOrder(store.todos, todayISO(), 'q2'),
      updatedAt: nowISO(),
    }),
  );
  store.touch('todos');
}
