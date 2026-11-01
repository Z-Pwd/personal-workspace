/** 跨页面定位：搜索结果点开后让目标页面滚动并高亮那一条 */
import { reactive } from 'vue';

export type FocusKind = '' | 'task' | 'todo' | 'idea';

export const focusTarget = reactive<{ kind: FocusKind; id: string }>({ kind: '', id: '' });

export function requestFocus(kind: FocusKind, id: string): void {
  focusTarget.kind = kind;
  focusTarget.id = id;
}

export function clearFocus(): void {
  focusTarget.kind = '';
  focusTarget.id = '';
}
