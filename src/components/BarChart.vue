<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{ data: { label: string; value: number }[]; unit?: string }>();

const max = computed(() => Math.max(1, ...props.data.map((d) => d.value)));
</script>

<template>
  <div class="cols">
    <div v-for="d in data" :key="d.label" class="col" :title="`${d.label}：${d.value}${unit ?? ''}`">
      <span class="val">{{ d.value || '' }}</span>
      <div class="track">
        <i :style="{ height: `${Math.max(d.value ? 6 : 2, (d.value / max) * 100)}%` }" :class="{ empty: !d.value }" />
      </div>
      <span class="label">{{ d.label }}</span>
    </div>
  </div>
</template>

<style scoped>
.cols {
  display: flex;
  align-items: flex-end;
  gap: 4px;
  height: 150px;
  padding-top: 10px;
}
.col {
  flex: 1;
  min-width: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.track {
  flex: 1;
  width: 100%;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.track i {
  width: 100%;
  max-width: 28px;
  min-height: 2px;
  border-radius: 4px 4px 2px 2px;
  background: linear-gradient(180deg, var(--td-brand-color), var(--td-brand-color-active));
  transition: height 0.3s;
}
.track i.empty {
  background: var(--td-component-stroke);
}
.val {
  font-size: 10px;
  color: var(--td-text-color-placeholder);
  height: 12px;
}
.label {
  font-size: 9.5px;
  color: var(--td-text-color-placeholder);
  white-space: nowrap;
}
</style>
