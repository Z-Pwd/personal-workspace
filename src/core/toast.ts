/** TDesign 的提示与确认弹窗封装（替代原来的自研 toast/modal） */
import { DialogPlugin, MessagePlugin } from 'tdesign-vue-next';
import 'tdesign-vue-next/es/message/style/index.css';
import 'tdesign-vue-next/es/dialog/style/index.css';

export type ToastKind = 'ok' | 'err' | 'info';

export interface ToastAction {
  label: string;
  onClick: () => void;
}

/** 轻提示；带操作按钮时降级成确认弹窗，保证「重试 / 载入最新」这类动作仍可点 */
export function toast(message: string, kind: ToastKind = 'ok', action?: ToastAction): void {
  if (action) {
    const dlg = DialogPlugin.confirm({
      header: '提示',
      body: message,
      confirmBtn: action.label,
      cancelBtn: '关闭',
      onConfirm: () => {
        action.onClick();
        dlg.hide();
      },
      onCancel: () => dlg.hide(),
      onClose: () => dlg.hide(),
    });
    return;
  }
  const api = kind === 'ok' ? MessagePlugin.success : kind === 'err' ? MessagePlugin.error : MessagePlugin.info;
  api({ content: message, duration: 2600, offset: [0, 64] });
}

/** 二次确认，返回 Promise<boolean> */
export function confirmAction(message: string, header = '确认操作'): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    const dlg = DialogPlugin.confirm({
      header,
      body: message,
      confirmBtn: '确定',
      cancelBtn: '取消',
      theme: 'warning',
      onConfirm: () => {
        finish(true);
        dlg.hide();
      },
      onCancel: () => {
        finish(false);
        dlg.hide();
      },
      onClose: () => {
        finish(false);
        dlg.hide();
      },
    });
  });
}

/** 输入文字确认（用于清空数据这类高危操作） */
export function promptAction(message: string, expect: string): Promise<boolean> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.className = 't-input__inner';
    input.style.cssText = 'width:100%;padding:8px 12px;border:1px solid var(--td-component-border);border-radius:6px;';
    input.placeholder = `请输入「${expect}」`;
    const wrap = document.createElement('div');
    wrap.append(document.createTextNode(message), input);
    let settled = false;
    const finish = (v: boolean): void => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    const dlg = DialogPlugin.confirm({
      header: '再次确认',
      body: wrap,
      confirmBtn: '确定',
      cancelBtn: '取消',
      theme: 'danger',
      onConfirm: () => {
        if (input.value.trim() !== expect) {
          toast('输入不一致，已取消', 'err');
          finish(false);
          dlg.hide();
          return;
        }
        finish(true);
        dlg.hide();
      },
      onCancel: () => {
        finish(false);
        dlg.hide();
      },
      onClose: () => {
        finish(false);
        dlg.hide();
      },
    });
  });
}
