<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { api, type BackupFile } from '../core/api';
import { loadDemoData } from '../core/seed';
import { store } from '../core/store';
import { applyTheme, theme } from '../core/theme';
import { fmtDateTime, nowISO } from '../core/util';
import BulkImportDialog from '../components/BulkImportDialog.vue';
import PromptDialog from '../components/PromptDialog.vue';
import { askNotifyPermission, loadReminder, saveReminder, type ReminderPrefs } from '../core/reminder';
import { confirmAction, toast } from '../core/toast';

const dataDir = ref(store.dataDir);
const backups = ref<BackupFile[]>([]);
const backupDir = ref('');
const backupVisible = ref(false);

const isDark = computed(() => theme.value === 'dark');

async function saveDir(): Promise<void> {
  const dir = dataDir.value.trim();
  if (!dir) {
    toast('路径不能为空', 'err');
    return;
  }
  if (dir === store.dataDir) {
    toast('路径没有变化', 'info');
    return;
  }
  const ok = await confirmAction(
    `切换数据文件夹到：\n${dir}\n\n新文件夹里如果还没有数据，页面会变成空的（旧文件夹的文件不会被删除，可以再切回来）。`,
  );
  if (!ok) return;
  try {
    const res = await api.setDataDir(dir);
    store.dataDir = res.dataDir;
    await store.reloadAll();
    toast('数据目录已切换');
  } catch (err) {
    toast((err as Error).message, 'err');
  }
}

async function openFolder(target: 'data' | 'app'): Promise<void> {
  try {
    await api.openFolder(target);
  } catch (err) {
    toast((err as Error).message, 'err');
  }
}

async function backupNow(): Promise<void> {
  try {
    const res = await api.backupAll();
    toast(`已备份到：${res.file}`);
  } catch (err) {
    toast((err as Error).message, 'err');
  }
}

async function showBackups(): Promise<void> {
  try {
    const res = await api.listBackups();
    backups.value = res.files.slice(0, 60);
    backupDir.value = res.dir;
    backupVisible.value = true;
  } catch (err) {
    toast((err as Error).message, 'err');
  }
}

function exportAll(): void {
  void store.flush().then(() => {
    const payload = {
      kind: 'workbench-full-backup',
      exportedAt: nowISO(),
      docs: {
        projects: { rev: store.revs.projects, items: store.projects },
        todos: { rev: store.revs.todos, items: store.todos },
        ideas: { rev: store.revs.ideas, items: store.ideas },
        reports: { rev: store.revs.reports, items: store.reports },
      },
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `工作台全量导出-${nowISO().slice(0, 10)}.json`;
    document.body.append(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2000);
    toast('已导出全部数据');
  });
}

const fileInput = ref<HTMLInputElement | null>(null);
const importState = reactive({ busy: false });

function pickFile(): void {
  fileInput.value?.click();
}

async function onFile(e: Event): Promise<void> {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  importState.busy = true;
  try {
    const raw = JSON.parse(await file.text()) as Record<string, unknown>;
    const docs = (raw.docs ?? raw) as Record<string, unknown>;
    const pick = (name: string): unknown[] | null => {
      const entry = docs[name] as { items?: unknown } | unknown[] | undefined;
      if (Array.isArray(entry)) return entry;
      if (entry && typeof entry === 'object' && Array.isArray((entry as { items?: unknown }).items)) {
        return (entry as { items: unknown[] }).items;
      }
      return null;
    };
    const projects = pick('projects');
    const todos = pick('todos');
    const ideas = pick('ideas');
    const reports = pick('reports');
    if (!projects && !todos && !ideas && !reports) {
      toast('文件里没有可识别的数据（需要 projects / todos / ideas / reports 字段）', 'err');
      return;
    }
    const summary = [
      projects ? `项目 ${projects.length} 个` : null,
      todos ? `待办 ${todos.length} 条` : null,
      ideas ? `灵感 ${ideas.length} 条` : null,
      reports ? `汇报 ${reports.length} 份` : null,
    ]
      .filter(Boolean)
      .join('，');
    if (!(await confirmAction(`将用文件内容覆盖当前数据（${summary}）。建议先「导出全部数据」留一手。继续？`))) return;

    await store.flush();
    if (projects) store.revs.projects = (await api.putDoc('projects', store.revs.projects, projects)).rev;
    if (todos) store.revs.todos = (await api.putDoc('todos', store.revs.todos, todos)).rev;
    if (ideas) store.revs.ideas = (await api.putDoc('ideas', store.revs.ideas, ideas)).rev;
    if (reports) store.revs.reports = (await api.putDoc('reports', store.revs.reports, reports)).rev;
    await store.reloadAll();
    dataDir.value = store.dataDir;
    toast('导入完成');
  } catch (err) {
    toast(`导入失败：${(err as Error).message}`, 'err');
  } finally {
    importState.busy = false;
    if (fileInput.value) fileInput.value.value = '';
  }
}

async function clearTrash(): Promise<void> {
  if (!(await confirmAction('彻底删除回收站里的所有内容？'))) return;
  const purge = (nodes: typeof store.projects): void => {
    for (let i = nodes.length - 1; i >= 0; i--) {
      if (nodes[i].deletedAt) nodes.splice(i, 1);
      else purge(nodes[i].children);
    }
  };
  purge(store.projects);
  store.touch('projects');
  toast('回收站已清空');
}

const reminder = reactive<ReminderPrefs>(loadReminder());
const weekdayOptions = [
  { label: '周日', value: 0 },
  { label: '周一', value: 1 },
  { label: '周二', value: 2 },
  { label: '周三', value: 3 },
  { label: '周四', value: 4 },
  { label: '周五', value: 5 },
  { label: '周六', value: 6 },
];
const notifyState = ref(
  typeof Notification === 'undefined' ? '浏览器不支持' : Notification.permission === 'granted' ? '已授权' : Notification.permission === 'denied' ? '已被拒绝（需在浏览器设置里改）' : '未授权',
);

watch(
  reminder,
  (v) => {
    saveReminder({ ...v });
  },
  { deep: true },
);

async function onAskNotify(): Promise<void> {
  const r = await askNotifyPermission();
  notifyState.value = r === 'granted' ? '已授权' : r === 'denied' ? '已被拒绝（需在浏览器设置里改）' : r === 'unsupported' ? '浏览器不支持' : '未授权';
  toast(r === 'granted' ? '已开启系统通知' : '未获得通知权限，仍会在页面内提示', r === 'granted' ? 'ok' : 'info');
}

const clearPromptVisible = ref(false);
const bulkVisible = ref(false);

/** 第一步：普通确认；第二步：输入「清空」二次确认（用组件渲染，避免插件 body 传 DOM 的坑） */
async function clearAll(): Promise<void> {
  if (!(await confirmAction('清空全部数据？操作前会自动做一次全量备份。'))) return;
  clearPromptVisible.value = true;
}

/** 第二步确认后真正执行清空，并回读校验 */
async function doClearAll(): Promise<void> {
  clearPromptVisible.value = false;
  let backed = true;
  try {
    await api.backupAll();
  } catch {
    backed = false;
  }
  store.projects = [];
  store.todos = [];
  store.ideas = [];
  store.reports = [];
  store.templates = [];
  store.touch('projects');
  store.touch('todos');
  store.touch('ideas');
  store.touch('reports');
  store.touch('templates');
  await store.flush();
  const left = store.projects.length + store.todos.length + store.ideas.length + store.reports.length + store.templates.length;
  if (left === 0) toast(backed ? '已清空全部数据（已自动备份）' : '已清空（备份失败，请注意）', backed ? 'ok' : 'err');
  else toast(`清空未完成，仍有 ${left} 条数据`, 'err');
}

function loadDemo(): void {
  loadDemoData();
  toast('已载入示例数据');
}

function onThemeChange(value: boolean): void {
  applyTheme(value ? 'dark' : 'light');
  toast(value ? '已切到深色模式' : '已切到浅色模式', 'info');
}
</script>

<template>
  <div>
    <div class="grid-2">
      <t-card :bordered="false" title="数据存储">
        <t-form :label-width="0">
          <t-form-item label="JSON 保存位置" label-align="top">
            <t-input v-model="dataDir" placeholder="例如 E:\我的工作数据" />
          </t-form-item>
        </t-form>
        <p class="muted" style="margin: 0 0 10px">
          四个文件：projects.json / todos.json / ideas.json / reports.json，另有 _backups 备份目录。
        </p>
        <div class="toolbar" style="margin-bottom: 0">
          <t-button theme="primary" @click="saveDir">保存路径</t-button>
          <t-button variant="outline" @click="openFolder('data')">打开文件夹</t-button>
          <t-button variant="outline" @click="openFolder('app')">打开程序目录</t-button>
        </div>
      </t-card>

      <t-card :bordered="false" title="备份与导出">
        <div class="toolbar" style="margin-top: 0">
          <t-button theme="primary" @click="backupNow">立即全量备份</t-button>
          <t-button variant="outline" @click="showBackups">查看备份列表</t-button>
          <t-button variant="outline" @click="exportAll">导出全部数据</t-button>
          <t-button variant="outline" :loading="importState.busy" @click="pickFile">导入数据</t-button>
          <t-button variant="outline" data-test="open-bulk" @click="bulkVisible = true">从文本批量导入</t-button>
          <input ref="fileInput" type="file" accept="application/json,.json" hidden @change="onFile" />
        </div>
        <p class="muted" style="margin: 0">
          每次保存前会自动留一份快照（同一文件 5 分钟内最多一份，最多保留 60 份）。
        </p>
      </t-card>
    </div>

    <div class="grid-2 section-gap">
      <t-card :bordered="false" title="外观与体验">
        <div class="setting-row">
          <div>
            <div class="setting-label">深色模式</div>
            <div class="muted">夜间用眼更舒服，设置记在本机</div>
          </div>
          <t-switch :value="isDark" @change="onThemeChange" />
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">自动保存</div>
            <div class="muted">任何改动 0.4 秒后写入 JSON 文件</div>
          </div>
          <t-tag theme="success" variant="light" size="small">已开启</t-tag>
        </div>
        <div class="setting-row">
          <div>
            <div class="setting-label">加载示例数据</div>
            <div class="muted">会往当前数据里追加一组演示内容</div>
          </div>
          <t-button size="small" variant="outline" @click="loadDemo">载入</t-button>
        </div>
      </t-card>

      <t-card :bordered="false" title="关于">
        <p style="margin-top: 0">个人工作台 v2.0 · Vue 3 + TDesign（腾讯开源组件库）</p>
        <ul class="about-list">
          <li>projects.json：项目树，子任务嵌套在 children 里</li>
          <li>todos.json：待办，按 date 区分每天</li>
          <li>ideas.json：灵感，带标签与状态</li>
          <li>reports.json：周报 / 月报存档（统计快照 + 手写内容）</li>
          <li>每个文件都有 rev 版本号，多标签页同时开会提示冲突，不会互相覆盖</li>
        </ul>
      </t-card>
    </div>

    <t-card :bordered="false" title="提醒" class="section-gap">
      <div class="setting-row">
        <div>
          <div class="setting-label">定时提醒</div>
          <div class="muted">到点在页面里弹提示；授权后同时发系统通知</div>
        </div>
        <t-switch v-model="reminder.enabled" data-test="reminder-toggle" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">每周提醒（写周报）</div>
          <div class="muted">默认周五 17:00</div>
        </div>
        <div class="spread">
          <t-select
            v-model="reminder.weekday"
            :options="weekdayOptions"
            style="width: 104px"
            :disabled="!reminder.enabled"
            data-test="reminder-weekday"
          />
          <t-time-picker
            v-model="reminder.time"
            format="HH:mm"
            style="width: 116px"
            :disabled="!reminder.enabled"
            data-test="reminder-time"
          />
        </div>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">月末提醒（写月报）</div>
          <div class="muted">每月最后一天同一时间提醒</div>
        </div>
        <t-switch v-model="reminder.monthEnd" :disabled="!reminder.enabled" data-test="reminder-monthend" />
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">系统通知</div>
          <div class="muted">当前：{{ notifyState }}</div>
        </div>
        <t-button size="small" variant="outline" data-test="ask-notify" @click="onAskNotify">申请通知权限</t-button>
      </div>
    </t-card>

    <t-card :bordered="false" title="危险操作" class="section-gap">
      <div class="setting-row">
        <div>
          <div class="setting-label">清空回收站</div>
          <div class="muted">彻底删除项目回收站里的内容</div>
        </div>
        <t-button size="small" theme="danger" variant="outline" @click="clearTrash">清空</t-button>
      </div>
      <div class="setting-row">
        <div>
          <div class="setting-label">清空全部数据</div>
          <div class="muted">项目、待办、灵感、汇报全部清空（会先自动备份一次）</div>
        </div>
        <t-button size="small" theme="danger" variant="outline" @click="clearAll">清空</t-button>
      </div>
    </t-card>

    <BulkImportDialog v-model:visible="bulkVisible" />

    <PromptDialog
      :visible="clearPromptVisible"
      :message="'这是不可撤销的操作，请输入「清空」两个字确认：'"
      expect="清空"
      confirm-text="确定清空"
      @update:visible="clearPromptVisible = $event"
      @cancel="clearPromptVisible = false"
      @confirm="doClearAll"
    />

    <t-dialog v-model:visible="backupVisible" header="备份文件列表" width="640px" :footer="false"
    destroy-on-close
  >
      <p class="muted" style="margin-top: 0">目录：{{ backupDir }}</p>
      <div class="backup-list">
        <div v-for="f in backups" :key="f.file" class="backup-row">
          <span class="mono">{{ f.file }}</span>
          <span class="muted">{{ fmtDateTime(f.mtime) }} · {{ (f.size / 1024).toFixed(1) }} KB</span>
        </div>
        <div v-if="!backups.length" class="empty-hint">还没有备份文件</div>
      </div>
      <p class="muted" style="margin-bottom: 0">
        恢复方式：把备份文件复制回数据文件夹并改名为 projects.json / todos.json / ideas.json / reports.json。
      </p>
      <div class="dialog-foot">
        <t-button variant="outline" @click="backupVisible = false">关闭</t-button>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.setting-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 12px 0;
  border-bottom: 1px dashed var(--td-component-stroke);
}
.setting-row:last-child {
  border-bottom: 0;
}
.setting-label {
  font-size: 13px;
  font-weight: 500;
}
.about-list {
  margin: 8px 0 0;
  padding-left: 18px;
  line-height: 2;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.backup-list {
  max-height: 46vh;
  overflow-y: auto;
}
.backup-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--td-component-stroke);
  font-size: 12px;
}
.mono {
  font-family: var(--td-font-family-medium);
  word-break: break-all;
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  margin-top: 12px;
}

/* 窄屏：设置项允许换行，按钮不被挤 */
@media (max-width: 767px) {
  .setting-row {
    flex-wrap: wrap;
    align-items: flex-start;
  }
  .setting-row > div {
    min-width: 0;
    flex: 1 1 auto;
  }
  /* 单独占一行的开关/标签不要被拉满 */
  .setting-row > .t-tag,
  .setting-row > .t-switch {
    flex: 0 0 auto;
  }
}
</style>
