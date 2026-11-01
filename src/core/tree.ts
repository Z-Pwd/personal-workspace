/** 项目树的通用计算：遍历、查找、进度汇总、工时合计 */
import type { Priority, Project, Quadrant, Task } from './types';

export interface NodeHit {
  node: Task;
  parent: Task | null;
  siblings: Task[];
  depth: number;
  /** 所属顶层项目 */
  root: Task;
}

/** 深度优先摊平（含回收站开关） */
export function flatten(projects: Project[], includeDeleted = false): NodeHit[] {
  const out: NodeHit[] = [];
  const walk = (nodes: Task[], parent: Task | null, depth: number, root: Task): void => {
    for (const node of nodes) {
      if (!includeDeleted && node.deletedAt) continue;
      out.push({ node, parent, siblings: nodes, depth, root });
      if (node.children.length) walk(node.children, node, depth + 1, root);
    }
  };
  for (const p of projects) {
    if (!includeDeleted && p.deletedAt) continue;
    out.push({ node: p, parent: null, siblings: projects, depth: 0, root: p });
    if (p.children.length) walk(p.children, p, 1, p);
  }
  return out;
}

export function findNode(projects: Project[], id: string): NodeHit | null {
  return flatten(projects, true).find((hit) => hit.node.id === id) ?? null;
}

/** 子任务完成比例；叶子节点按状态折算 */
export function progressOf(task: Task): number {
  const kids = task.children.filter((c) => !c.deletedAt);
  if (!kids.length) return task.status === 'done' ? 100 : 0;
  const total = kids.reduce((acc, c) => acc + progressOf(c), 0);
  return Math.round(total / kids.length);
}

/** 自身 + 所有子任务的工时合计 */
export function hoursOf(task: Task): { est: number; act: number } {
  const kids = task.children.filter((c) => !c.deletedAt);
  // 有子任务时只汇总子级，避免父级工时被重复计算
  if (!kids.length) return { est: task.estHours ?? 0, act: task.actHours ?? 0 };
  let est = 0;
  let act = 0;
  for (const c of kids) {
    const h = hoursOf(c);
    est += h.est;
    act += h.act;
  }
  return { est, act };
}

/** 叶子任务数量与完成数 */
export function leafStats(task: Task): { total: number; done: number } {
  const kids = task.children.filter((c) => !c.deletedAt);
  if (!kids.length) return { total: 1, done: task.status === 'done' ? 1 : 0 };
  return kids.reduce(
    (acc, c) => {
      const s = leafStats(c);
      return { total: acc.total + s.total, done: acc.done + s.done };
    },
    { total: 0, done: 0 },
  );
}

export function childCount(task: Task): number {
  return task.children.filter((c) => !c.deletedAt).length;
}

/** 从顶层项目到该节点的标题路径 */
export function pathOf(projects: Project[], id: string): string {
  const chain: string[] = [];
  const walk = (nodes: Task[], trail: string[]): boolean => {
    for (const node of nodes) {
      const next = [...trail, node.title];
      if (node.id === id) {
        chain.push(...next);
        return true;
      }
      if (walk(node.children, next)) return true;
    }
    return false;
  };
  walk(projects, []);
  return chain.join(' / ');
}

export function rootOf(projects: Project[], id: string): Project | null {
  const hit = findNode(projects, id);
  return hit ? hit.root : null;
}

/** 在兄弟数组中上移/下移 */
export function moveWithin(siblings: Task[], id: string, dir: -1 | 1): boolean {
  const i = siblings.findIndex((n) => n.id === id);
  if (i < 0) return false;
  const j = i + dir;
  if (j < 0 || j >= siblings.length) return false;
  const [item] = siblings.splice(i, 1);
  siblings.splice(j, 0, item);
  return true;
}

/** 优先级 → 四象限的默认映射（新建待办时用） */
export function quadrantOf(priority: Priority): Quadrant {
  if (priority === 'high') return 'q1';
  if (priority === 'mid') return 'q2';
  return 'q3';
}

/** 从树里移除（彻底删除） */
export function removeFrom(siblings: Task[], id: string): boolean {
  const i = siblings.findIndex((n) => n.id === id);
  if (i < 0) return false;
  siblings.splice(i, 1);
  return true;
}
