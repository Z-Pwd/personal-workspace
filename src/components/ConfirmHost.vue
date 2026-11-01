<script setup lang="ts">
import { computed } from 'vue';
import { confirmState, settleConfirm } from '../core/confirm';

const confirmTheme = computed(() => (confirmState.theme === 'default' ? 'primary' : 'danger'));
</script>

<template>
  <t-dialog
    :visible="confirmState.visible"
    :header="confirmState.header"
    width="420px"
    :footer="false"
    :close-on-overlay-click="false"
    destroy-on-close
    @update:visible="(v: boolean) => { if (!v) settleConfirm(false); }"
  >
    <p class="muted" style="margin-top: 0">{{ confirmState.message }}</p>
    <div class="dialog-foot">
      <t-button variant="outline" data-test="confirm-cancel" @click="settleConfirm(false)">
        {{ confirmState.cancelText }}
      </t-button>
      <t-button :theme="confirmTheme" data-test="confirm-ok" @click="settleConfirm(true)">
        {{ confirmState.confirmText }}
      </t-button>
    </div>
  </t-dialog>
</template>
