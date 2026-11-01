<script setup lang="ts">
import { computed } from 'vue';
import { useRouter } from 'vue-router';
import { store } from '../core/store';
import { flatten, hoursOf, progressOf } from '../core/tree';
import { toggleTodo } from '../core/actions';
import { PRIORITY_LABEL, PRIORITY_ORDER, QUADRANT_LABEL, type Todo } from '../core/types';
import { dueClass, dueLabel, fmtHours, timeAgo, todayISO, weekStart } from '../core/util';
import { hasAnyData, loadDemoData } from '../core/seed';
import { toast } from '../core/toast';

const router = useRouter();

const today = todayISO();
const todays = computed<Todo[]>(() =>
  store.todos
    .filter((t) => t.date === today)
    .sort((a, b) => Number(a.done) - Number(b.done) || Number(b.pinned) - Number(a.pinned) || a.order - b.order),
);
const doneToday = computed(() => todays.value.filter((t) => t.done).length);
const rate = computed(() => (todays.value.length ? Math.round((doneToday.value / todays.value.length) * 100) : 0));

const activeProjects = computed(() =>
  store.projects.filter((p) => !p.deletedAt && !p.archived && p.status !== 'done'),
);
const avgProgress = computed(() => {
  const list = activeProjects.value;
  if (!list.length) return 0;
  return Math.round(list.reduce((acc, p) => acc + progressOf(p), 0) / list.length);
});
const inboxIdeas = computed(() => store.ideas.filter((i) => i.status === 'inbox'));

const weekStartISO = weekStart();
const weekDoneTasks = computed(() =>
  flatten(store.projects)
    .filter((h) => !h.node.archived && h.node.status === 'done' && h.node.updatedAt.slice(0, 10) >= weekStartISO)
);
const weekHours = computed(() => weekDoneTasks.value.reduce((acc, h) => acc + (h.node.actHours ?? 0), 0));
const weekDoneTodos = computed(
  () => store.todos.filter((t) => t.done && (t.doneAt ?? '').slice(0, 10) >= weekStartISO).length,
);

const topProjects = computed(() =>
  [...activeProjects.value]
    .sort(
      (a, b) =>
        PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] || (a.due ?? '9999').localeCompare(b.due ?? '9999'),
    )
    .slice(0, 5),
);

const hourRows = computed(() => {
  const map = new Map<string, number>();
  for (const hit of weekDoneTasks.value) {
    const hours = hit.node.actHours ?? 0;
    if (!hours) continue;
    map.set(hit.root.title, (map.get(hit.root.title) ?? 0) + hours);
  }
  return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
});
const maxHours = computed(() => (hourRows.value.length ? hourRows.value[0][1] : 1));

const recentIdeas = computed(() =>
  [...store.ideas]
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 4),
);

const hasData = computed(() => hasAnyData());

function onToggle(todo: Todo, value: boolean): void {
  toggleTodo(todo, value);
}

function loadDemo(): void {
  loadDemoData();
  toast('已载入示例数据，随便点着试试');
}
</script>

<template>
  <div>
    <template v-if="!hasData">
      <t-card :bordered="false">
        <div class="welcome">
          <h2>👋 欢迎，这是你的个人工作台</h2>
          <p class="muted">
            数据会以 JSON 文件保存在你指定的文件夹里（默认 E:\vs_code_js\workbench\data），不经过任何外部服务器。
          </p>
          <div class="toolbar">
            <t-button theme="primary" @click="router.push('/projects')">建第一个项目</t-button>
            <t-button variant="outline" @click="loadDemo">先看看示例数据</t-button>
            <t-button variant="outline" @click="router.push('/ideas')">记一条灵感</t-button>
          </div>
        </div>
      </t-card>
    </template>

    <template v-else>
      <div class="stat-grid">
        <t-card :bordered="false" class="stat">
          <div class="stat-label">📌 今日待办</div>
          <div class="stat-value">{{ doneToday }}<span>/{{ todays.length }}</span></div>
          <div class="muted">{{ todays.length ? `完成率 ${rate}%` : '今天还没安排' }}</div>
        </t-card>
        <t-card :bordered="false" class="stat">
          <div class="stat-label">🗂️ 进行中项目</div>
          <div class="stat-value">{{ activeProjects.length }}</div>
          <div class="muted">{{ activeProjects.length ? `平均进度 ${avgProgress}%` : '还没有进行中的项目' }}</div>
        </t-card>
        <t-card :bordered="false" class="stat">
          <div class="stat-label">💡 未处理灵感</div>
          <div class="stat-value">{{ inboxIdeas.length }}</div>
          <div class="muted">灵感库共 {{ store.ideas.length }} 条</div>
        </t-card>
        <t-card :bordered="false" class="stat">
          <div class="stat-label">⏱ 本周工时</div>
          <div class="stat-value">{{ Math.round(weekHours * 10) / 10 }}</div>
          <div class="muted">本周完成 {{ weekDoneTasks.length }} 个任务 · {{ weekDoneTodos }} 条待办</div>
        </t-card>
      </div>

      <div class="grid-2">
        <t-card :bordered="false" title="今天要做的">
          <template #actions>
            <t-button variant="text" size="small" @click="router.push('/todos')">打开今日待办 →</t-button>
          </template>
          <div v-if="todays.length" class="mini-list">
            <div v-for="t in todays.slice(0, 8)" :key="t.id" class="mini-row">
              <t-checkbox :checked="t.done" @change="(v: boolean) => onToggle(t, v)" />
              <div class="mini-main">
                <div class="mini-title" :class="{ done: t.done }">{{ t.title }}</div>
                <div class="mini-meta">
                  <t-tag :theme="t.priority === 'high' ? 'danger' : t.priority === 'mid' ? 'warning' : 'default'" variant="light" size="small">
                    {{ PRIORITY_LABEL[t.priority] }}
                  </t-tag>
                  <t-tag variant="outline" size="small">{{ QUADRANT_LABEL[t.quadrant] }}</t-tag>
                  <t-tag v-if="t.dueTime" variant="outline" size="small">⏰ {{ t.dueTime }}</t-tag>
                </div>
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">今天还没有待办，去「今日待办」加一条吧</div>
        </t-card>

        <t-card :bordered="false" title="重点项目进展">
          <template #actions>
            <t-button variant="text" size="small" @click="router.push('/projects')">项目管理 →</t-button>
          </template>
          <div v-if="topProjects.length" class="proj-list">
            <div v-for="p in topProjects" :key="p.id" class="proj-row">
              <div class="spread">
                <strong class="proj-name">{{ p.title }}</strong>
                <t-tag v-if="p.due" variant="outline" size="small" :theme="dueClass(p.due, p.status === 'done') ? 'warning' : 'default'">
                  {{ dueLabel(p.due, p.status === 'done') }}
                </t-tag>
                <span class="grow" />
                <span class="muted">{{ progressOf(p) }}%</span>
              </div>
              <t-progress :percentage="progressOf(p)" :label="false" :theme="progressOf(p) === 100 ? 'success' : 'line'" />
              <div class="muted">
                预计 {{ fmtHours(hoursOf(p).est) }} / 实际 {{ fmtHours(hoursOf(p).act) }}
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">还没有进行中的项目</div>
        </t-card>
      </div>

      <div class="grid-2 section-gap">
        <t-card :bordered="false" title="本周工作量分布（按项目）">
          <div v-if="hourRows.length" class="bar-list">
            <div v-for="[name, hours] in hourRows" :key="name" class="bar-row">
              <span class="bar-name" :title="name">{{ name }}</span>
              <t-progress :percentage="Math.round((hours / maxHours) * 100)" :label="false" theme="plump" />
              <span class="bar-val">{{ fmtHours(hours) }}</span>
            </div>
          </div>
          <div v-else class="empty-hint">本周还没有登记实际工时。编辑任务时填「实际工时」就会自动汇总。</div>
        </t-card>

        <t-card :bordered="false" title="最近灵感">
          <template #actions>
            <t-button variant="text" size="small" @click="router.push('/ideas')">灵光一闪 →</t-button>
          </template>
          <div v-if="recentIdeas.length" class="ideas-mini">
            <div v-for="idea in recentIdeas" :key="idea.id" class="idea-mini">
              <div class="mini-title">{{ idea.content.split('\n')[0].slice(0, 80) }}</div>
              <div class="mini-meta">
                <span class="muted">{{ timeAgo(idea.createdAt) }}</span>
                <t-tag v-for="tag in idea.tags" :key="tag" size="small" variant="light" theme="primary">#{{ tag }}</t-tag>
              </div>
            </div>
          </div>
          <div v-else class="empty-hint">还没有灵感，去记一条</div>
        </t-card>
      </div>
    </template>
  </div>
</template>

<style scoped>
.welcome h2 {
  margin: 4px 0 8px;
}
.welcome p {
  margin: 0 0 14px;
  line-height: 1.8;
}
.stat-label {
  font-size: 12px;
  color: var(--td-text-color-placeholder);
}
.stat-value {
  font-size: 28px;
  font-weight: 700;
  line-height: 1.3;
  margin: 2px 0;
}
.stat-value span {
  font-size: 14px;
  font-weight: 400;
  color: var(--td-text-color-placeholder);
  margin-left: 4px;
}
.mini-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.mini-row {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}
.mini-main {
  min-width: 0;
  flex: 1;
}
.mini-title {
  font-size: 13px;
  line-height: 1.5;
  word-break: break-word;
}
.mini-title.done {
  color: var(--td-text-color-placeholder);
  text-decoration: line-through;
}
.mini-meta {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-top: 4px;
  align-items: center;
}
.proj-list {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.proj-name {
  font-size: 13px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bar-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.bar-row {
  display: grid;
  grid-template-columns: 150px 1fr 52px;
  gap: 10px;
  align-items: center;
  font-size: 12.5px;
}
.bar-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--td-text-color-secondary);
}
.bar-val {
  text-align: right;
  color: var(--td-text-color-placeholder);
}
.ideas-mini {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.idea-mini {
  border-left: 2px solid var(--td-component-stroke);
  padding-left: 10px;
}
</style>
