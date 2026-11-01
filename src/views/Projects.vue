<script setup lang="ts">
import { computed, nextTick, provide, reactive, ref, watch } from 'vue';
import { AddIcon, RefreshIcon } from 'tdesign-icons-vue-next';
import ProjectNode from '../components/ProjectNode.vue';
import TaskDialog from '../components/TaskDialog.vue';
import type { ProjectCtx } from '../components/project-ctx';
import { store } from '../core/store';
import { findNode, flatten, moveWithin, removeFrom } from '../core/tree';
import { addTaskToToday } from '../core/actions';
import { setTaskStatus } from '../core/task-ops';
import { PRIORITY_LABEL, STATUS_LABEL, type Priority, type Status, type Task } from '../core/types';
import { nowISO } from '../core/util';
import { confirmAction, toast } from '../core/toast';
import { clearFocus, focusTarget } from '../core/focus';

const COLLAPSE_KEY = 'wb.collapsed';

const query = ref('');
const statusFilter = ref<'all' | Status>('all');
const priorityFilter = ref<'all' | Priority>('all');
const showArchived = ref(false);
const showRecycle = ref(false);
const selected = reactive(new Set<string>());
const collapsed = reactive(new Set<string>(JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]')));

const statusOptions = [
  { label: '待开始', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
  { label: '已搁置', value: 'shelved' },
];
const statusFilterOptions = [{ label: '全部状态', value: 'all' }, ...statusOptions];
const priorityOptions = [
  { label: '高', value: 'high' },
  { label: '中', value: 'mid' },
  { label: '低', value: 'low' },
];
const priorityFilterOptions = [{ label: '全部优先级', value: 'all' }, ...priorityOptions];

const dialog = reactive({
  visible: false,
  task: null as Task | null,
  parent: null as Task | null,
  header: '新建项目',
});

function persistCollapsed(): void {
  localStorage.setItem(COLLAPSE_KEY, JSON.stringify([...collapsed]));
}

function matches(node: Task): boolean {
  if (!showArchived.value && node.archived) return false;
  if (statusFilter.value !== 'all' && node.status !== statusFilter.value) return false;
  if (priorityFilter.value !== 'all' && node.priority !== priorityFilter.value) return false;
  const q = query.value.trim().toLowerCase();
  if (!q) return true;
  return (
    node.title.toLowerCase().includes(q) ||
    node.note.toLowerCase().includes(q) ||
    node.tags.some((t) => t.toLowerCase().includes(q))
  );
}

const visibleIds = computed(() => {
  const ids = new Set<string>();
  const mark = (node: Task, parentMatched: boolean): boolean => {
    const self = matches(node);
    let childMatched = false;
    for (const child of node.children) {
      if (child.deletedAt) continue;
      if (mark(child, parentMatched || self)) childMatched = true;
    }
    const show = parentMatched || self || childMatched;
    if (show) ids.add(node.id);
    return show;
  };
  for (const p of store.projects) {
    if (p.deletedAt) continue;
    mark(p, false);
  }
  return ids;
});

const roots = computed(() => store.projects.filter((p) => !p.deletedAt && visibleIds.value.has(p.id)));
const totalProjects = computed(() => store.projects.filter((p) => !p.deletedAt).length);

const recycleItems = computed(() =>
  flatten(store.projects, true).filter((hit) => hit.node.deletedAt && (!hit.parent || !hit.parent.deletedAt)),
);

function onSaved(task: Task): void {
  // 新建的内容如果被当前筛选条件挡住，用户会以为没创建成功 —— 自动清空筛选
  if (!dialog.task && (query.value || statusFilter.value !== 'all' || priorityFilter.value !== 'all')) {
    query.value = '';
    statusFilter.value = 'all';
    priorityFilter.value = 'all';
    toast('已清空筛选，方便看到刚创建的内容', 'info');
  }
  if (task.archived && !showArchived.value) showArchived.value = true;
}

function openCreate(parent: Task | null): void {
  dialog.task = null;
  dialog.parent = parent;
  dialog.header = parent ? '新建子任务' : '新建项目';
  dialog.visible = true;
}

function openEdit(node: Task): void {
  dialog.task = node;
  dialog.parent = null;
  dialog.header = '编辑';
  dialog.visible = true;
}

const ctx: ProjectCtx = {
  visible: visibleIds,
  selected,
  collapsed,
  toggleCollapse: (id) => {
    if (collapsed.has(id)) collapsed.delete(id);
    else collapsed.add(id);
    persistCollapsed();
  },
  toggleSelect: (id, on) => {
    if (on) selected.add(id);
    else selected.delete(id);
  },
  edit: openEdit,
  addChild: (node) => openCreate(node),
  removeNode: async (node) => {
    if (!(await confirmAction(`把「${node.title}」移入回收站？可以从回收站恢复。`))) return;
    node.deletedAt = nowISO();
    node.updatedAt = nowISO();
    store.touch('projects');
    toast('已移入回收站');
  },
  addToToday: (node) => addTaskToToday(node, findNode(store.projects, node.id)?.root.id ?? null),
  move: (id, dir) => {
    const hit = findNode(store.projects, id);
    if (hit && moveWithin(hit.siblings, id, dir)) store.touch('projects');
  },
  toggleArchive: (node) => {
    node.archived = !node.archived;
    node.updatedAt = nowISO();
    store.touch('projects');
    toast(node.archived ? '已归档' : '已取消归档', 'info');
  },
};
provide('projectCtx', ctx);

async function batchStatus(value: string | number): Promise<void> {
  const status = value as Status;
  for (const id of selected) {
    const hit = findNode(store.projects, id);
    if (!hit) continue;
    setTaskStatus(hit.node, status);
  }
  store.touch('projects');
  toast(`已把 ${selected.size} 项改为「${STATUS_LABEL[status]}」`);
  selected.clear();
}

async function batchPriority(value: string | number): Promise<void> {
  const priority = value as Priority;
  for (const id of selected) {
    const hit = findNode(store.projects, id);
    if (!hit) continue;
    hit.node.priority = priority;
    hit.node.updatedAt = nowISO();
  }
  store.touch('projects');
  toast(`已调整 ${selected.size} 项优先级`);
  selected.clear();
}

async function batchDelete(): Promise<void> {
  if (!(await confirmAction(`把选中的 ${selected.size} 项移入回收站？`))) return;
  for (const id of selected) {
    const hit = findNode(store.projects, id);
    if (!hit) continue;
    hit.node.deletedAt = nowISO();
    hit.node.updatedAt = nowISO();
  }
  selected.clear();
  store.touch('projects');
  toast('已移入回收站');
}

async function restore(id: string): Promise<void> {
  const hit = findNode(store.projects, id);
  if (!hit) return;
  hit.node.deletedAt = null;
  hit.node.updatedAt = nowISO();
  store.touch('projects');
  toast('已恢复');
}

async function purge(id: string, title: string): Promise<void> {
  if (!(await confirmAction(`彻底删除「${title}」及其所有子任务？无法恢复。`))) return;
  const hit = findNode(store.projects, id);
  if (!hit) return;
  removeFrom(hit.siblings, id);
  store.touch('projects');
  toast('已彻底删除');
}

async function purgeAll(): Promise<void> {
  if (!(await confirmAction('清空回收站？所有内容将无法恢复。'))) return;
  for (const hit of [...recycleItems.value]) removeFrom(hit.siblings, hit.node.id);
  store.touch('projects');
  toast('回收站已清空');
}

watch(
  () => [focusTarget.kind, focusTarget.id],
  () => {
    if (focusTarget.kind !== 'task' || !focusTarget.id) return;
    const id = focusTarget.id;
    query.value = '';
    statusFilter.value = 'all';
    priorityFilter.value = 'all';
    showArchived.value = true;
    showRecycle.value = false;
    const hit = findNode(store.projects, id);
    if (!hit) {
      clearFocus();
      return;
    }
    let parent = hit.parent;
    while (parent) {
      collapsed.delete(parent.id);
      const up = findNode(store.projects, parent.id);
      parent = up ? up.parent : null;
    }
    collapsed.delete(id);
    persistCollapsed();
    void nextTick(() => {
      const el = document.querySelector<HTMLElement>(`[data-node-id="${id}"] .node-row`);
      if (!el) return;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('flash');
      window.setTimeout(() => el.classList.remove('flash'), 1600);
      clearFocus();
    });
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <div class="toolbar">
      <t-button theme="primary" @click="openCreate(null)">
        <template #icon><AddIcon /></template>
        新建项目
      </t-button>
      <t-input v-model="query" placeholder="搜索标题 / 备注 / 标签" clearable style="width: 220px" />
      <t-select v-model="statusFilter" :options="statusFilterOptions" style="width: 130px" data-test="filter-status" />
      <t-select v-model="priorityFilter" :options="priorityFilterOptions" style="width: 140px" data-test="filter-priority" />
      <t-checkbox v-model="showArchived">含归档</t-checkbox>
      <span class="grow" />
      <t-button :theme="showRecycle ? 'primary' : 'default'" :variant="showRecycle ? 'base' : 'outline'" @click="showRecycle = !showRecycle">
        <template #icon><RefreshIcon /></template>
        回收站{{ recycleItems.length ? ` (${recycleItems.length})` : '' }}
      </t-button>
    </div>

    <div v-if="selected.size" class="toolbar batch-bar">
      <t-tag theme="primary" variant="light">已选 {{ selected.size }} 项</t-tag>
      <t-select placeholder="批量改状态…" :options="statusOptions" style="width: 150px" @change="batchStatus" />
      <t-select placeholder="批量改优先级…" :options="priorityOptions" style="width: 160px" @change="batchPriority" />
      <t-button theme="danger" variant="outline" size="small" @click="batchDelete">删除</t-button>
      <t-button variant="text" size="small" @click="selected.clear()">取消选择</t-button>
    </div>

    <template v-if="showRecycle">
      <t-card :bordered="false" title="回收站">
        <template #actions>
          <t-button v-if="recycleItems.length" theme="danger" variant="outline" size="small" @click="purgeAll">
            清空回收站
          </t-button>
        </template>
        <div v-if="!recycleItems.length" class="empty-hint">回收站是空的</div>
        <div v-for="hit in recycleItems" :key="hit.node.id" class="recycle-row">
          <div class="grow">
            <div class="recycle-title">{{ hit.node.title }}</div>
            <div class="muted">
              {{ hit.root.title }} · 删除于 {{ hit.node.deletedAt?.slice(0, 16).replace('T', ' ') }}
            </div>
          </div>
          <t-button size="small" variant="outline" @click="restore(hit.node.id)">恢复</t-button>
          <t-button size="small" theme="danger" variant="text" @click="purge(hit.node.id, hit.node.title)">彻底删除</t-button>
        </div>
      </t-card>
    </template>

    <t-card v-else :bordered="false" title="项目列表">
      <template #actions>
        <span class="muted">{{ totalProjects }} 个项目</span>
      </template>
      <div v-if="roots.length" class="tree">
        <ProjectNode v-for="p in roots" :key="p.id" :node="p" :depth="0" />
      </div>
      <div v-else class="empty-hint">
        <span class="big">🗂️</span>
        <template v-if="query || statusFilter !== 'all' || priorityFilter !== 'all'">
          没有符合条件的项目，换个筛选条件试试
        </template>
        <template v-else>
          还没有项目。点左上角「新建项目」，把一件大事拆成能动手的小任务。
        </template>
      </div>
    </t-card>

    <TaskDialog
      v-model:visible="dialog.visible"
      :task="dialog.task"
      :parent="dialog.parent"
      :header="dialog.header"
      @saved="onSaved"
    />
  </div>
</template>

<style scoped>
.batch-bar {
  background: var(--td-brand-color-light);
  padding: 8px 12px;
  border-radius: var(--td-radius-default);
}
.tree {
  display: flex;
  flex-direction: column;
}
.recycle-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 6px;
  border-bottom: 1px dashed var(--td-component-stroke);
}
.recycle-row:last-child {
  border-bottom: 0;
}
.recycle-title {
  font-size: 13px;
  font-weight: 500;
}
.grow {
  flex: 1;
  min-width: 0;
}
</style>
