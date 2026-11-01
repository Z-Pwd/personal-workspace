<script setup lang="ts">
import { reactive, watch } from 'vue';
import { newTask, store } from '../core/store';
import type { Priority, Status, Task } from '../core/types';
import { nowISO } from '../core/util';
import { toast } from '../core/toast';

const props = defineProps<{
  visible: boolean;
  task: Task | null;
  parent: Task | null;
  header: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved', task: Task): void;
}>();

const statusOptions = [
  { label: '待开始', value: 'todo' },
  { label: '进行中', value: 'doing' },
  { label: '已完成', value: 'done' },
  { label: '已搁置', value: 'shelved' },
];
const priorityOptions = [
  { label: '高', value: 'high' },
  { label: '中', value: 'mid' },
  { label: '低', value: 'low' },
];

interface FormState {
  title: string;
  note: string;
  status: Status;
  priority: Priority;
  due: string;
  tags: string[];
  estHours: number | null;
  actHours: number | null;
  archived: boolean;
}

const form = reactive<FormState>({
  title: '',
  note: '',
  status: 'todo',
  priority: 'mid',
  due: '',
  tags: [],
  estHours: null,
  actHours: null,
  archived: false,
});

function reset(): void {
  const t = props.task;
  form.title = t?.title ?? '';
  form.note = t?.note ?? '';
  form.status = t?.status ?? 'todo';
  form.priority = t?.priority ?? props.parent?.priority ?? 'mid';
  form.due = t?.due ?? props.parent?.due ?? '';
  form.tags = [...(t?.tags ?? [])];
  form.estHours = t?.estHours ?? null;
  form.actHours = t?.actHours ?? null;
  form.archived = t?.archived ?? false;
}

watch(
  () => props.visible,
  (value) => {
    if (value) reset();
  },
  { immediate: true },
);

function close(): void {
  emit('update:visible', false);
}

function save(): void {
  const title = form.title.trim();
  if (!title) {
    toast('名称不能为空', 'err');
    return;
  }
  const payload = {
    title,
    note: form.note,
    status: form.status,
    priority: form.priority,
    due: form.due || null,
    tags: [...form.tags],
    estHours: form.estHours,
    actHours: form.actHours,
    archived: form.archived,
  };

  let target: Task;
  if (props.task) {
    Object.assign(props.task, payload, { updatedAt: nowISO() });
    target = props.task;
  } else {
    target = newTask(payload);
    if (props.parent) props.parent.children.push(target);
    else store.projects.push(target);
    if (props.parent) props.parent.updatedAt = nowISO();
  }
  store.touch('projects');
  emit('saved', target);
  emit('update:visible', false);
  toast(props.task ? '已保存' : '已创建');
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="header"
    width="620px"
    :footer="false"
    :close-on-overlay-click="true"
    @close="close"
    @update:visible="close"
    destroy-on-close
  >
    <t-form :label-width="92" label-align="right" class="task-form">
      <t-form-item label="名称">
        <t-input v-model="form.title" placeholder="例如：梳理盘点流程" />
      </t-form-item>

      <t-row :gutter="12">
        <t-col :span="8">
          <t-form-item label="状态">
            <t-select v-model="form.status" :options="statusOptions" />
          </t-form-item>
        </t-col>
        <t-col :span="8">
          <t-form-item label="优先级">
            <t-select v-model="form.priority" :options="priorityOptions" />
          </t-form-item>
        </t-col>
        <t-col :span="8">
          <t-form-item label="截止">
            <t-date-picker v-model="form.due" clearable placeholder="选择日期" />
          </t-form-item>
        </t-col>
      </t-row>

      <t-row :gutter="12">
        <t-col :span="12">
          <t-form-item label="预计工时">
            <t-input-number v-model="form.estHours" :min="0" :step="0.5" theme="normal" placeholder="小时" />
          </t-form-item>
        </t-col>
        <t-col :span="12">
          <t-form-item label="实际工时">
            <t-input-number v-model="form.actHours" :min="0" :step="0.5" theme="normal" placeholder="小时" />
          </t-form-item>
        </t-col>
      </t-row>

      <t-form-item label="标签">
        <t-tag-input v-model="form.tags" placeholder="输入后回车，例如：沟通 / 文档" :clearable="true" />
      </t-form-item>

      <t-form-item label="备注">
        <t-textarea v-model="form.note" :autosize="{ minRows: 3, maxRows: 6 }" placeholder="背景、验收标准（可选）" />
      </t-form-item>

      <t-form-item label="归档">
        <t-switch v-model="form.archived" />
        <span class="muted" style="margin-left: 8px">不在主列表显示，进度仍保留</span>
      </t-form-item>
    </t-form>

    <div class="dialog-foot">
      <t-button variant="outline" @click="close">取消</t-button>
      <t-button theme="primary" @click="save">{{ task ? '保存' : '创建' }}</t-button>
    </div>
  </t-dialog>
</template>

<style scoped>
.task-form :deep(.t-form__item) {
  margin-bottom: 12px;
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding-top: 4px;
}
</style>
