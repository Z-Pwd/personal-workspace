/** 多标签页同步：任一标签保存成功后，通知其他标签重新载入 */
const CHANNEL = 'personal-workbench-sync';

export const instanceId = Math.random().toString(36).slice(2, 10);

let channel: BroadcastChannel | null = null;
let onRemote: (() => void) | null = null;

export interface SyncMessage {
  from: string;
  docs: Record<string, number>;
  at: number;
}

/** 初始化（浏览器不支持 BroadcastChannel 时静默降级） */
export function initSync(handler: () => void): void {
  onRemote = handler;
  if (typeof BroadcastChannel === 'undefined') return;
  if (channel) return;
  channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (event: MessageEvent<SyncMessage>) => {
    const msg = event.data;
    if (!msg || msg.from === instanceId) return;
    onRemote?.();
  };
}

/** 保存成功后广播（同一标签页不会收到自己的消息） */
export function broadcastSaved(docs: Record<string, number>): void {
  if (!channel) return;
  channel.postMessage({ from: instanceId, docs, at: Date.now() } satisfies SyncMessage);
}

/** 测试/卸载用 */
export function closeSync(): void {
  channel?.close();
  channel = null;
  onRemote = null;
}
