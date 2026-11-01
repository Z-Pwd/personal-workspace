<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue';
import { AddIcon, DownloadIcon, StarFilledIcon, StarIcon } from 'tdesign-icons-vue-next';
import ConvertIdeaDialog from '../components/ConvertIdeaDialog.vue';
import IdeaDialog from '../components/IdeaDialog.vue';
import { newIdea, store } from '../core/store';
import { IDEA_STATUS_LABEL, type Idea, type IdeaStatus } from '../core/types';
import { download, fmtDateTime, nowISO, parseTags, timeAgo } from '../core/util';
import { confirmAction, toast } from '../core/toast';
import { clearFocus, focusTarget } from '../core/focus';

const query = ref('');
const statusFilter = ref<'all' | IdeaStatus>('all');
const tagFilter = ref<string | null>(null);

const composer = reactive({ content: '', tags: '' });
const dialog = reactive({ visible: false, idea: null as Idea | null });
const convert = reactive({ visible: false, idea: null as Idea | null });
const random = reactive({ visible: false, idea: null as Idea | null });

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return store.ideas
    .filter((i) => statusFilter.value === 'all' || i.status === statusFilter.value)
    .filter((i) => !tagFilter.value || i.tags.includes(tagFilter.value))
    .filter((i) => !q || i.content.toLowerCase().includes(q) || i.tags.some((t) => t.toLowerCase().includes(q)))
    .sort((a, b) => Number(b.favorite) - Number(a.favorite) || (a.createdAt < b.createdAt ? 1 : -1));
});

const allTags = computed(() => {
  const set = new Set<string>();
  for (const idea of store.ideas) for (const tag of idea.tags) set.add(tag);
  return [...set].slice(0, 20);
});

const inboxCount = computed(() => store.ideas.filter((i) => i.status === 'inbox').length);

function submit(): void {
  const content = composer.content.trim();
  if (!content) return;
  store.ideas.unshift(newIdea({ content, tags: parseTags(composer.tags) }));
  store.touch('ideas');
  composer.content = '';
  composer.tags = '';
  toast('已记录');
}

function toggleFavorite(idea: Idea): void {
  idea.favorite = !idea.favorite;
  idea.updatedAt = nowISO();
  store.touch('ideas');
}

function cycleStatus(idea: Idea): void {
  const order: IdeaStatus[] = ['inbox', 'adopted', 'archived'];
  const next = order[(order.indexOf(idea.status) + 1) % order.length];
  idea.status = next;
  idea.updatedAt = nowISO();
  store.touch('ideas');
  toast(`已标记为「${IDEA_STATUS_LABEL[next]}」`, 'info');
}

async function remove(idea: Idea): Promise<void> {
  if (!(await confirmAction('删除这条灵感？'))) return;
  const i = store.ideas.findIndex((x) => x.id === idea.id);
  if (i >= 0) store.ideas.splice(i, 1);
  store.touch('ideas');
  toast('已删除');
}

function openRandom(): void {
  if (!store.ideas.length) {
    toast('还没有灵感记录', 'info');
    return;
  }
  random.idea = store.ideas[Math.floor(Math.random() * store.ideas.length)];
  random.visible = true;
}

function exportMd(): void {
  const items = filtered.value;
  const lines: string[] = ['# 灵感记录', '', `导出时间：${fmtDateTime(nowISO())}　共 ${items.length} 条`, ''];
  for (const idea of items) {
    lines.push(`## ${fmtDateTime(idea.createdAt)}${idea.favorite ? ' ★' : ''}`, '');
    lines.push(`状态：${IDEA_STATUS_LABEL[idea.status]}`);
    if (idea.tags.length) lines.push(`标签：${idea.tags.map((t) => `#${t}`).join(' ')}`);
    lines.push('', idea.content, '');
  }
  download('灵感记录.md', lines.join('\n'), 'text/markdown');
  toast('已导出 Markdown');
}

function exportJson(): void {
  download('灵感备份.json', JSON.stringify({ exportedAt: nowISO(), items: store.ideas }, null, 2));
  toast('已导出 JSON');
}

const exportOptions = [
  { content: '导出为 Markdown', value: 'md' },
  { content: '导出为 JSON', value: 'json' },
];

watch(
  () => [focusTarget.kind, focusTarget.id],
  () => {
    if (focusTarget.kind !== 'idea' || !focusTarget.id) return;
    const id = focusTarget.id;
    query.value = '';
    statusFilter.value = 'all';
    tagFilter.value = null;
    void nextTick(() => {
      const el = document.querySelector<HTMLElement>(`[data-idea-id="${id}"]`);
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
      <t-button theme="primary" @click="dialog.idea = null; dialog.visible = true">
        <template #icon><AddIcon /></template>
        记一条灵感
      </t-button>
      <t-input v-model="query" placeholder="全文搜索灵感…" clearable style="width: 240px" />
      <t-radio-group
        :value="statusFilter"
        variant="outline"
        @change="(v: string | number) => (statusFilter = v as 'all' | IdeaStatus)"
      >
        <t-radio-button value="all">全部</t-radio-button>
        <t-radio-button value="inbox">未处理</t-radio-button>
        <t-radio-button value="adopted">已采纳</t-radio-button>
        <t-radio-button value="archived">已归档</t-radio-button>
      </t-radio-group>
      <span class="grow" />
      <t-button variant="outline" @click="openRandom">🎲 随机回顾</t-button>
      <t-dropdown :options="exportOptions" trigger="click" @click="(d: { value?: string }) => (d.value === 'md' ? exportMd() : exportJson())">
        <t-button variant="outline">
          <template #icon><DownloadIcon /></template>
          导出
        </t-button>
      </t-dropdown>
    </div>

    <t-card :bordered="false" class="composer">
      <t-textarea
        v-model="composer.content"
        :autosize="{ minRows: 2, maxRows: 6 }"
        placeholder="想到什么就写什么（Ctrl+Enter 保存）…"
        @keydown.ctrl.enter="submit"
        @keydown.meta.enter="submit"
      />
      <div class="composer-foot">
        <t-input v-model="composer.tags" placeholder="标签（可留空），如：产品 效率" style="width: 260px" />
        <span class="grow" />
        <t-button theme="primary" @click="submit">记录</t-button>
      </div>
    </t-card>

    <div class="toolbar">
      <span class="muted">
        共 {{ store.ideas.length }} 条灵感 · 未处理 {{ inboxCount }} 条 · 当前显示 {{ filtered.length }} 条
      </span>
      <span class="grow" />
      <t-button v-if="allTags.length" size="small" :variant="tagFilter === null ? 'base' : 'outline'" :theme="tagFilter === null ? 'primary' : 'default'" @click="tagFilter = null">
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
    </div>

    <div v-if="!filtered.length" class="empty-hint">
      <span class="big">💡</span>
      {{
        query || statusFilter !== 'all' || tagFilter
          ? '没有匹配的灵感'
          : '还没有灵感。第一条最难，写下今天脑子里冒出来的任何一句话就行。'
      }}
    </div>

    <t-timeline v-else class="idea-timeline">
      <t-timeline-item
        v-for="idea in filtered"
        :key="idea.id"
        :label="timeAgo(idea.createdAt)"
        :dot-color="idea.favorite ? 'warning' : 'primary'"
      >
        <div class="idea-card" :class="{ fav: idea.favorite }" :data-idea-id="idea.id">
          <div class="idea-head">
            <t-tag
              :theme="idea.status === 'adopted' ? 'success' : idea.status === 'archived' ? 'default' : 'primary'"
              variant="light"
              size="small"
            >
              {{ IDEA_STATUS_LABEL[idea.status] }}
            </t-tag>
            <span class="muted">{{ fmtDateTime(idea.createdAt) }}</span>
            <span class="grow" />
            <t-tooltip :content="idea.favorite ? '取消收藏' : '收藏置顶'">
              <t-button variant="text" shape="square" size="small" data-test="idea-star" title="收藏" aria-label="收藏" @click="toggleFavorite(idea)">
                <StarFilledIcon v-if="idea.favorite" />
                <StarIcon v-else />
              </t-button>
            </t-tooltip>
          </div>

          <div class="idea-text">{{ idea.content }}</div>

          <div class="idea-foot">
            <t-tag v-for="tag in idea.tags" :key="tag" theme="primary" variant="light" size="small" class="clickable" @click="tagFilter = tag">
              #{{ tag }}
            </t-tag>
            <t-tag v-if="idea.convertedTo" theme="success" variant="light" size="small">
              已转成{{ idea.convertedTo.type === 'todo' ? '待办' : '任务' }}：{{ idea.convertedTo.title }}
            </t-tag>
            <span class="grow" />
            <t-button size="small" variant="outline" @click="convert.idea = idea; convert.visible = true">转成行动</t-button>
            <t-button size="small" variant="outline" @click="dialog.idea = idea; dialog.visible = true">编辑</t-button>
            <t-button size="small" variant="text" @click="cycleStatus(idea)">状态</t-button>
            <t-button size="small" variant="text" theme="danger" @click="remove(idea)">删除</t-button>
          </div>
        </div>
      </t-timeline-item>
    </t-timeline>

    <IdeaDialog v-model:visible="dialog.visible" :idea="dialog.idea" />
    <ConvertIdeaDialog v-model:visible="convert.visible" :idea="convert.idea" />

    <t-dialog v-model:visible="random.visible" header="🎲 随机回顾" :footer="false" width="560px"
    destroy-on-close
  >
      <template v-if="random.idea">
        <p class="muted">{{ fmtDateTime(random.idea.createdAt) }}</p>
        <div class="idea-text" style="font-size: 15px">{{ random.idea.content }}</div>
        <div class="idea-foot" style="margin-top: 10px">
          <t-tag v-for="tag in random.idea.tags" :key="tag" size="small" variant="light" theme="primary">#{{ tag }}</t-tag>
        </div>
      </template>
      <div class="dialog-foot">
        <t-button variant="outline" @click="random.visible = false">关闭</t-button>
        <t-button
          theme="primary"
          @click="convert.idea = random.idea; convert.visible = true; random.visible = false"
        >
          转为行动
        </t-button>
      </div>
    </t-dialog>
  </div>
</template>

<style scoped>
.composer {
  margin-bottom: 12px;
}
.composer-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
}
.grow {
  flex: 1;
}
.idea-timeline {
  padding-left: 4px;
}
.idea-card {
  background: var(--td-bg-color-container);
  border: 1px solid var(--td-component-stroke);
  border-radius: var(--td-radius-medium);
  padding: 12px 14px;
  transition: box-shadow 0.15s;
}
.idea-card:hover {
  box-shadow: var(--td-shadow-1);
}
.idea-card.fav {
  border-left: 3px solid var(--td-warning-color);
}
.idea-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  flex-wrap: wrap;
}
.idea-text {
  white-space: pre-wrap;
  word-break: break-word;
  font-size: 13.5px;
  line-height: 1.7;
}
.idea-foot {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
  flex-wrap: wrap;
}
.clickable {
  cursor: pointer;
}
.dialog-foot {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 14px;
}
</style>
