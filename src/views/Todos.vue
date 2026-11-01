<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, reactive, ref, watch } from 'vue';
import { AddIcon, ChevronLeftIcon, ChevronRightIcon } from 'tdesign-icons-vue-next';
import TodoCard from '../components/TodoCard.vue';
import TodoDialog from '../components/TodoDialog.vue';
import { addTaskToToday, toggleTodo } from '../core/actions';
import { newTodo, nextOrder, store } from '../core/store';
import { flatten, quadrantOf } from '../core/tree';
import {
  PRIORITY_LABEL,
  QUADRANT_LABEL,
  QUADRANT_ORDER,
  type Priority,
  type Quadrant,
  type Todo,
} from '../core/types';
import { addDaysISO, dateLabelCN, nowISO, todayISO } from '../core/util';
import { confirmAction, toast } from '../core/toast';
import { clearFocus, focusTarget } from '../core/focus';

const VIEW_KEY = 'wb.todos.view';
const viewDate = ref(todayISO());
const mode = ref<'board' | 'list'>((localStorage.getItem(VIEW_KEY) as 'board' | 'list') || 'board');
const tagFilter = ref<string | null>(null);
const dragId = ref<string | null>(null);
const reminded = new Set<string>();

const dialog = reactive({ visible: false, todo: null as Todo | null });
const picker = reactive({ visible: false, taskId: '' });

const priorityOptions = [
  { label: '高优先', value: 'high' },
  { label: '中优先', value: 'mid' },
  { label: '低优先', value: 'low' },
];
const quadrantOptions = QUADRANT_ORDER.map((q) => ({ label: QUADRANT_LABEL[q], value: q }));

const quick = reactive({ title: '', priority: 'mid' as Priority, quadrant: 'q2' as Quadrant });

const items = computed<Todo[]>(() =>
  store.todos
    .filter((t) => t.date === viewDate.value)
    .filter((t) => !tagFilter.value || t.tags.includes(tagFilter.value))
    .sort((a, b) => a.order - b.order),
);

const doneCount = computed(() => items.value.filter((t) => t.done).length);
const rate = computed(() => (items.value.length ? Math.round((doneCount.value / items.value.length) * 100) : 0));
const pendingCount = computed(() => items.value.filter((t) => !t.done).length);

const allTags = computed(() => {
  const set = new Set<string>();
  for (const t of store.todos.filter((x) => x.date === viewDate.value)) for (const tag of t.tags) set.add(tag);
  return [...set];
});

const grouped = computed(() =>
  QUADRANT_ORDER.map((q) => ({
    quadrant: q,
    label: QUADRANT_LABEL[q],
    items: items.value
      .filter((t) => t.quadrant === q)
      .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order),
  })),
);

function setMode(next: 'board' | 'list'): void {
  mode.value = next;
  localStorage.setItem(VIEW_KEY, next);
}

function shift(days: number): void {
  viewDate.value = addDaysISO(viewDate.value, days);
}

function addQuick(): void {
  const title = quick.title.trim();
  if (!title) return;
  const todo = newTodo(viewDate.value, {
    title,
    priority: quick.priority,
    quadrant: quick.quadrant,
    order: nextOrder(store.todos, viewDate.value, quick.quadrant),
  });
  store.todos.push(todo);
  store.touch('todos');
  quick.title = '';
  toast('已添加');
}

function onToggle(todo: Todo, value: boolean): void {
  toggleTodo(todo, value);
}

function onPin(todo: Todo): void {
  todo.pinned = !todo.pinned;
  todo.updatedAt = nowISO();
  store.touch('todos');
}

async function onRemove(todo: Todo): Promise<void> {
  if (!(await confirmAction(`删除待办「${todo.title}」？`))) return;
  const i = store.todos.findIndex((x) => x.id === todo.id);
  if (i >= 0) store.todos.splice(i, 1);
  store.touch('todos');
  toast('已删除');
}

function openEdit(todo: Todo): void {
  dialog.todo = todo;
  dialog.visible = true;
}

function openCreate(): void {
  dialog.todo = null;
  dialog.visible = true;
}

/* ---------------- 拖拽 ---------------- */
function onDragStart(e: DragEvent, todo: Todo): void {
  dragId.value = todo.id;
  e.dataTransfer?.setData('text/plain', todo.id);
  if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(): void {
  dragId.value = null;
}

function onDropColumn(q: Quadrant): void {
  const todo = store.todos.find((t) => t.id === dragId.value);
  dragId.value = null;
  if (!todo || todo.quadrant === q) return;
  todo.quadrant = q;
  todo.order = nextOrder(store.todos, todo.date, q);
  todo.updatedAt = nowISO();
  store.touch('todos');
  toast(`已移到「${QUADRANT_LABEL[q]}」`, 'info');
}

function onDropCard(target: Todo): void {
  const dragged = store.todos.find((t) => t.id === dragId.value);
  dragId.value = null;
  if (!dragged || dragged.id === target.id) return;
  const list = store.todos
    .filter((t) => t.date === viewDate.value && t.quadrant === target.quadrant && t.id !== dragged.id)
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || a.order - b.order);
  const idx = list.findIndex((t) => t.id === target.id);
  dragged.quadrant = target.quadrant;
  list.splice(idx < 0 ? list.length : idx, 0, dragged);
  list.forEach((t, i) => {
    t.order = i + 1;
  });
  dragged.updatedAt = nowISO();
  store.touch('todos');
}

/* ---------------- 顺延 ---------------- */
async function postpone(): Promise<void> {
  const pending = items.value.filter((t) => !t.done);
  if (!pending.length) {
    toast('这一天没有未完成待办', 'info');
    return;
  }
  const next = addDaysISO(viewDate.value, 1);
  if (!(await confirmAction(`把 ${pending.length} 条未完成待办顺延到 ${next}？`))) return;
  for (const t of pending) {
    t.date = next;
    t.order = nextOrder(store.todos, next, t.quadrant);
    t.updatedAt = nowISO();
  }
  store.touch('todos');
  toast(`已顺延 ${pending.length} 条到 ${next}`);
}

/* ---------------- 从项目引入 ---------------- */
const projectOptions = computed(() =>
  flatten(store.projects)
    .filter((hit) => hit.node.status !== 'done' && !hit.node.archived)
    .map((hit) => ({
      label: `${'　'.repeat(hit.depth)}${hit.depth > 0 ? '└ ' : ''}${hit.node.title}`,
      value: hit.node.id,
    })),
);

function openPicker(): void {
  if (!projectOptions.value.length) {
    toast('项目里还没有可引入的任务，先去项目管理建任务', 'info');
    return;
  }
  picker.taskId = projectOptions.value[0].value;
  picker.visible = true;
}

function confirmPick(): void {
  const hit = flatten(store.projects).find((h) => h.node.id === picker.taskId);
  if (!hit) return;
  addTaskToToday(hit.node, hit.root.id);
  // 引入到当前查看的日期
  const added = store.todos.filter((t) => t.taskId === hit.node.id && t.date === todayISO()).pop();
  if (added && viewDate.value !== todayISO()) {
    added.date = viewDate.value;
    added.order = nextOrder(store.todos, viewDate.value, added.quadrant);
    store.touch('todos');
  }
  picker.visible = false;
}

/* ---------------- 提醒 ---------------- */
let timer: number | undefined;
function checkReminders(): void {
  const now = Date.now();
  for (const t of store.todos) {
    if (t.done || !t.remindAt || reminded.has(t.id)) continue;
    if (t.date !== viewDate.value) continue;
    const at = new Date(t.remindAt.replace(' ', 'T')).getTime();
    if (Number.isNaN(at) || at > now) continue;
    reminded.add(t.id);
    toast(`⏰ 提醒：${t.title}`, 'info');
  }
}

onMounted(() => {
  checkReminders();
  timer = window.setInterval(checkReminders, 60_000);
});
onUnmounted(() => {
  if (timer) window.clearInterval(timer);
});

watch(
  () => [focusTarget.kind, focusTarget.id],
  () => {
    if (focusTarget.kind !== 'todo' || !focusTarget.id) return;
    const id = focusTarget.id;
    const todo = store.todos.find((t) => t.id === id);
    if (!todo) {
      clearFocus();
      return;
    }
    viewDate.value = todo.date;
    tagFilter.value = null;
    void nextTick(() => {
      const el = document.querySelector<HTMLElement>(`[data-todo-id="${id}"]`);
      if (!el) {
        clearFocus();
        return;
      }
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.add('flash');
      window.setTimeout(() => el.classList.remove('flash'), 1600);
      clearFocus();
    });
  },
  { immediate: true },
);
</script>

<template>
  <div>
    <div class="toolbar">
      <t-button variant="outline" shape="square" @click="shift(-1)"><ChevronLeftIcon /></t-button>
      <t-date-picker v-model="viewDate" style="width: 150px" />
      <t-button variant="outline" shape="square" @click="shift(1)"><ChevronRightIcon /></t-button>
      <t-button variant="text" @click="viewDate = todayISO()">今天</t-button>
      <span class="muted">{{ dateLabelCN(viewDate) }}</span>
      <span class="grow" />
      <t-radio-group :value="mode" variant="outline" @change="(v: string | number) => setMode(v as 'board' | 'list')">
        <t-radio-button value="list">列表</t-radio-button>
        <t-radio-button value="board">四象限</t-radio-button>
      </t-radio-group>
      <t-button variant="outline" @click="postpone">顺延未完成{{ pendingCount ? `（${pendingCount}）` : '' }}</t-button>
      <t-button variant="outline" @click="openPicker">从项目引入</t-button>
    </div>

    <div class="toolbar quick-add">
      <t-input v-model="quick.title" placeholder="快速记一条待办，回车即添加" class="grow" @enter="addQuick" />
      <t-select v-model="quick.priority" :options="priorityOptions" style="width: 120px" data-test="quick-priority" />
      <t-select v-model="quick.quadrant" :options="quadrantOptions" style="width: 150px" data-test="quick-quadrant" />
      <t-button theme="primary" @click="addQuick">
        <template #icon><AddIcon /></template>
        添加
      </t-button>
    </div>

    <t-card :bordered="false" class="stats-card">
      <div class="stats-row">
        <span>已完成 <strong>{{ doneCount }}</strong> / {{ items.length }}</span>
        <span>完成率 <strong>{{ rate }}%</strong></span>
        <t-progress :percentage="rate" :label="false" class="stats-progress" :theme="rate === 100 && items.length ? 'success' : 'line'" />
        <span class="grow" />
        <template v-if="allTags.length">
          <t-button
            size="small"
            :variant="tagFilter === null ? 'base' : 'outline'"
            :theme="tagFilter === null ? 'primary' : 'default'"
            @click="tagFilter = null"
          >
            全部标签
          </t-button>
          <t-button
            v-for="tag in allTags"
            :key="tag"
            size="small"
            :variant="tagFilter === tag ? 'base' : 'outline'"
            :theme="tagFilter === tag ? 'primary' : 'default'"
            @click="tagFilter = tagFilter === tag ? null : tag"
          >
            #{{ tag }}
          </t-button>
        </template>
      </div>
    </t-card>

    <div v-if="!items.length" class="empty-hint">
      <span class="big">🌤️</span>
      这一天还没有待办。上面输入框回车就能加一条。
    </div>

    <div v-else-if="mode === 'board'" class="board">
      <div
        v-for="group in grouped"
        :key="group.quadrant"
        class="qcol"
        :class="`q-${group.quadrant}`"
        @dragover.prevent
        @drop.prevent="onDropColumn(group.quadrant)"
      >
        <div class="qhead">
          <span class="qname">{{ group.label }}</span>
          <span class="muted">{{ group.items.filter((t) => t.done).length }}/{{ group.items.length }}</span>
        </div>
        <div class="qbody">
          <TodoCard
            v-for="t in group.items"
            :key="t.id"
            :todo="t"
            :dragging="dragId === t.id"
            @toggle="(v: boolean) => onToggle(t, v)"
            @edit="openEdit(t)"
            @remove="onRemove(t)"
            @pin="onPin(t)"
            @dragstart="(e: DragEvent) => onDragStart(e, t)"
            @dragend="onDragEnd"
            @drop.stop.prevent="onDropCard(t)"
          />
          <div v-if="!group.items.length" class="drop-hint">拖到这里</div>
        </div>
      </div>
    </div>

    <div v-else class="list-view">
      <t-card v-for="group in grouped" v-show="group.items.length" :key="group.quadrant" :bordered="false" class="list-group">
        <template #title>
          <span class="quad-dot" :class="`q-${group.quadrant}`" />{{ group.label }}
        </template>
        <template #actions>
          <span class="muted">{{ group.items.filter((t) => t.done).length }}/{{ group.items.length }}</span>
        </template>
        <div class="list-body">
          <TodoCard
            v-for="t in group.items"
            :key="t.id"
            :todo="t"
            :dragging="dragId === t.id"
            @toggle="(v: boolean) => onToggle(t, v)"
            @edit="openEdit(t)"
            @remove="onRemove(t)"
            @pin="onPin(t)"
            @dragstart="(e: DragEvent) => onDragStart(e, t)"
            @dragend="onDragEnd"
            @drop.stop.prevent="onDropCard(t)"
          />
        </div>
      </t-card>
    </div>

    <div class="toolbar section-gap">
      <t-button variant="outline" @click="openCreate">＋ 新建待办（填写细节）</t-button>
    </div>

    <TodoDialog v-model:visible="dialog.visible" :todo="dialog.todo" :date="viewDate" />

    <t-dialog v-model:visible="picker.visible" header="从项目引入到今日待办" :footer="false" width="520px"
    destroy-on-close
  >
      <t-form :label-width="90" label-align="right">
        <t-form-item label="选择任务">
          <t-select v-model="picker.taskId" :options="projectOptions" filterable />
        </t-form-item>
      </t-form>
      <p class="muted" style="margin: 0">引入后待办会带「来自项目」标记，完成后任务状态同步更新。</p>
      <div class="dialog-foot">
        <t-button variant="outline" @click="picker.visible = false">取消</t-button>
        <t-button theme="primary" @click="confirmPick">加入待办</t-button>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.quick-add {
  margin-top: -4px;
}
.stats-card {
  margin-bottom: 12px;
}
.stats-row {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  font-size: 12.5px;
  color: var(--td-text-color-secondary);
}
.stats-row strong {
  font-size: 15px;
  color: var(--td-text-color-primary);
}
.stats-progress {
  width: 180px;
}
.grow {
  flex: 1;
}
.board {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.qcol {
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-top: 3px solid var(--td-brand-color);
  border-radius: var(--td-radius-medium);
  display: flex;
  flex-direction: column;
  min-height: 200px;
}
.qcol.q-q1 {
  border-top-color: var(--td-error-color);
}
.qcol.q-q2 {
  border-top-color: var(--td-brand-color);
}
.qcol.q-q3 {
  border-top-color: var(--td-warning-color);
}
.qcol.q-q4 {
  border-top-color: var(--td-text-color-placeholder);
}
.qhead {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 9px 14px;
  border-bottom: 1px solid var(--td-component-stroke);
}
.qname {
  font-size: 13px;
  font-weight: 600;
}
.qbody {
  padding: 10px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-height: 140px;
  flex: 1;
}
.drop-hint {
  border: 1px dashed var(--td-component-stroke);
  border-radius: var(--td-radius-default);
  padding: 22px;
  text-align: center;
  color: var(--td-text-color-placeholder);
  font-size: 12px;
}
.list-view {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.list-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.quad-dot {
  display: inline-block;
  width: 8px;
  height: 8px;
  border-radius: 50%;
  margin-right: 8px;
  background: var(--td-brand-color);
}
.quad-dot.q-q1 {
  background: var(--td-error-color);
}
.quad-dot.q-q3 {
  background: var(--td-warning-color);
}
.quad-dot.q-q4 {
  background: var(--td-text-color-placeholder);
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
@media (max-width: 1080px) {
  .board {
    grid-template-columns: 1fr;
  }
}
</style>
