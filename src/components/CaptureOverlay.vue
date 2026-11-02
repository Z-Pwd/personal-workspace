<script setup lang="ts">
import { computed, nextTick, onUnmounted, ref, watch } from 'vue';
import { runCapture, type CaptureTarget } from '../core/capture';
import { parseCapture } from '../core/nlp';
import { toast } from '../core/toast';
import { dateLabelCN } from '../core/util';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void; (e: 'done', target: CaptureTarget): void }>();

const text = ref('');
const inputRef = ref<{ focus?: () => void } | null>(null);
const busy = ref(false);

const parsed = computed(() => parseCapture(text.value));
const canSubmit = computed(() => parsed.value.title.trim().length > 0);

/** 挂 window 级监听：TDesign 输入框会拦截 Enter 的冒泡，挂在组件上收不到 */
function bindKeys(): void {
  window.addEventListener('keydown', onKeydown, true);
}
function unbindKeys(): void {
  window.removeEventListener('keydown', onKeydown, true);
}

watch(
  () => props.visible,
  async (v) => {
    if (v) {
      text.value = '';
      bindKeys();
      await nextTick();
      inputRef.value?.focus?.();
    } else {
      unbindKeys();
    }
  },
);

onUnmounted(unbindKeys);

function close(): void {
  emit('update:visible', false);
}

function submit(target: CaptureTarget): void {
  if (!canSubmit.value || busy.value) return;
  busy.value = true;
  try {
    const outcome = runCapture(parsed.value, target);
    toast(`已加入${outcome.where}：${outcome.title.slice(0, 18)}${outcome.title.length > 18 ? '…' : ''}`);
    emit('done', target);
    close();
  } finally {
    busy.value = false;
  }
}

function onKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape') {
    e.preventDefault();
    close();
    return;
  }
  if (e.key === 'Enter') {
    e.preventDefault();
    if (e.ctrlKey && e.shiftKey) submit('task');
    else if (e.ctrlKey) submit('idea');
    else submit('todo');
  }
}
</script>

<template>
  <teleport to="body">
    <div v-if="visible" class="capture-backdrop" data-test="capture-overlay" @click.self="close">
      <div class="capture-panel" role="dialog" aria-label="快速捕获">
        <div class="capture-head">
          <span class="capture-title">快速捕获</span>
          <span class="muted">回车 → 待办　Ctrl+回车 → 灵感　Ctrl+Shift+回车 → 项目任务　Esc 关闭</span>
        </div>

        <t-input
          ref="inputRef"
          v-model="text"
          class="capture-input"
          size="large"
          placeholder="一句话记下来：明天 交周报 #周报 !高 2h @工作台"
          data-test="capture-input"
        />

        <div class="capture-preview" data-test="capture-preview">
          <span class="muted">识别为：</span>
          <t-tag v-if="parsed.date" size="small" theme="primary" variant="light" data-test="chip-date">
            {{ parsed.date }}（{{ dateLabelCN(parsed.date) }}）
          </t-tag>
          <t-tag v-for="tag in parsed.tags" :key="tag" size="small" variant="light">#{{ tag }}</t-tag>
          <t-tag v-if="parsed.priority" size="small" theme="warning" variant="light">
            {{ parsed.priority === 'high' ? '高优先' : parsed.priority === 'mid' ? '中优先' : '低优先' }}
          </t-tag>
          <t-tag v-if="parsed.hours" size="small" theme="success" variant="light">{{ parsed.hours }}h</t-tag>
          <t-tag v-if="parsed.project" size="small" theme="default" variant="light">@{{ parsed.project }}</t-tag>
          <span v-if="!parsed.date && !parsed.tags.length && !parsed.priority && !parsed.hours && !parsed.project" class="muted">
            没识别到语法标记，会按普通待办处理
          </span>
          <span class="capture-title-preview" data-test="capture-title">{{ parsed.title || '（还没输入内容）' }}</span>
        </div>

        <div class="capture-actions">
          <t-button theme="primary" :disabled="!canSubmit" data-test="capture-todo" @click="submit('todo')">
            加入待办
          </t-button>
          <t-button variant="outline" :disabled="!canSubmit" data-test="capture-idea" @click="submit('idea')">
            存为灵感
          </t-button>
          <t-button variant="outline" :disabled="!canSubmit" data-test="capture-task" @click="submit('task')">
            建为任务
          </t-button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<style scoped>
.capture-backdrop {
  position: fixed;
  inset: 0;
  z-index: 3000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding-top: 12vh;
}
.capture-panel {
  width: min(680px, 92vw);
  background: var(--td-bg-color-container);
  border-radius: 12px;
  padding: 18px 20px 16px;
  box-shadow: 0 18px 48px rgba(0, 0, 0, 0.28);
}
.capture-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.capture-title {
  font-weight: 600;
  font-size: 15px;
}
.capture-input :deep(.t-input) {
  font-size: 16px;
}
.capture-preview {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px;
  min-height: 32px;
  margin-top: 12px;
  font-size: 13px;
}
.capture-title-preview {
  margin-left: auto;
  max-width: 45%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--td-text-color-secondary);
}
.capture-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
</style>
