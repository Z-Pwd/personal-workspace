<script setup lang="ts">
import { computed, inject } from 'vue';
import { ChevronDownIcon, ChevronRightIcon, MoreIcon } from 'tdesign-icons-vue-next';
import { store } from '../core/store';
import { setTaskStatus } from '../core/task-ops';
import { hoursOf, progressOf } from '../core/tree';
import { PRIORITY_LABEL, type Status, type Task } from '../core/types';
import { dueClass, dueLabel, fmtHours } from '../core/util';
import type { ProjectCtx } from './project-ctx';

const props = defineProps<{ node: Task; depth: number }>();
const ctx = inject<ProjectCtx>('projectCtx')!;

const statusOptions = [
  { label: '待开始', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
  { label: '已搁置', value: 'shelved' },
];

const kids = computed(() => props.node.children.filter((c) => !c.deletedAt && ctx.visible.value.has(c.id)));
const collapsed = computed(() => ctx.collapsed.has(props.node.id));
const pct = computed(() => progressOf(props.node));
const hours = computed(() => hoursOf(props.node));
const hasHours = computed(() => (hours.value.est || hours.value.act) > 0);

const menuOptions = computed(() => [
  { content: '添加子任务', value: 'add' },
  { content: '编辑详情', value: 'edit' },
  { content: '加入今日待办', value: 'today' },
  { divider: true },
  { content: '上移', value: 'up' },
  { content: '下移', value: 'down' },
  { divider: true },
  { content: props.node.archived ? '取消归档' : '归档', value: 'archive' },
  { content: '删除（可在回收站恢复）', value: 'delete' },
]);

function onMenu(data: { value?: string }): void {
  const v = data?.value;
  if (v === 'add') ctx.addChild(props.node);
  else if (v === 'edit') ctx.edit(props.node);
  else if (v === 'today') ctx.addToToday(props.node);
  else if (v === 'up') ctx.move(props.node.id, -1);
  else if (v === 'down') ctx.move(props.node.id, 1);
  else if (v === 'archive') ctx.toggleArchive(props.node);
  else if (v === 'delete') ctx.removeNode(props.node);
}

function onStatus(value: unknown): void {
  setTaskStatus(props.node, value as Status);
  store.touch('projects');
}

const statusClass = computed(() => `status-${props.node.status}`);
</script>

<template>
  <div class="node" :data-node-id="node.id">
    <div
      class="node-row"
      :class="{ 'is-done': node.status === 'done', 'is-selected': ctx.selected.has(node.id) }"
    >
      <span class="twisty">
        <t-button
          v-if="kids.length"
          variant="text"
          shape="square"
          size="small"
          @click="ctx.toggleCollapse(node.id)"
        >
          <ChevronDownIcon v-if="!collapsed" />
          <ChevronRightIcon v-else />
        </t-button>
        <span v-else class="dot">·</span>
      </span>

      <t-checkbox
        :checked="ctx.selected.has(node.id)"
        @change="(v: boolean) => ctx.toggleSelect(node.id, v)"
      />

      <button type="button" class="node-title" :title="node.title" @click="ctx.edit(node)">
        {{ node.title }}
      </button>

      <span class="node-meta">
        <span :class="statusClass" class="status-pill">
          <t-select
            :value="node.status"
            :options="statusOptions"
            size="small"
            class="status-select"
            @change="onStatus"
          />
        </span>

        <t-tag v-if="node.priority !== 'mid'" :theme="node.priority === 'high' ? 'danger' : 'warning'" variant="light" size="small">
          {{ PRIORITY_LABEL[node.priority] }}
        </t-tag>
        <t-tag v-for="tag in node.tags.slice(0, 3)" :key="tag" variant="light" theme="primary" size="small">#{{ tag }}</t-tag>
        <t-tag
          v-if="node.due"
          :theme="dueClass(node.due, node.status === 'done') === 'overdue' ? 'danger' : dueClass(node.due, node.status === 'done') ? 'warning' : 'default'"
          variant="light"
          size="small"
        >
          {{ dueLabel(node.due, node.status === 'done') }}
        </t-tag>
        <span v-if="hasHours" class="hours" :title="`预计 ${fmtHours(hours.est)} / 实际 ${fmtHours(hours.act)}`">
          ⏱ {{ hours.act || 0 }}/{{ hours.est || 0 }}h
        </span>
        <template v-if="kids.length">
          <span class="kid-count">({{ kids.length }})</span>
          <t-progress :percentage="pct" :label="false" class="bar-sm" :theme="pct === 100 ? 'success' : 'line'" />
          <span class="pct">{{ pct }}%</span>
        </template>
        <t-tag v-if="node.archived" variant="outline" size="small">已归档</t-tag>

        <t-dropdown :options="menuOptions" @click="onMenu" trigger="click">
          <t-button variant="text" shape="square" size="small" title="更多操作" aria-label="更多操作" data-test="node-menu">
            <MoreIcon />
          </t-button>
        </t-dropdown>
      </span>
    </div>

    <div v-if="node.note && !collapsed" class="node-note">{{ node.note }}</div>

    <div v-if="kids.length && !collapsed" class="children">
      <ProjectNode v-for="kid in kids" :key="kid.id" :node="kid" :depth="depth + 1" />
    </div>
  </div>
</template>

<style scoped>
.node-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 5px 8px;
  border-radius: var(--td-radius-default);
  transition: background 0.15s;
}
.node-row:hover {
  background: var(--td-bg-color-container-hover);
}
.node-row.is-selected {
  background: var(--td-brand-color-light);
}
.node-row.is-done .node-title {
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}
.twisty {
  width: 26px;
  flex: 0 0 26px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.twisty .dot {
  color: var(--td-text-color-placeholder);
}
.node-title {
  border: 0;
  background: transparent;
  padding: 0;
  font: inherit;
  font-size: 13.5px;
  color: var(--td-text-color-primary);
  text-align: left;
  cursor: pointer;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 46%;
  flex: 1;
}
.node-title:hover {
  color: var(--td-brand-color);
}
.node-meta {
  display: flex;
  align-items: center;
  gap: 5px;
  margin-left: auto;
  flex-wrap: wrap;
  justify-content: flex-end;
}
.status-pill {
  display: inline-flex;
  border-radius: 999px;
  overflow: hidden;
}
.status-select {
  width: 88px;
}
.status-pill.status-todo :deep(.t-input) {
  background: var(--td-bg-color-secondarycontainer);
  border-color: transparent;
}
.status-pill.status-doing :deep(.t-input) {
  background: var(--td-brand-color-light);
  border-color: transparent;
}
.status-pill.status-done :deep(.t-input) {
  background: var(--td-success-color-light);
  border-color: transparent;
}
.status-pill.status-shelved :deep(.t-input) {
  background: var(--td-bg-color-secondarycontainer);
  border-color: transparent;
}
.status-pill :deep(.t-input__inner) {
  font-size: 11.5px;
  text-align: center;
}
.hours,
.pct,
.kid-count {
  font-size: 11.5px;
  color: var(--td-text-color-placeholder);
  white-space: nowrap;
}
.node-note {
  margin: 0 0 4px 46px;
  font-size: 11.5px;
  color: var(--td-text-color-placeholder);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.children {
  margin-left: 20px;
  padding-left: 8px;
  border-left: 1px dashed var(--td-component-stroke);
}

/* 窄屏：次要信息（优先级/标签/截止/工时/进度）收起，保证标题可读 */
@media (max-width: 767px) {
  .node-row {
    gap: 4px;
    padding: 6px 4px;
  }
  .node-title {
    max-width: none;
    flex: 1 1 auto;
    min-width: 48px;
  }
  .node-meta {
    flex-wrap: nowrap;
    gap: 4px;
  }
  .node-meta > .t-tag,
  .node-meta .hours,
  .node-meta .kid-count,
  .node-meta .bar-sm,
  .node-meta .pct {
    display: none;
  }
  .node-meta .status-select {
    width: 92px;
  }
}
</style>
