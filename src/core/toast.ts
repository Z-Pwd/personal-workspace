/** TDesign 的提示与确认弹窗封装（替代原来的自研 toast/modal） */
import { MessagePlugin } from 'tdesign-vue-next';
import 'tdesign-vue-next/es/message/style/index.css';
import { confirmDialog } from './confirm';

export type ToastKind = 'ok' | 'err' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** 轻提示；带操作按钮时降级成确认弹窗，保证「重试 / 载入最新」这类动作仍可点 */
export function toast(message: string, kind: ToastKind = 'ok', action?: ToastAction): void {
  if (action) {
    void confirmDialog({ header: '提示', message, confirmText: action.label, cancelText: '关闭', theme: 'info' }).then((ok) => {
      if (ok) action.onClick();
    });
    return;
  }
  const api = kind === 'ok' ? MessagePlugin.success : kind === 'err' ? MessagePlugin.error : MessagePlugin.info;
  api({ content: message, duration: 2600, offset: [0, 64] });
}

/** 二次确认，返回 Promise<boolean>（组件式弹窗，见 components/ConfirmHost.vue） */
export function confirmAction(message: string, header = '确认操作'): Promise<boolean> {
  return confirmDialog({ header, message, theme: 'warning' });
}


