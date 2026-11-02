<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { parseCapture } from '../core/nlp';
import { newTodo, nextOrder, store } from '../core/store';
import { toast } from '../core/toast';
import { todayISO } from '../core/util';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void }>();

const raw = ref('');
const useParsedDate = ref(true);
const fallbackDate = ref(todayISO());

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    raw.value = '';
    useParsedDate.value = true;
    fallbackDate.value = todayISO();
  },
);

interface Row {
  line: number;
  source: string;
  title: string;
  date: string;
  tags: string[];
  priority: 'high' | 'mid' | 'low';
  hours: number | null;
}

/** 去掉行首的列表符号：- * 1. ① 等 */
function stripBullet(line: string): string {
  return line.replace(/^\s*(?:[-*•·]|\d+[.)、]|[①-⑳])\s*/, '').trim();
}

const rows = computed<Row[]>(() => {
  const out: Row[] = [];
  raw.value.split(/\r?\n/).forEach((line, i) => {
    const text = stripBullet(line);
    if (!text) return;
    const parsed = parseCapture(text);
    if (!parsed.title) return;
    out.push({
      line: i + 1,
      source: text,
      title: parsed.title,
      date: useParsedDate.value ? parsed.date ?? fallbackDate.value : fallbackDate.value,
      tags: parsed.tags,
      priority: parsed.priority ?? 'mid',
      hours: parsed.hours,
    });
  });
  return out;
});

function doImport(): void {
  const list = rows.value;
  if (!list.length) return;
  for (const row of list) {
    const todo = newTodo(row.date, {
      title: row.title,
      priority: row.priority,
      tags: [...row.tags],
      order: nextOrder(store.todos, row.date, 'q2'),
    });
    store.todos.unshift(todo);
  }
  store.touch('todos');
  toast(`已导入 ${list.length} 条待办`);
  emit('update:visible', false);
}
</script>

<template>
  <t-dialog
    :visible="visible"
    header="从文本批量导入"
    width="720px"
    :footer="false"
    destroy-on-close
    @update:visible="emit('update:visible', $event)"
  >
    <p class="muted" style="margin-top: 0">
      一行一条，支持 <code>#标签</code>、<code>!高</code>、<code>明天</code>、<code>3h</code> 等语法，行首的「- 」「1. 」会被自动去掉。
    </p>
    <t-textarea
      v-model="raw"
      :autosize="{ minRows: 5, maxRows: 10 }"
      placeholder="整理会议纪要&#10;给财务发盘点模板 #沟通 !高 明天&#10;3h 写盘点流程文档"
      data-test="bulk-textarea"
    />

    <div class="bulk-bar">
      <t-radio-group v-model="useParsedDate" variant="outline" size="small">
        <t-radio-button :value="true">用每行解析出的日期</t-radio-button>
        <t-radio-button :value="false">统一放到指定日期</t-radio-button>
      </t-radio-group>
      <t-date-picker v-if="!useParsedDate" v-model="fallbackDate" style="width: 160px" data-test="bulk-date" />
      <span class="muted">识别到 {{ rows.length }} 条</span>
    </div>

    <div class="bulk-preview" data-test="bulk-preview">
      <div v-if="!rows.length" class="muted">粘贴内容后这里会显示预览</div>
      <div v-for="row in rows" :key="row.line" class="bulk-row">
        <span class="bulk-idx">{{ row.line }}</span>
        <span class="bulk-title">{{ row.title }}</span>
        <t-tag size="small" variant="light">{{ row.date }}</t-tag>
        <t-tag v-for="tag in row.tags" :key="tag" size="small" variant="light">#{{ tag }}</t-tag>
        <t-tag v-if="row.priority !== 'mid'" size="small" theme="warning" variant="light">
          {{ row.priority === 'high' ? '高' : '低' }}
        </t-tag>
        <t-tag v-if="row.hours" size="small" theme="success" variant="light">{{ row.hours }}h</t-tag>
      </div>
    </div>

    <div class="dialog-foot">
      <t-button variant="outline" @click="emit('update:visible', false)">取消</t-button>
      <t-button theme="primary" :disabled="!rows.length" data-test="bulk-import" @click="doImport">
        导入 {{ rows.length }} 条
      </t-button>
    </div>
  </t-dialog>
</template>

<style scoped>
.bulk-bar {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0 10px;
}
.bulk-preview {
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  padding: 8px 10px;
}
.bulk-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 0;
  font-size: 13px;
  border-bottom: 1px dashed var(--td-component-stroke);
}
.bulk-row:last-child {
  border-bottom: none;
}
.bulk-idx {
  width: 22px;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.bulk-title {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
