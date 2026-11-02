/** 快速捕获：把解析结果落到「今日待办 / 灵感 / 项目任务」 */
import { newIdea, newTask, newTodo, nextOrder, store } from './store';
import type { CaptureResult } from './nlp';
import type { Task } from './types';
import { todayISO } from './util';

export type CaptureTarget = 'todo' | 'idea' | 'task';

export interface CaptureOutcome {
  target: CaptureTarget;
  /** 给用户看的落地位置说明 */
  where: string;
  /** 生成的内容标题 */
  title: string;
}

/** 按 @项目 找项目；找不到就新建一个（放到列表最前） */
function resolveProject(name: string | null): Task {
  const roots = store.projects.filter((p) => !p.deletedAt);
  if (name) {
    const hit = roots.find((p) => p.title.includes(name) || name.includes(p.title));
    if (hit) return hit;
    const created = newTask({ title: name, status: 'doing' });
    store.projects.unshift(created);
    return created;
  }
  const alive = roots.find((p) => p.status !== 'done');
  if (alive) return alive;
  const fallback = newTask({ title: '收集箱', status: 'doing' });
  store.projects.unshift(fallback);
  return fallback;
}

export function captureTodo(result: CaptureResult): CaptureOutcome {
  const date = result.date ?? todayISO();
  const todo = newTodo(date, {
    title: result.title || '未命名待办',
    priority: result.priority ?? 'mid',
    tags: [...result.tags],
    order: nextOrder(store.todos, date, 'q2'),
  });
  store.todos.unshift(todo);
  store.touch('todos');
  return { target: 'todo', where: date === todayISO() ? '今日待办' : `${date} 的待办`, title: todo.title };
}

export function captureIdea(result: CaptureResult): CaptureOutcome {
  const idea = newIdea({
    content: result.title || '(无内容)',
    tags: [...result.tags],
  });
  store.ideas.unshift(idea);
  store.touch('ideas');
  return { target: 'idea', where: '灵光一闪', title: idea.content };
}

export function captureTask(result: CaptureResult): CaptureOutcome {
  const project = resolveProject(result.project);
  const task = newTask({
    title: result.title || '未命名任务',
    priority: result.priority ?? 'mid',
    due: result.date,
    tags: [...result.tags],
    estHours: result.hours,
  });
  project.children.push(task);
  project.updatedAt = task.updatedAt;
  store.touch('projects');
  return { target: 'task', where: `项目「${project.title}」`, title: task.title };
}

export function runCapture(result: CaptureResult, target: CaptureTarget): CaptureOutcome {
  if (target === 'idea') return captureIdea(result);
  if (target === 'task') return captureTask(result);
  return captureTodo(result);
}
