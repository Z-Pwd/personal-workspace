<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { newTask, newTodo, nextOrder, store } from '../core/store';
import { flatten } from '../core/tree';
import type { Idea } from '../core/types';
import { nowISO, todayISO } from '../core/util';
import { toast } from '../core/toast';

const props = defineProps<{ visible: boolean; idea: Idea | null }>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved'): void;
}>();

const form = reactive({
  title: '',
  kind: 'todo' as 'todo' | 'task',
  projectId: '__new__',
  newProject: '',
});

const kindOptions = [
  { label: '转成今日待办', value: 'todo' },
  { label: '转成项目里的任务', value: 'task' },
];

const projectOptions = computed(() => [
  { label: '＋ 新建一个项目', value: '__new__' },
  ...store.projects
    .filter((p) => !p.deletedAt && !p.archived)
    .map((p) => ({ label: p.title, value: p.id })),
]);

watch(
  () => props.visible,
  (v) => {
    if (!v || !props.idea) return;
    const firstLine = props.idea.content.split('\n')[0].trim();
    form.title = firstLine.length > 48 ? `${firstLine.slice(0, 48)}…` : firstLine || '新任务';
    form.kind = 'todo';
    form.projectId = projectOptions.value[0]?.value ?? '__new__';
    form.newProject = '';
  },
  { immediate: true },
);

function close(): void {
  emit('update:visible', false);
}

function save(): void {
  const title = form.title.trim();
  if (!title) {
    toast('标题不能为空', 'err');
    return;
  }
  const idea = props.idea;
  if (!idea) return;

  if (form.kind === 'todo') {
    const todo = newTodo(todayISO(), {
      title,
      note: idea.content,
      tags: [...idea.tags],
      quadrant: 'q2',
      order: nextOrder(store.todos, todayISO(), 'q2'),
    });
    store.todos.push(todo);
    idea.convertedTo = { type: 'todo', id: todo.id, title };
    store.touch('todos');
  } else {
    let project = store.projects.find((p) => p.id === form.projectId) ?? null;
    if (form.projectId === '__new__' || !project) {
      project = newTask({ title: form.newProject.trim() || title, status: 'doing', priority: 'mid' });
      store.projects.push(project);
    }
    const child = newTask({ title, note: idea.content, tags: [...idea.tags], priority: 'mid' });
    project.children.push(child);
    project.updatedAt = nowISO();
    idea.convertedTo = { type: 'task', id: child.id, title };
    store.touch('projects');
  }

  idea.status = 'adopted';
  idea.updatedAt = nowISO();
  store.touch('ideas');
  emit('saved');
  emit('update:visible', false);
  toast('已转成行动项');
}
</script>

<template>
  <t-dialog :visible="visible" header="把灵感变成行动" width="560px" :footer="false" @close="close"
    @update:visible="close"
    destroy-on-close
  >
    <t-form :label-width="92" label-align="right">
      <t-form-item label="标题">
        <t-input v-model="form.title" placeholder="转换后的标题" />
      </t-form-item>
      <t-form-item label="转换方式">
        <t-select v-model="form.kind" :options="kindOptions" style="width: 220px" />
      </t-form-item>
      <template v-if="form.kind === 'task'">
        <t-form-item label="放进项目">
          <t-select v-model="form.projectId" :options="projectOptions" filterable />
        </t-form-item>
        <t-form-item v-if="form.projectId === '__new__'" label="新项目名">
          <t-input v-model="form.newProject" placeholder="留空则用标题作为项目名" />
        </t-form-item>
      </template>
    </t-form>
    <p class="muted" style="margin: 0">转换后这条灵感会标记为「已采纳」。</p>
    <div class="dialog-foot">
      <t-button variant="outline" @click="close">取消</t-button>
      <t-button theme="primary" @click="save">转换</t-button>
    </div>
  </t-dialog>
</template>

<style scoped>
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
