<script setup lang="ts">
import { reactive, watch } from 'vue';
import { nextOrder, store, newTodo } from '../core/store';
import type { Priority, Quadrant, Repeat, Todo } from '../core/types';
import { nowISO, todayISO } from '../core/util';
import { toast } from '../core/toast';

const props = defineProps<{ visible: boolean; todo: Todo | null; date: string }>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved', todo: Todo): void;
}>();

const priorityOptions = [
  { label: '高', value: 'high' },
  { label: '中', value: 'mid' },
  { label: '低', value: 'low' },
];
const quadrantOptions = [
  { label: '重要且紧急', value: 'q1' },
  { label: '重要不紧急', value: 'q2' },
  { label: '不重要但紧急', value: 'q3' },
  { label: '不重要不紧急', value: 'q4' },
];
const repeatOptions = [
  { label: '不重复', value: 'none' },
  { label: '每天', value: 'daily' },
  { label: '每周', value: 'weekly' },
];

interface FormState {
  title: string;
  note: string;
  priority: Priority;
  quadrant: Quadrant;
  date: string;
  dueTime: string;
  remindAt: string;
  tags: string[];
  repeat: Repeat;
  pinned: boolean;
}

const form = reactive<FormState>({
  title: '',
  note: '',
  priority: 'mid',
  quadrant: 'q2',
  date: todayISO(),
  dueTime: '',
  remindAt: '',
  tags: [],
  repeat: 'none',
  pinned: false,
});

function reset(): void {
  const t = props.todo;
  form.title = t?.title ?? '';
  form.note = t?.note ?? '';
  form.priority = t?.priority ?? 'mid';
  form.quadrant = t?.quadrant ?? 'q2';
  form.date = t?.date ?? props.date ?? todayISO();
  form.dueTime = t?.dueTime ?? '';
  form.remindAt = t?.remindAt ?? '';
  form.tags = [...(t?.tags ?? [])];
  form.repeat = t?.repeat ?? 'none';
  form.pinned = t?.pinned ?? false;
}

watch(
  () => props.visible,
  (v) => {
    if (v) reset();
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
  const patch = {
    title,
    note: form.note,
    priority: form.priority,
    quadrant: form.quadrant,
    dueTime: form.dueTime || null,
    remindAt: form.remindAt || null,
    tags: [...form.tags],
    repeat: form.repeat,
    pinned: form.pinned,
    updatedAt: nowISO(),
  };

  let target: Todo;
  if (props.todo) {
    Object.assign(props.todo, patch);
    if (props.todo.date !== form.date) {
      props.todo.date = form.date;
      props.todo.order = nextOrder(store.todos, form.date, form.quadrant);
    }
    target = props.todo;
  } else {
    target = newTodo(form.date, {
      ...patch,
      order: nextOrder(store.todos, form.date, form.quadrant),
    });
    store.todos.push(target);
  }
  store.touch('todos');
  emit('saved', target);
  emit('update:visible', false);
  toast(props.todo ? '已保存' : '已添加');
}
</script>

<template>
  <t-dialog :visible="visible" :header="todo ? '编辑待办' : '新建待办'" width="600px" :footer="false" @close="close"
    @update:visible="close"
    destroy-on-close
  >
    <t-form :label-width="92" label-align="right">
      <t-form-item label="标题">
        <t-input v-model="form.title" placeholder="要做什么？例如：给客户发方案确认邮件" />
      </t-form-item>

      <t-row :gutter="12">
        <t-col :span="12">
          <t-form-item label="优先级">
            <t-select v-model="form.priority" :options="priorityOptions" />
          </t-form-item>
        </t-col>
        <t-col :span="12">
          <t-form-item label="四象限">
            <t-select v-model="form.quadrant" :options="quadrantOptions" />
          </t-form-item>
        </t-col>
      </t-row>

      <t-row :gutter="12">
        <t-col :span="8">
          <t-form-item label="归属日期">
            <t-date-picker v-model="form.date" />
          </t-form-item>
        </t-col>
        <t-col :span="8">
          <t-form-item label="截止时间">
            <t-time-picker v-model="form.dueTime" format="HH:mm" clearable placeholder="可选" />
          </t-form-item>
        </t-col>
        <t-col :span="8">
          <t-form-item label="重复">
            <t-select v-model="form.repeat" :options="repeatOptions" />
          </t-form-item>
        </t-col>
      </t-row>

      <t-form-item label="提醒时间">
        <t-date-picker
          v-model="form.remindAt"
          enable-time-picker
          format="YYYY-MM-DD HH:mm"
          clearable
          placeholder="到点后页面顶部提醒"
        />
      </t-form-item>

      <t-form-item label="标签">
        <t-tag-input v-model="form.tags" placeholder="如：沟通 / 文档" :clearable="true" />
      </t-form-item>

      <t-form-item label="描述">
        <t-textarea v-model="form.note" :autosize="{ minRows: 2, maxRows: 5 }" placeholder="补充说明（可选）" />
      </t-form-item>

      <t-form-item label="置顶">
        <t-switch v-model="form.pinned" />
        <span class="muted" style="margin-left: 8px">列表最前，四象限里带竖条标记</span>
      </t-form-item>
    </t-form>

    <div class="dialog-foot">
      <t-button variant="outline" @click="close">取消</t-button>
      <t-button theme="primary" @click="save">{{ todo ? '保存' : '添加' }}</t-button>
    </div>
  </t-dialog>
</template>

<style scoped>
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
