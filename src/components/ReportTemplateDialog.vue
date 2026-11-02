<script setup lang="ts">
import { ref, watch } from 'vue';
import { currentTemplate, moveSection, resetTemplate, saveTemplate, SECTION_LABEL } from '../core/report-template';
import { toast } from '../core/toast';
import type { ReportSectionConfig } from '../core/types';

const props = defineProps<{ visible: boolean }>();
const emit = defineEmits<{ (e: 'update:visible', value: boolean): void; (e: 'saved'): void }>();

const draft = ref<ReportSectionConfig[]>([]);
const name = ref('');

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    const tpl = currentTemplate();
    draft.value = tpl.sections.map((s) => ({ ...s }));
    name.value = tpl.name;
  },
);

function move(index: number, dir: -1 | 1): void {
  draft.value = moveSection(draft.value, index, dir);
}

function restore(): void {
  resetTemplate();
  const tpl = currentTemplate();
  draft.value = tpl.sections.map((s) => ({ ...s }));
  name.value = tpl.name;
  toast('已恢复默认模板');
  emit('saved');
}

function save(): void {
  const enabled = draft.value.filter((s) => s.enabled);
  if (!enabled.length) {
    toast('至少要保留一个章节', 'err');
    return;
  }
  saveTemplate(draft.value, name.value);
  toast('模板已保存（重新生成后应用到报告）');
  emit('saved');
  emit('update:visible', false);
}
</script>

<template>
  <t-dialog
    :visible="visible"
    header="汇报模板"
    width="680px"
    :footer="false"
    destroy-on-close
    @update:visible="emit('update:visible', $event)"
  >
    <p class="muted" style="margin-top: 0">
      调整章节顺序、改名、开关。保存后对「新生成 / 重新生成」的报告生效；已生成的报告保留它生成时的模板。
    </p>

    <div class="tpl-name">
      <span class="muted">模板名称</span>
      <t-input v-model="name" size="small" placeholder="例如：部门周报格式" style="width: 220px" data-test="tpl-name" />
    </div>

    <div class="tpl-list" data-test="tpl-list">
      <div v-for="(s, i) in draft" :key="s.key" class="tpl-row" :data-key="s.key">
        <t-switch v-model="s.enabled" size="small" :data-test="`tpl-switch-${s.key}`" />
        <t-input
          v-model="s.title"
          size="small"
          class="tpl-title"
          :disabled="!s.enabled"
          :data-test="`tpl-title-${s.key}`"
        />
        <span class="muted tpl-hint">{{ SECTION_LABEL[s.key] }}</span>
        <div class="tpl-move">
          <t-button variant="text" shape="square" size="small" :disabled="i === 0" :title="'上移'" @click="move(i, -1)">
            ↑
          </t-button>
          <t-button
            variant="text"
            shape="square"
            size="small"
            :disabled="i === draft.length - 1"
            :title="'下移'"
            @click="move(i, 1)"
          >
            ↓
          </t-button>
        </div>
      </div>
    </div>

    <div class="dialog-foot">
      <t-button variant="outline" data-test="tpl-reset" @click="restore">恢复默认</t-button>
      <t-button variant="outline" @click="emit('update:visible', false)">取消</t-button>
      <t-button theme="primary" data-test="tpl-save" @click="save">保存</t-button>
    </div>
  </t-dialog>
</template>

<style scoped>
.tpl-name {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 10px 0 12px;
}
.tpl-list {
  border: 1px solid var(--td-component-border);
  border-radius: 8px;
  padding: 6px 10px;
}
.tpl-row {
  display: grid;
  grid-template-columns: 44px minmax(0, 180px) minmax(0, 1fr) 64px;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--td-component-stroke);
}
.tpl-row:last-child {
  border-bottom: 0;
}
.tpl-hint {
  font-size: 12px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.tpl-move {
  display: flex;
  gap: 2px;
}
</style>
