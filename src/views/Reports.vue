<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { DownloadIcon } from 'tdesign-icons-vue-next';
import BarChart from '../components/BarChart.vue';
import { store } from '../core/store';
import {
  buildReport,
  kindLabel,
  periodOf,
  prevPeriod,
  refreshSnapshot,
  reportOfPeriod,
  sortReports,
  statusLabel,
  summaryLine,
  toMarkdown,
  toPlainText,
} from '../core/report';
import { PRIORITY_LABEL, QUADRANT_LABEL, QUADRANT_ORDER, STATUS_LABEL, type Report, type ReportKind } from '../core/types';
import { addDaysISO, download, dueLabel, fmtHours, nowISO, todayISO } from '../core/util';
import { confirmAction, toast } from '../core/toast';

const route = useRoute();
const router = useRouter();

const kind = ref<ReportKind>('week');
const anchor = ref(todayISO());
const start = ref(periodOf('week', todayISO()).start);
const end = ref(periodOf('week', todayISO()).end);

function syncRange(): void {
  const p = periodOf(kind.value, anchor.value || todayISO());
  start.value = p.start;
  end.value = p.end;
}
watch([kind, anchor], syncRange);

const currentId = computed(() => route.query.id as string | undefined);
const current = computed<Report | null>(() => {
  if (!currentId.value) return null;
  return store.reports.find((r) => r.id === currentId.value) ?? null;
});

const reports = computed(() => sortReports(store.reports));

const thisWeek = periodOf('week', todayISO());
const thisMonth = periodOf('month', todayISO());
const hasWeek = computed(() => !!reportOfPeriod(thisWeek.start, thisWeek.end));
const hasMonth = computed(() => !!reportOfPeriod(thisMonth.start, thisMonth.end));
const isFriday = new Date().getDay() === 5;

const kindOptions = [
  { label: '周报', value: 'week' },
  { label: '月报', value: 'month' },
];

function generate(k: ReportKind, s: string, e: string): void {
  if (!s || !e) {
    toast('请选择起止日期', 'err');
    return;
  }
  if (s > e) {
    toast('开始日期不能晚于结束日期', 'err');
    return;
  }
  const existing = reportOfPeriod(s, e);
  const apply = (): void => {
    let target: Report;
    if (existing) {
      refreshSnapshot(existing);
      target = existing;
    } else {
      target = buildReport(k, s, e);
      store.reports.unshift(target);
    }
    store.touch('reports');
    void router.push({ path: '/reports', query: { id: target.id } });
    toast(existing ? '已重新生成' : '已生成汇报草稿');
  };

  if (existing) {
    void confirmAction(`这个周期已有${statusLabel(existing.status)}，重新生成会刷新自动统计（手写总结保留）。继续？`).then((ok) => {
      if (ok) apply();
    });
    return;
  }
  apply();
}

/* ---------------- 详情 ---------------- */
const metrics = computed(() => current.value?.snapshot.metrics ?? null);
const prevRange = computed(() => (current.value ? prevPeriod(current.value.start, current.value.end) : null));

function toggleStatus(): void {
  const r = current.value;
  if (!r) return;
  r.status = r.status === 'final' ? 'draft' : 'final';
  r.updatedAt = nowISO();
  store.touch('reports');
  toast(r.status === 'final' ? '已标记定稿' : '已改回草稿');
}

function regenerate(): void {
  const r = current.value;
  if (!r) return;
  void confirmAction('重新生成会刷新自动统计（手写内容保留），继续？').then((ok) => {
    if (!ok) return;
    refreshSnapshot(r);
    store.touch('reports');
    toast('已按最新数据刷新');
  });
}

async function removeReport(): Promise<void> {
  const r = current.value;
  if (!r) return;
  if (!(await confirmAction(`删除「${r.title}」？`))) return;
  const i = store.reports.findIndex((x) => x.id === r.id);
  if (i >= 0) store.reports.splice(i, 1);
  store.touch('reports');
  void router.push('/reports');
}

async function exportAs(kindOut: 'md' | 'txt' | 'json'): Promise<void> {
  const r = current.value;
  if (!r) return;
  if (kindOut === 'json') {
    download(`汇报-${r.start}~${r.end}.json`, JSON.stringify(r, null, 2));
    toast('已导出 JSON');
    return;
  }
  const name = `${kindLabel(r.kind)}-${r.start}~${r.end}.${kindOut}`;
  if (kindOut === 'md') download(name, toMarkdown(r), 'text/markdown');
  else download(name, toPlainText(r), 'text/plain');
  toast(`已导出 ${kindOut === 'md' ? 'Markdown' : '纯文本'}`);
}

const exportOptions = [
  { content: 'Markdown (.md)', value: 'md' },
  { content: '纯文本 (.txt)', value: 'txt' },
  { content: 'JSON 备份', value: 'json' },
];

async function copySummary(): Promise<void> {
  const r = current.value;
  if (!r) return;
  const text = summaryLine(r);
  try {
    await navigator.clipboard.writeText(text);
    toast('摘要已复制，可直接粘贴');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.append(ta);
    ta.select();
    document.execCommand('copy');
    ta.remove();
    toast('摘要已复制');
  }
}

function manualInput(key: keyof Report['manual'], value: string): void {
  const r = current.value;
  if (!r) return;
  r.manual[key] = value;
  r.updatedAt = nowISO();
  store.quietTouch('reports');
}

function fillNextPlan(): void {
  const r = current.value;
  if (!r) return;
  const lines = r.snapshot.undoneTodos.map((t) => `- ${t.title}`).join('\n');
  r.manual.nextPlan = r.manual.nextPlan.trim() ? `${r.manual.nextPlan.trim()}\n${lines}` : lines;
  r.updatedAt = nowISO();
  store.quietTouch('reports');
  toast('已把未完成事项填进下期计划');
}

function daysBetween(s: string, e: string): number {
  const a = new Date(`${s}T00:00:00`).getTime();
  const b = new Date(`${e}T00:00:00`).getTime();
  return Math.round((b - a) / 86400000) + 1;
}

async function postponeUndone(): Promise<void> {
  const r = current.value;
  if (!r) return;
  const span = Math.max(1, daysBetween(r.start, r.end));
  const nextStart = addDaysISO(r.end, 1);
  if (!(await confirmAction(`把本期 ${r.snapshot.undoneTodos.length} 条未完成待办顺延到下期（${nextStart} 起，保持原有节奏）？`))) return;
  for (const line of r.snapshot.undoneTodos) {
    const todo = store.todos.find((t) => t.id === line.id);
    if (!todo) continue;
    todo.date = addDaysISO(todo.date, span);
    todo.updatedAt = nowISO();
  }
  store.touch('todos');
  toast('已顺延，记得「重新生成」刷新统计');
}

function delta(now: number, prev: number, unit: string): { cls: string; text: string } {
  const diff = Math.round((now - prev) * 10) / 10;
  if (!prev) return { cls: '', text: now ? '（上期无数据）' : '' };
  return {
    cls: diff > 0 ? 'up' : diff < 0 ? 'down' : '',
    text: `${diff > 0 ? '↑' : diff < 0 ? '↓' : '→'} ${Math.abs(diff)}${unit}`,
  };
}
</script>

<template>
  <div>
    <!-- ============ 列表页 ============ -->
    <template v-if="!current">
      <t-card :bordered="false" title="生成汇报" class="gen-card">
        <template #actions>
          <span class="muted">起止日期可自定义</span>
        </template>
        <div class="toolbar" style="margin-bottom: 8px">
          <t-radio-group v-model="kind" variant="outline">
            <t-radio-button value="week">周报</t-radio-button>
            <t-radio-button value="month">月报</t-radio-button>
          </t-radio-group>
          <span class="muted">基准日期</span>
          <t-date-picker v-model="anchor" style="width: 150px" />
          <t-date-picker v-model="start" style="width: 150px" />
          <span class="muted">~</span>
          <t-date-picker v-model="end" style="width: 150px" />
          <span class="grow" />
          <t-button theme="primary" @click="generate(kind, start, end)">一键生成</t-button>
        </div>
        <p class="muted" style="margin: 0">
          统计口径：待办按「归属日期」计入本期；任务按「最近更新时间」判断本期完成；工时取任务的「实际工时」。生成后自动统计只读，主观总结可直接在页面上写。
        </p>
      </t-card>

      <div v-if="!hasWeek" class="callout">
        <div class="callout-body">
          <strong>{{ isFriday ? '今天是周五，该写周报了' : '本周还没有生成汇报' }}</strong>
          <div class="muted">本周范围 {{ thisWeek.start }} ~ {{ thisWeek.end }}，点右侧按钮一键汇总本周数据。</div>
        </div>
        <t-button size="small" theme="primary" @click="generate('week', thisWeek.start, thisWeek.end)">
          生成本周周报
        </t-button>
      </div>

      <div v-if="!hasMonth" class="callout">
        <div class="callout-body">
          <strong>本月还没有生成月报</strong>
          <div class="muted">本月范围 {{ thisMonth.start }} ~ {{ thisMonth.end }}。</div>
        </div>
        <t-button size="small" variant="outline" @click="generate('month', thisMonth.start, thisMonth.end)">
          生成本月月报
        </t-button>
      </div>

      <t-card :bordered="false" title="历史汇报">
        <template #actions>
          <span class="muted">{{ reports.length }} 份</span>
        </template>
        <div v-if="!reports.length" class="empty-hint">
          <span class="big">📝</span>
          还没有历史汇报。上面选好周期点「一键生成」，或者先攒几天项目和待办数据。
        </div>
        <div v-for="r in reports" :key="r.id" class="report-row">
          <div class="grow">
            <div class="spread" style="flex-wrap: wrap">
              <strong style="font-size: 13.5px">{{ r.title }}</strong>
              <t-tag variant="outline" size="small">{{ kindLabel(r.kind) }}</t-tag>
              <t-tag :theme="r.status === 'final' ? 'success' : 'warning'" variant="light" size="small">
                {{ statusLabel(r.status) }}
              </t-tag>
            </div>
            <div class="muted">
              完成率 {{ r.snapshot.metrics.todoRate }}%（{{ r.snapshot.metrics.todoDone }}/{{ r.snapshot.metrics.todoTotal }}）
              · 工时 {{ r.snapshot.metrics.hoursAct }}h · 更新于 {{ r.updatedAt.slice(0, 16).replace('T', ' ') }}
            </div>
          </div>
          <t-button size="small" theme="primary" @click="router.push({ path: '/reports', query: { id: r.id } })">打开</t-button>
          <t-button
            size="small"
            variant="outline"
            @click="router.push({ path: '/reports', query: { id: r.id } })"
          >
            导出
          </t-button>
        </div>
      </t-card>
    </template>

    <!-- ============ 详情页 ============ -->
    <template v-else-if="current && metrics">
      <t-card :bordered="false" class="detail-head">
        <div class="toolbar" style="margin-bottom: 10px">
          <strong class="detail-title">{{ current.title }}</strong>
          <t-tag :theme="current.status === 'final' ? 'success' : 'warning'" variant="light" size="small">
            {{ statusLabel(current.status) }}
          </t-tag>
          <span class="muted">生成于 {{ current.generatedAt.slice(0, 16).replace('T', ' ') }}</span>
          <span class="grow" />
          <t-button size="small" variant="outline" @click="router.push('/reports')">← 列表</t-button>
          <t-button size="small" variant="outline" @click="copySummary">复制摘要</t-button>
          <t-dropdown :options="exportOptions" trigger="click" @click="(d: { value?: string }) => exportAs((d.value ?? 'md') as 'md' | 'txt' | 'json')">
            <t-button size="small" variant="outline">
              <template #icon><DownloadIcon /></template>
              导出
            </t-button>
          </t-dropdown>
          <t-button size="small" variant="outline" @click="toggleStatus">{{ current.status === 'final' ? '改回草稿' : '标记定稿' }}</t-button>
          <t-button size="small" variant="outline" @click="regenerate">重新生成</t-button>
          <t-button size="small" theme="danger" variant="text" @click="removeReport">删除</t-button>
        </div>

        <div class="kpi-grid">
          <div class="kpi-ring">
            <t-progress
              theme="circle"
              :percentage="metrics.todoRate"
              :label="`${metrics.todoRate}%`"
              :size="120"
              :color="metrics.todoRate >= 100 ? 'var(--td-success-color)' : 'var(--td-brand-color)'"
            />
            <div class="muted">{{ metrics.todoDone }} / {{ metrics.todoTotal }} 条待办</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">完成任务</div>
            <div class="kpi-value">{{ metrics.taskDone }}</div>
            <div class="muted">当前仍有 {{ metrics.taskOpen }} 个未完成</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">实际工时</div>
            <div class="kpi-value">{{ Math.round(metrics.hoursAct * 10) / 10 }}h</div>
            <div class="muted">预计 {{ Math.round(metrics.hoursEst * 10) / 10 }}h</div>
          </div>
          <div class="kpi">
            <div class="kpi-label">灵感</div>
            <div class="kpi-value">{{ metrics.ideaNew }}</div>
            <div class="muted">本期新增，转成行动 {{ metrics.ideaAdopted }} 条</div>
          </div>
        </div>

        <div class="compare">
          <span>待办完成 {{ metrics.todoDone }} 条 <em :class="delta(metrics.todoDone, metrics.prevTodoDone, '条').cls">{{ delta(metrics.todoDone, metrics.prevTodoDone, '条').text }}</em></span>
          <span>完成率 {{ metrics.todoRate }}% <em :class="delta(metrics.todoRate, metrics.prevTodoRate, '%').cls">{{ delta(metrics.todoRate, metrics.prevTodoRate, '%').text }}</em></span>
          <span>实际工时 {{ Math.round(metrics.hoursAct * 10) / 10 }}h <em :class="delta(metrics.hoursAct, metrics.prevHoursAct, 'h').cls">{{ delta(metrics.hoursAct, metrics.prevHoursAct, 'h').text }}</em></span>
          <span class="muted" v-if="prevRange">对比区间 {{ prevRange.start }} ~ {{ prevRange.end }}</span>
        </div>
      </t-card>

      <div class="grid-2 section-gap">
        <t-card :bordered="false" title="重点项目进展">
          <div v-if="!current.snapshot.projects.length" class="empty-hint">本期没有进行中的项目</div>
          <div v-for="p in current.snapshot.projects" :key="p.id" class="proj-row">
            <div class="spread">
              <strong class="proj-name">{{ p.title }}</strong>
              <t-tag variant="light" size="small">{{ STATUS_LABEL[p.status] }}</t-tag>
              <t-tag v-if="p.due" variant="outline" size="small">{{ dueLabel(p.due, p.status === 'done') }}</t-tag>
              <span class="grow" />
              <span class="muted">本期完成 {{ p.doneInPeriod }} · {{ fmtHours(p.hoursAct) }}</span>
              <span class="muted">{{ p.progress }}%</span>
            </div>
            <t-progress :percentage="p.progress" :label="false" :theme="p.progress === 100 ? 'success' : 'line'" />
          </div>
        </t-card>

        <t-card :bordered="false" title="每日工时分布">
          <template #actions><span class="muted">按任务完成日期统计</span></template>
          <BarChart :data="current.snapshot.dailyHours.map((d) => ({ label: d.date.slice(5), value: d.hours }))" unit="h" />
        </t-card>
      </div>

      <t-card :bordered="false" title="待办完成情况" class="section-gap">
        <template #actions>
          <div class="spread">
            <span class="muted">未完成 {{ current.snapshot.undoneTodos.length }} 条</span>
            <t-button
              v-if="current.snapshot.undoneTodos.length"
              size="small"
              variant="outline"
              @click="postponeUndone"
            >
              顺延到下期
            </t-button>
          </div>
        </template>

        <div class="quad-grid">
          <div v-for="q in QUADRANT_ORDER" :key="q" class="quad-cell">
            <div class="muted">{{ QUADRANT_LABEL[q] }}</div>
            <div class="quad-num">
              {{ metrics.todoQuadrants[q] }}<small> / 完成 {{ metrics.todoQuadrantDone[q] }}</small>
            </div>
          </div>
        </div>

        <div v-if="current.snapshot.undoneTodos.length" class="undone-list">
          <div class="muted" style="margin: 10px 0 4px">未完成事项</div>
          <div v-for="t in current.snapshot.undoneTodos" :key="t.id" class="report-line">
            <span class="line-title">{{ t.title }}</span>
            <t-tag variant="outline" size="small">{{ QUADRANT_LABEL[t.quadrant] }}</t-tag>
            <t-tag v-if="t.dueTime" variant="outline" size="small">计划 {{ t.dueTime }}</t-tag>
            <span v-if="t.note" class="muted ellipsis">{{ t.note }}</span>
          </div>
        </div>
        <p v-else class="muted">本期待办全部完成 🎉</p>
      </t-card>

      <div class="grid-2 section-gap">
        <t-card :bordered="false" title="灵感与沉淀">
          <template #actions>
            <span class="muted">新增 {{ metrics.ideaNew }} · 转化 {{ metrics.ideaAdopted }}</span>
          </template>
          <div v-if="!current.snapshot.ideas.length" class="empty-hint">本期没有新增灵感</div>
          <div v-for="i in current.snapshot.ideas" :key="i.id" class="report-line">
            <span class="line-title">{{ i.content.split('\n')[0] }}</span>
            <t-tag v-if="i.convertedTo" theme="success" variant="light" size="small">已转{{ i.convertedTo }}</t-tag>
            <t-tag v-else variant="outline" size="small">未处理</t-tag>
          </div>
        </t-card>

        <t-card :bordered="false" title="下期要盯的任务">
          <div v-if="!current.snapshot.undoneTasks.length" class="empty-hint">没有临近截止的未完成任务</div>
          <div v-for="t in current.snapshot.undoneTasks" :key="t.id" class="report-line">
            <span class="line-title">{{ t.title }}</span>
            <t-tag :theme="t.priority === 'high' ? 'danger' : 'default'" variant="light" size="small">
              {{ PRIORITY_LABEL[t.priority] }}
            </t-tag>
            <span class="muted">{{ t.project }}</span>
            <span v-if="t.due" class="muted">{{ dueLabel(t.due) }}</span>
          </div>
        </t-card>
      </div>

      <t-card :bordered="false" title="手动补充" class="section-gap">
        <template #actions><span class="muted">边打字边自动保存，不用点保存按钮</span></template>
        <t-row :gutter="14">
          <t-col :span="6">
            <div class="field-label">本期总结</div>
            <t-textarea
              :value="current.manual.summary"
              :autosize="{ minRows: 4, maxRows: 10 }"
              placeholder="这个周期做成了什么？有什么变化？"
              @change="(v: string) => manualInput('summary', v)"
            />
          </t-col>
          <t-col :span="6">
            <div class="field-label">亮点 / 值得说的成绩</div>
            <t-textarea
              :value="current.manual.highlights"
              :autosize="{ minRows: 4, maxRows: 10 }"
              placeholder="例如：把盘点流程从 3 天压缩到 1 天"
              @change="(v: string) => manualInput('highlights', v)"
            />
          </t-col>
        </t-row>
        <t-row :gutter="14" style="margin-top: 12px">
          <t-col :span="6">
            <div class="field-label">风险与问题</div>
            <t-textarea
              :value="current.manual.risks"
              :autosize="{ minRows: 3, maxRows: 8 }"
              placeholder="卡在哪、需要谁支持"
              @change="(v: string) => manualInput('risks', v)"
            />
          </t-col>
          <t-col :span="6">
            <div class="field-label">下期计划</div>
            <t-textarea
              :value="current.manual.nextPlan"
              :autosize="{ minRows: 3, maxRows: 8 }"
              placeholder="下一周期最重要的一到三件事"
              @change="(v: string) => manualInput('nextPlan', v)"
            />
            <t-button v-if="current.snapshot.undoneTodos.length" size="small" variant="text" @click="fillNextPlan">
              ＋ 带入本期未完成事项
            </t-button>
          </t-col>
        </t-row>
        <p class="muted" style="margin: 12px 0 0">
          数据快照生成于 {{ current.generatedAt.slice(0, 16).replace('T', ' ') }}；之后新增的数据需要点「重新生成」才会进统计。JSON 存到 data/reports.json。
        </p>
      </t-card>
    </template>
  </div>
</template>

<style scoped>
.gen-card {
  margin-bottom: 12px;
}
.callout {
  display: flex;
  align-items: center;
  gap: 14px;
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-left: 3px solid var(--td-brand-color);
  border-radius: var(--td-radius-medium);
  padding: 12px 16px;
  margin-bottom: 12px;
  box-shadow: var(--td-shadow-1);
}
.callout-body {
  flex: 1;
  min-width: 0;
}
.callout-body strong {
  font-size: 13.5px;
}
.grow {
  flex: 1;
}
.report-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 6px;
  border-bottom: 1px dashed var(--td-component-stroke);
  flex-wrap: wrap;
}
.report-row:last-child {
  border-bottom: 0;
}
.report-row:hover {
  background: var(--td-bg-color-container-hover);
}
.detail-head :deep(.t-card__body) {
  padding-bottom: 8px;
}
.detail-title {
  font-size: 15px;
}
.kpi-grid {
  display: grid;
  grid-template-columns: 170px 1fr 1fr 1fr;
  gap: 14px;
  align-items: center;
  padding: 8px 0 4px;
}
.kpi-ring {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.kpi-label {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
.kpi-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.3;
}
.compare {
  display: flex;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px dashed var(--td-component-stroke);
  font-size: 12.5px;
  color: var(--td-text-color-secondary);
}
.compare em {
  font-style: normal;
  font-weight: 600;
  margin-left: 6px;
  color: var(--td-text-color-placeholder);
}
.compare em.up {
  color: var(--td-success-color);
}
.compare em.down {
  color: var(--td-error-color);
}
.proj-row {
  margin-bottom: 12px;
}
.proj-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.quad-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
}
.quad-cell {
  background: var(--td-bg-color-secondarycontainer);
  border-radius: var(--td-radius-default);
  padding: 8px 10px;
}
.quad-num {
  font-size: 18px;
  font-weight: 700;
}
.quad-num small {
  font-size: 11px;
  font-weight: 400;
  color: var(--td-text-color-placeholder);
}
.report-line {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 0;
  border-bottom: 1px dashed var(--td-component-stroke);
  font-size: 12.5px;
}
.report-line:last-child {
  border-bottom: 0;
}
.line-title {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.ellipsis {
  max-width: 40%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.field-label {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
  margin-bottom: 4px;
}
@media (max-width: 1080px) {
  .kpi-grid {
    grid-template-columns: 1fr 1fr;
  }
  .quad-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>
