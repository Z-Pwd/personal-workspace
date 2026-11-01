import type { Ref } from 'vue';
import type { Task } from '../core/types';

export interface ProjectCtx {
  visible: Ref<Set<string>>;
  selected: Set<string>;
  collapsed: Set<string>;
  toggleCollapse: (id: string) => void;
  toggleSelect: (id: string, on: boolean) => void;
  edit: (node: Task) => void;
  addChild: (node: Task) => void;
  removeNode: (node: Task) => void;
  addToToday: (node: Task) => void;
  move: (id: string, dir: -1 | 1) => void;
  toggleArchive: (node: Task) => void;
}
