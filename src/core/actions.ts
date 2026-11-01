/** 跨页面的动作：把项目任务拉进今日待办、勾选待办、重复任务生成下一期 */
import { newTodo, nextOrder, store } from './store';
import { quadrantOf } from './tree';
import type { Task, Todo } from './types';
import { toast } from './toast';
import { addDaysISO, nowISO, todayISO } from './util';

/** 项目里的任务 → 今日待办（同一条任务同一天只加一次） */
export function addTaskToToday(node: Task, projectId: string | null): void {
  const date = todayISO();
  const exists = store.todos.some((t) => t.taskId === node.id && t.date === date && !t.done);
  if (exists) {
    toast('这条任务今天已经在待办里了', 'info');
    return;
  }
  const quadrant = quadrantOf(node.priority);
  const todo = newTodo(date, {
    title: node.title,
    note: node.note,
    priority: node.priority,
    quadrant,
    tags: [...node.tags],
    projectId,
    taskId: node.id,
    order: nextOrder(store.todos, date, quadrant),
  });
  store.todos.push(todo);
  store.touch('todos');
  toast('已加入今日待办');
}

/** 完成待办时，若它来自项目任务，顺手把任务状态同步过去 */
function syncLinkedTask(todo: Todo, done: boolean): void {
  if (!todo.taskId) return;
  let target: Task | null = null;
  const walk = (nodes: Task[]): void => {
    for (const n of nodes) {
      if (n.id === todo.taskId) target = n;
      else if (n.children.length) walk(n.children);
    }
  };
  walk(store.projects);
  const node = target as Task | null;
  if (!node) return;
  if (done && node.status !== 'done') {
    node.status = 'done';
    node.updatedAt = nowISO();
    store.touch('projects');
    toast('项目里这条任务也标记为已完成', 'info');
  } else if (!done && node.status === 'done') {
    node.status = 'doing';
    node.updatedAt = nowISO();
    store.touch('projects');
  }
}

/** 重复待办完成后，自动生成下一期 */
export function spawnNextRepeat(todo: Todo): void {
  if (!todo.done || todo.repeat === 'none') return;
  const step = todo.repeat === 'daily' ? 1 : 7;
  const nextDate = addDaysISO(todo.date, step);
  const already = store.todos.some((t) => t.repeatOf === todo.id && t.date === nextDate);
  if (already) return;
  const { id: _id, createdAt: _c, updatedAt: _u, done: _d, doneAt: _da, date: _date, ...rest } = todo;
  const copy = newTodo(nextDate, {
    ...rest,
    date: nextDate,
    order: nextOrder(store.todos, nextDate, todo.quadrant),
    repeatOf: todo.id,
  });
  store.todos.push(copy);
  toast(`已为 ${nextDate} 生成下一次重复待办`, 'info');
}

export function toggleTodo(todo: Todo, done: boolean): void {
  todo.done = done;
  todo.doneAt = done ? nowISO() : null;
  todo.updatedAt = nowISO();
  if (done) spawnNextRepeat(todo);
  syncLinkedTask(todo, done);
  store.touch('todos');
}
