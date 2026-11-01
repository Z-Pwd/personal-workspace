/** 全局确认弹窗：用 Vue 组件渲染（TDesign DialogPlugin 关闭不稳定，弃用） */
import { reactive } from 'vue';

export interface ConfirmState {
  visible: boolean;
  header: string;
  message: string;
  confirmText: string;
  cancelText: string;
  theme: 'default' | 'warning' | 'danger' | 'info';
  resolve: ((value: boolean) => void) | null;
}

export const confirmState = reactive<ConfirmState>({
  visible: false,
  header: '确认操作',
  message: '',
  confirmText: '确定',
  cancelText: '取消',
  theme: 'warning',
  resolve: null,
});

export interface ConfirmOptions {
  header?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  theme?: ConfirmState['theme'];
}

/** 打开确认弹窗，返回是否确认 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  // 若已有未关闭的确认框，先当作取消处理，避免 Promise 悬挂
  if (confirmState.resolve) settleConfirm(false);
  confirmState.header = options.header ?? '确认操作';
  confirmState.message = options.message;
  confirmState.confirmText = options.confirmText ?? '确定';
  confirmState.cancelText = options.cancelText ?? '取消';
  confirmState.theme = options.theme ?? 'warning';
  confirmState.visible = true;
  return new Promise<boolean>((resolve) => {
    confirmState.resolve = resolve;
  });
}

/** 关闭并返回结果 */
export function settleConfirm(value: boolean): void {
  const resolve = confirmState.resolve;
  confirmState.resolve = null;
  confirmState.visible = false;
  resolve?.(value);
}
