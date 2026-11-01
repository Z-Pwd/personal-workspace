/** 全局搜索（纯逻辑，UI 在 App.vue） */
import { store } from './store';
import { flatten } from './tree';

export type HitKind = 'project' | 'task' | 'todo' | 'idea';

export interface SearchHit {
  kind: HitKind;
  id: string;
  title: string;
  meta: string;
}

export function searchAll(raw: string, limit = 24): SearchHit[] {
  const q = raw.trim().toLowerCase();
  if (!q) return [];
  const out: SearchHit[] = [];

  for (const hit of flatten(store.projects)) {
    const n = hit.node;
    if (n.archived) continue;
    const hay = `${n.title} ${n.note} ${n.tags.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) continue;
    out.push({
      kind: hit.depth === 0 ? 'project' : 'task',
      id: n.id,
      title: n.title,
      meta: hit.depth === 0 ? '项目' : `任务 · ${hit.root.title}`,
    });
  }

  for (const t of store.todos) {
    const hay = `${t.title} ${t.note} ${t.tags.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) continue;
    out.push({ kind: 'todo', id: t.id, title: t.title, meta: `待办 · ${t.date}${t.done ? '（已完成）' : ''}` });
  }

  for (const i of store.ideas) {
    const hay = `${i.content} ${i.tags.join(' ')}`.toLowerCase();
    if (!hay.includes(q)) continue;
    out.push({ kind: 'idea', id: i.id, title: i.content.split('\n')[0].slice(0, 60), meta: '灵感' });
  }

  return out.slice(0, limit);
}
