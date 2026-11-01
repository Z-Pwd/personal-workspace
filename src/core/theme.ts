/** 主题：TDesign 用 theme-mode 属性切换亮/暗，令牌随之切换 */
import { ref } from 'vue';

export type Theme = 'light' | 'dark';
const KEY = 'wb.theme';

export const theme = ref<Theme>('light');

export function getTheme(): Theme {
  const saved = localStorage.getItem(KEY);
  if (saved === 'light' || saved === 'dark') return saved;
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function applyTheme(value: Theme): void {
  theme.value = value;
  document.documentElement.setAttribute('theme-mode', value);
  document.documentElement.dataset.theme = value;
  localStorage.setItem(KEY, value);
}

export function toggleTheme(): Theme {
  const next: Theme = theme.value === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
