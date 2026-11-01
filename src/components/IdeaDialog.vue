<script setup lang="ts">
import { reactive, watch } from 'vue';
import { newIdea, store } from '../core/store';
import type { Idea, IdeaStatus } from '../core/types';
import { nowISO } from '../core/util';
import { toast } from '../core/toast';

const props = defineProps<{ visible: boolean; idea: Idea | null }>();
const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'saved'): void;
}>();

const statusOptions = [
  { label: '未处理', value: 'inbox' },
  { label: '已采纳', value: 'adopted' },
  { label: '已归档', value: 'archived' },
];

const form = reactive({
  content: '',
  tags: [] as string[],
  status: 'inbox' as IdeaStatus,
  favorite: false,
});

watch(
  () => props.visible,
  (v) => {
    if (!v) return;
    form.content = props.idea?.content ?? '';
    form.tags = [...(props.idea?.tags ?? [])];
    form.status = props.idea?.status ?? 'inbox';
    form.favorite = props.idea?.favorite ?? false;
  },
  { immediate: true },
);

function close(): void {
  emit('update:visible', false);
}

function save(): void {
  const content = form.content.trim();
  if (!content) {
    toast('内容不能为空', 'err');
    return;
  }
  if (props.idea) {
    props.idea.content = content;
    props.idea.tags = [...form.tags];
    props.idea.status = form.status;
    props.idea.favorite = form.favorite;
    props.idea.updatedAt = nowISO();
  } else {
    store.ideas.unshift(
      newIdea({ content, tags: [...form.tags], status: form.status, favorite: form.favorite }),
    );
  }
  store.touch('ideas');
  emit('saved');
  emit('update:visible', false);
  toast(props.idea ? '已保存' : '已记录');
}
</script>

<template>
  <t-dialog :visible="visible" :header="idea ? '编辑灵感' : '记一条灵感'" width="560px" :footer="false" @close="close"
    @update:visible="close"
    destroy-on-close
  >
    <t-form :label-width="70" label-align="right">
      <t-form-item label="内容">
        <t-textarea v-model="form.content" :autosize="{ minRows: 6, maxRows: 12 }" placeholder="随手记下任何想法，可以多行…" />
      </t-form-item>
      <t-form-item label="标签">
        <t-tag-input v-model="form.tags" placeholder="输入后回车，如：产品 / 生活" :clearable="true" />
      </t-form-item>
      <t-form-item label="状态">
        <t-select v-model="form.status" :options="statusOptions" style="width: 160px" />
      </t-form-item>
      <t-form-item label="收藏">
        <t-switch v-model="form.favorite" />
        <span class="muted" style="margin-left: 8px">收藏的灵感置顶显示</span>
      </t-form-item>
    </t-form>

    <div class="dialog-foot">
      <t-button variant="outline" @click="close">取消</t-button>
      <t-button theme="primary" @click="save">{{ idea ? '保存' : '记录' }}</t-button>
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
