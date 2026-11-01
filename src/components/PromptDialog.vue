<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{
  visible: boolean;
  header?: string;
  message: string;
  expect: string;
  confirmText?: string;
}>();

const emit = defineEmits<{
  (e: 'update:visible', value: boolean): void;
  (e: 'confirm'): void;
  (e: 'cancel'): void;
}>();

const text = ref('');

watch(
  () => props.visible,
  (v) => {
    if (v) text.value = '';
  },
);

function onOk(): void {
  if (text.value.trim() !== props.expect) return;
  emit('confirm');
}

function onCancel(): void {
  emit('update:visible', false);
  emit('cancel');
}
</script>

<template>
  <t-dialog
    :visible="visible"
    :header="header ?? '再次确认'"
    width="440px"
    :footer="false"
    :close-on-overlay-click="false"
    destroy-on-close
    @update:visible="emit('update:visible', $event)"
    @close="onCancel"
  >
    <p class="muted" style="margin-top: 0">{{ message }}</p>
    <t-input v-model="text" :placeholder="`请输入「${expect}」`" data-test="prompt-input" @enter="onOk" />
    <div class="dialog-foot">
      <t-button variant="outline" data-test="prompt-cancel" @click="onCancel">取消</t-button>
      <t-button theme="danger" :disabled="text.trim() !== expect" data-test="prompt-ok" @click="onOk">
        {{ confirmText ?? '确定' }}
      </t-button>
    </div>
  </t-dialog>
</template>
