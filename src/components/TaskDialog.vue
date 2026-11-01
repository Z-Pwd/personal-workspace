<script setup lang="ts">
import { computed, reactive, watch } from 'vue';
import { DeleteIcon } from 'tdesign-icons-vue-next';
import { newTask, store } from '../core/store';
import { setTaskStatus } from '../core/task-ops';
import type { Priority, Status, Task, TimeLog } from '../core/types';
import { nowISO, todayISO, uid } from '../core/util';
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
  timeLogs: TimeLog[];
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
  timeLogs: [],
  archived: false,
});

const hasLogs = computed(() => form.timeLogs.length > 0);
const logTotal = computed(() =>
  Math.round(form.timeLogs.reduce((acc, l) => acc + (Number(l.hours) || 0), 0) * 10) / 10,
);

// 有流水时实际工时 = 流水合计，实时同步到只读输入框
watch(
  () => form.timeLogs,
  () => {
    if (form.timeLogs.length) form.actHours = logTotal.value;
  },
  { deep: true },
);

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
  form.timeLogs = (t?.timeLogs ?? []).map((l) => ({ ...l }));
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

function addLog(): void {
  form.timeLogs.push({ id: uid(), date: todayISO(), hours: 0.5, note: '' });
}

function removeLog(id: string): void {
  form.timeLogs = form.timeLogs.filter((l) => l.id !== id);
}

function save(): void {
  const title = form.title.trim();
  if (!title) {
    toast('名称不能为空', 'err');
    return;
  }
  const logs = form.timeLogs
    .filter((l) => Number(l.hours) > 0)
    .map((l) => ({ id: l.id, date: l.date || todayISO(), hours: Math.round(Number(l.hours) * 10) / 10, note: l.note }));
  const payload = {
    title,
    note: form.note,
    priority: form.priority,
    due: form.due || null,
    tags: [...form.tags],
    estHours: form.estHours,
    actHours: logs.length ? Math.round(logs.reduce((a, l) => a + l.hours, 0) * 10) / 10 : form.actHours,
    timeLogs: logs,
    archived: form.archived,
  };

  let target: Task;
  if (props.task) {
    Object.assign(props.task, payload);
    setTaskStatus(props.task, form.status);
    target = props.task;
  } else {
    target = newTask({ ...payload, status: 'todo' });
    setTaskStatus(target, form.status);
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
            <div class="hours-field">
              <t-input-number v-model="form.actHours" :min="0" :step="0.5" theme="normal" placeholder="小时" :disabled="hasLogs" />
              <span class="muted">
                {{ hasLogs ? `由工时流水自动合计 ${logTotal}h` : '可直接填总时长，也可在下方按天记录' }}
              </span>
            </div>
          </t-form-item>
        </t-col>
      </t-row>

      <t-form-item label="工时流水">
        <div class="time-logs">
          <div v-if="!hasLogs" class="time-log-empty">还没有流水。按天记录后，周报会按日期自动汇总工时。</div>
          <div v-for="log in form.timeLogs" :key="log.id" class="time-log-row">
            <t-date-picker v-model="log.date" placeholder="日期" />
            <t-input-number v-model="log.hours" :min="0" :step="0.5" theme="normal" />
            <t-input v-model="log.note" placeholder="备注（可选）" />
            <t-button variant="text" theme="danger" shape="square" size="small" title="删除这条流水" aria-label="删除这条流水" @click="removeLog(log.id)">
              <DeleteIcon />
            </t-button>
          </div>
          <t-button variant="outline" size="small" @click="addLog">+ 记录一条工时</t-button>
        </div>
      </t-form-item>

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
