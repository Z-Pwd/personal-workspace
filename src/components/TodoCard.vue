<script setup lang="ts">
import { computed } from 'vue';
import { DeleteIcon, EditIcon } from 'tdesign-icons-vue-next';
import { PRIORITY_LABEL, QUADRANT_LABEL, REPEAT_LABEL, type Todo } from '../core/types';

const props = defineProps<{ todo: Todo; showQuadrant?: boolean; dragging?: boolean }>();
const emit = defineEmits<{
  (e: 'toggle', value: boolean): void;
  (e: 'edit'): void;
  (e: 'remove'): void;
  (e: 'pin'): void;
}>();

const priorityTheme = computed(() =>
  props.todo.priority === 'high' ? 'danger' : props.todo.priority === 'mid' ? 'warning' : 'default',
);

const noteText = computed(() => props.todo.note.split('\n').slice(0, 3).join(' '));
</script>

<template>
  <div
    class="todo-card"
    :class="{ done: todo.done, pinned: todo.pinned, dragging }"
    draggable="true"
    :data-todo-id="todo.id"
  >
    <t-checkbox :checked="todo.done" class="todo-check" @change="(v: boolean) => emit('toggle', v)" />

    <div class="todo-main">
      <div class="todo-title">{{ todo.title }}</div>
      <div v-if="noteText" class="todo-note">{{ noteText }}</div>
      <div class="todo-meta">
        <t-tag :theme="priorityTheme" variant="light" size="small">{{ PRIORITY_LABEL[todo.priority] }}优先</t-tag>
        <t-tag v-if="showQuadrant" variant="outline" size="small">{{ QUADRANT_LABEL[todo.quadrant] }}</t-tag>
        <t-tag v-if="todo.dueTime" variant="outline" size="small">⏰ {{ todo.dueTime }}</t-tag>
        <t-tag v-if="todo.repeat !== 'none'" variant="outline" size="small">🔁 {{ REPEAT_LABEL[todo.repeat] }}</t-tag>
        <t-tag v-if="todo.projectId" theme="primary" variant="light" size="small">来自项目</t-tag>
        <t-tag v-for="tag in todo.tags" :key="tag" theme="primary" variant="light" size="small">#{{ tag }}</t-tag>
        <span v-if="todo.done && todo.doneAt" class="done-at">完成于 {{ todo.doneAt.slice(11, 16) }}</span>
      </div>
    </div>

    <div class="todo-actions">
      <t-tooltip :content="todo.pinned ? '取消置顶' : '置顶'">
        <t-button variant="text" shape="square" size="small" data-test="todo-pin" :title="todo.pinned ? '取消置顶' : '置顶'" aria-label="置顶" @click.stop="emit('pin')">📌</t-button>
      </t-tooltip>
      <t-tooltip content="编辑">
        <t-button variant="text" shape="square" size="small" data-test="todo-edit" title="编辑" aria-label="编辑" @click.stop="emit('edit')"><EditIcon /></t-button>
      </t-tooltip>
      <t-tooltip content="删除">
        <t-button variant="text" shape="square" size="small" data-test="todo-remove" title="删除" aria-label="删除" @click.stop="emit('remove')"><DeleteIcon /></t-button>
      </t-tooltip>
    </div>
  </div>
</template>

<style scoped>
.todo-card {
  display: flex;
  gap: 9px;
  align-items: flex-start;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-default);
  padding: 9px 10px;
  cursor: grab;
  transition: box-shadow 0.15s, border-color 0.15s, opacity 0.15s;
}
.todo-card:hover {
  border-color: var(--td-brand-color);
  box-shadow: var(--td-shadow-1);
}
.todo-card:active {
  cursor: grabbing;
}
.todo-card.dragging {
  opacity: 0.45;
}
.todo-card.done {
  opacity: 0.66;
}
.todo-card.done .todo-title {
  text-decoration: line-through;
  color: var(--td-text-color-placeholder);
}
.todo-card.pinned {
  border-left: 3px solid var(--td-warning-color);
}
.todo-check {
  margin-top: 1px;
}
.todo-main {
  min-width: 0;
  flex: 1;
}
.todo-title {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.todo-note {
  font-size: 11.5px;
  color: var(--td-text-color-placeholder);
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.todo-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 5px;
  align-items: center;
}
.done-at {
  font-size: 11px;
  color: var(--td-text-color-placeholder);
}
.todo-actions {
  display: flex;
  gap: 0;
  /* 常显：触屏 / 触控板也能直接点到，不再依赖 hover */
  opacity: 0.55;
  transition: opacity 0.15s;
}
.todo-card:hover .todo-actions,
.todo-card:focus-within .todo-actions {
  opacity: 1;
}
</style>
