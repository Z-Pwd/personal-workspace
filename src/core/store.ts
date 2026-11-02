/** 全局状态 + 自动保存（防抖、串行写入、版本冲突处理） */
import { reactive } from 'vue';
import { migrateProjects } from './task-ops';
import { api, type ApiError } from './api';
import { broadcastSaved, initSync } from './sync';
import type { Idea, Project, Report, ReportTemplate, Task, Todo } from './types';
import { toast } from './toast';
import { nowISO, todayISO, uid } from './util';

export type DocName = 'projects' | 'todos' | 'ideas' | 'reports' | 'templates';
export type SaveState = 'saved' | 'saving' | 'error';

const DOC_FILES: Record<DocName, string> = {
  projects: 'projects.json',
  todos: 'todos.json',
  ideas: 'ideas.json',
  reports: 'reports.json',
  templates: 'templates.json',
};

class Store {
  projects: Project[] = [];
  todos: Todo[] = [];
  ideas: Idea[] = [];
  reports: Report[] = [];
  templates: ReportTemplate[] = [];
  revs: Record<DocName, number> = { projects: 0, todos: 0, ideas: 0, reports: 0, templates: 0 };
  saveState: SaveState = 'saved';
  dataDir = '';
  ready = false;
  offline = false;
  lastError = '';

  private subs = new Set<() => void>();
  private badgeSubs = new Set<() => void>();
  private dirty = new Set<DocName>();
  private timer: number | undefined;
  private chain: Promise<void> = Promise.resolve();
  private conflictShown = false;
  private remoteTimer: number | undefined;
  private remoteHintShown = false;

  subscribe(fn: () => void): () => void {
    this.subs.add(fn);
    return () => {
      this.subs.delete(fn);
    };
  }

  notify(): void {
    for (const fn of this.subs) fn();
    this.notifyBadge();
  }

  /** 只刷新保存状态角标，不重建页面（避免打断输入） */
  onBadge(fn: () => void): () => void {
    this.badgeSubs.add(fn);
    return () => {
      this.badgeSubs.delete(fn);
    };
  }

  notifyBadge(): void {
    for (const fn of this.badgeSubs) fn();
  }

  async init(): Promise<void> {
    try {
      const cfg = await api.getConfig();
      this.dataDir = cfg.dataDir;
    } catch (err) {
      this.offline = true;
      this.lastError = (err as Error).message;
    }
    await this.reloadAll();
    this.ready = true;
    this.notify();
  }

  async reloadAll(): Promise<void> {
    const [p, t, i, r, tp] = await Promise.all([
      api.getDoc<Project>('projects').catch(() => null),
      api.getDoc<Todo>('todos').catch(() => null),
      api.getDoc<Idea>('ideas').catch(() => null),
      api.getDoc<Report>('reports').catch(() => null),
      api.getDoc<ReportTemplate>('templates').catch(() => null),
    ]);
    if (p) {
      this.projects = p.items;
      this.revs.projects = p.rev;
      // 旧数据结构升级（补 doneAt / timeLogs），幂等，有改动才写盘
      const migrated = migrateProjects(this.projects);
      if (migrated.changed) {
        this.dirty.add('projects');
        window.setTimeout(() => {
          void this.flush();
        }, 120);
      }
    }
    if (t) {
      this.todos = t.items;
      this.revs.todos = t.rev;
    }
    if (i) {
      this.ideas = i.items;
      this.revs.ideas = i.rev;
    }
    if (r) {
      this.reports = r.items;
      this.revs.reports = r.rev;
    }
    if (tp) {
      this.templates = tp.items;
      this.revs.templates = tp.rev;
    }
    if (p && t && i && r && tp) {
      this.offline = false;
      this.lastError = '';
    }
    this.notify();
  }

  itemsOf(name: DocName): unknown[] {
    if (name === 'projects') return this.projects;
    if (name === 'todos') return this.todos;
    if (name === 'ideas') return this.ideas;
    if (name === 'templates') return this.templates;
    return this.reports;
  }

  /** 数据改动后调用：立即刷新界面，400ms 后落盘 */
  touch(name: DocName): void {
    this.dirty.add(name);
    this.notify();
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      void this.flush();
    }, 400);
  }

  /** 只保存不重绘（用于文本框边打边存，避免焦点丢失） */
  quietTouch(name: DocName): void {
    this.dirty.add(name);
    this.notifyBadge();
    if (this.timer !== undefined) window.clearTimeout(this.timer);
    this.timer = window.setTimeout(() => {
      void this.flush(true);
    }, 500);
  }

  /** 立即写盘（离开页面前、手动保存时） */
  async flush(quiet = false): Promise<void> {
    if (this.timer !== undefined) {
      window.clearTimeout(this.timer);
      this.timer = undefined;
    }
    const names = [...this.dirty];
    this.dirty.clear();
    if (!names.length) return;
    for (const name of names) {
      const snapshot = JSON.parse(JSON.stringify(this.itemsOf(name))) as unknown[];
      this.saveState = 'saving';
      if (!quiet) this.notify();
      else this.notifyBadge();
      this.chain = this.chain.then(async () => {
        try {
          const doc = await api.putDoc(name, this.revs[name], snapshot);
          this.revs[name] = doc.rev;
          this.saveState = 'saved';
          this.lastError = '';
          // 通知其他标签页：数据变了（它们会自己决定是否重新载入）
          broadcastSaved({ [name]: doc.rev });
        } catch (err) {
          const e = err as ApiError;
          this.saveState = 'error';
          this.lastError = e.message;
          if (e.conflict) {
            if (!this.conflictShown) {
              this.conflictShown = true;
              toast('数据在别的页面被修改过，当前内容未写入', 'err', {
                label: '载入最新',
                onClick: () => {
                  this.conflictShown = false;
                  void this.reloadAll();
                },
              });
            }
          } else {
            toast(`保存失败：${e.message}`, 'err', {
              label: '重试',
              onClick: () => {
                this.touch(name);
              },
            });
          }
        } finally {
          if (!quiet) this.notify();
          else this.notifyBadge();
        }
      });
    }
    await this.chain;
  }

  async hasUnsaved(): Promise<boolean> {
    return this.dirty.size > 0;
  }

  /** 另一个标签页保存了数据：没未保存改动就静默重载，否则提示一次 */
  handleRemoteUpdate(): void {
    if (this.remoteTimer !== undefined) window.clearTimeout(this.remoteTimer);
    this.remoteTimer = window.setTimeout(() => {
      this.remoteTimer = undefined;
      if (this.dirty.size === 0) {
        void this.reloadAll();
        return;
      }
      if (this.remoteHintShown) return;
      this.remoteHintShown = true;
      toast('另一个标签页更新了数据', 'info', {
        label: '载入最新',
        onClick: () => {
          this.remoteHintShown = false;
          void this.reloadAll();
        },
      });
    }, 250);
  }

  get pendingCount(): number {
    return this.dirty.size;
  }
}

export const store = reactive(new Store()) as unknown as Store;

export function docFileName(name: DocName): string {
  return DOC_FILES[name];
}

/* ---------------- 数据工厂 ---------------- */
export function newTask(partial: Partial<Task> = {}): Task {
  const t = nowISO();
  return {
    id: uid(),
    title: '新任务',
    note: '',
    status: 'todo',
    priority: 'mid',
    due: null,
    tags: [],
    estHours: null,
    actHours: null,
    timeLogs: [],
    children: [],
    createdAt: t,
    updatedAt: t,
    doneAt: null,
    archived: false,
    deletedAt: null,
    ...partial,
  };
}

export function newTodo(date: string, partial: Partial<Todo> = {}): Todo {
  const t = nowISO();
  return {
    id: uid(),
    date,
    title: '新待办',
    note: '',
    priority: 'mid',
    quadrant: 'q2',
    tags: [],
    dueTime: null,
    remindAt: null,
    done: false,
    doneAt: null,
    pinned: false,
    order: 0,
    repeat: 'none',
    repeatOf: null,
    projectId: null,
    taskId: null,
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

export function newIdea(partial: Partial<Idea> = {}): Idea {
  const t = nowISO();
  return {
    id: uid(),
    content: '',
    tags: [],
    status: 'inbox',
    favorite: false,
    convertedTo: null,
    createdAt: t,
    updatedAt: t,
    ...partial,
  };
}

export function nextOrder(todos: Todo[], date: string, quadrant: Todo['quadrant']): number {
  const list = todos.filter((t) => t.date === date && t.quadrant === quadrant);
  return list.reduce((max, t) => Math.max(max, t.order), 0) + 1;
}

export function todayTodosOf(date: string = todayISO()): Todo[] {
  return store.todos.filter((t) => t.date === date);
}
