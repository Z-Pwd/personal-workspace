<script setup lang="ts">
import { computed, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import {
  CheckCircleIcon,
  DashboardIcon,
  FileIcon,
  FolderIcon,
  LightbulbIcon,
  MoonIcon,
  SearchIcon,
  SettingIcon,
  SunnyIcon,
} from 'tdesign-icons-vue-next';
import ConfirmHost from './components/ConfirmHost.vue';
import { store } from './core/store';
import { searchAll, type HitKind, type SearchHit } from './core/search';
import { requestFocus } from './core/focus';
import { theme, toggleTheme } from './core/theme';
import { toast } from './core/toast';

const route = useRoute();
const router = useRouter();

const nav = [
  { value: 'dashboard', label: '仪表盘', icon: DashboardIcon, path: '/dashboard' },
  { value: 'projects', label: '项目管理', icon: FolderIcon, path: '/projects' },
  { value: 'todos', label: '今日待办', icon: CheckCircleIcon, path: '/todos' },
  { value: 'ideas', label: '灵光一闪', icon: LightbulbIcon, path: '/ideas' },
  { value: 'reports', label: '工作汇报', icon: FileIcon, path: '/reports' },
  { value: 'settings', label: '设置', icon: SettingIcon, path: '/settings' },
];

const active = computed(() => (route.meta.menu as string) ?? 'dashboard');
const pageTitle = computed(() => (route.meta.title as string) ?? '仪表盘');
const pageSub = computed(() => (route.meta.sub as string) ?? '');
const isDark = computed(() => theme.value === 'dark');

function onMenuChange(value: string | number): void {
  const item = nav.find((n) => n.value === value);
  if (item) router.push(item.path);
}

/* ---------------- 全局搜索 ---------------- */
const keyword = ref('');
const hits = ref<SearchHit[]>([]);
const showResults = ref(false);
const searchRef = ref<{ focus: () => void } | null>(null);

watch(keyword, (value) => {
  hits.value = searchAll(value ?? '');
  showResults.value = !!String(value ?? '').trim();
});

const groups: { kind: HitKind; label: string }[] = [
  { kind: 'project', label: '项目' },
  { kind: 'task', label: '任务' },
  { kind: 'todo', label: '待办' },
  { kind: 'idea', label: '灵感' },
];

function hitsOf(kind: HitKind): SearchHit[] {
  return hits.value.filter((h) => h.kind === kind);
}

function openHit(hit: SearchHit): void {
  keyword.value = '';
  showResults.value = false;
  requestFocus(hit.kind === 'todo' || hit.kind === 'idea' ? hit.kind : 'task', hit.id);
  const path = hit.kind === 'todo' ? '/todos' : hit.kind === 'idea' ? '/ideas' : '/projects';
  void router.push(path);
  void nextTick();
}

function onSearchFocus(): void {
  if (String(keyword.value ?? '').trim()) showResults.value = true;
}

function onDocClick(e: MouseEvent): void {
  const el = e.target as HTMLElement;
  if (!el.closest('.search-box')) showResults.value = false;
}

function onKeydown(e: KeyboardEvent): void {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    searchRef.value?.focus?.();
  }
  if (e.key === 'Escape') showResults.value = false;
}

onMounted(() => {
  document.addEventListener('click', onDocClick);
  document.addEventListener('keydown', onKeydown);
  document.title = '个人工作台';
});
onUnmounted(() => {
  document.removeEventListener('click', onDocClick);
  document.removeEventListener('keydown', onKeydown);
});

watch(
  () => route.name,
  () => {
    document.title = `${pageTitle.value} · 个人工作台`;
    window.scrollTo({ top: 0 });
  },
  { immediate: true },
);

/* ---------------- 保存状态 ---------------- */
const saveText = computed(() => {
  if (store.offline) return '未连接服务';
  if (store.saveState === 'saving') return '保存中…';
  if (store.saveState === 'error') return '保存失败';
  return '已保存到本地';
});

const saveTheme = computed<'success' | 'warning' | 'danger'>(() => {
  if (store.offline || store.saveState === 'error') return 'danger';
  if (store.saveState === 'saving') return 'warning';
  return 'success';
});

function onToggleTheme(): void {
  const next = toggleTheme();
  toast(next === 'dark' ? '已切到深色模式' : '已切到浅色模式', 'info');
}

const searchIcon = () => h(SearchIcon);

function retry(): void {
  location.reload();
}
</script>

<template>
  <div class="app-shell">
    <aside class="side">
      <div class="brand">
        <div class="brand-logo">🧭</div>
        <div class="brand-text">
          <strong>个人工作台</strong>
          <span>本地 JSON 存储</span>
        </div>
      </div>

      <t-menu :value="active" class="side-menu" @change="onMenuChange">
        <t-menu-item v-for="item in nav" :key="item.value" :value="item.value">
          <template #icon><component :is="item.icon" /></template>
          {{ item.label }}
        </t-menu-item>
      </t-menu>

      <div class="side-foot">
        <t-tag :theme="saveTheme" variant="light" size="small" class="save-tag">{{ saveText }}</t-tag>
        <t-tooltip :content="isDark ? '切到浅色' : '切到深色'">
          <t-button variant="text" shape="square" @click="onToggleTheme">
            <SunnyIcon v-if="isDark" />
            <MoonIcon v-else />
          </t-button>
        </t-tooltip>
      </div>
    </aside>

    <main class="main">
      <header class="topbar">
        <div class="page-head">
          <h1>{{ pageTitle }}</h1>
          <p>{{ pageSub }}</p>
        </div>
        <div class="topbar-right">
          <div class="search-box">
            <t-input
              ref="searchRef"
              v-model="keyword"
              placeholder="搜索项目 / 待办 / 灵感　Ctrl+K"
              clearable
              :prefix-icon="searchIcon"
              @focus="onSearchFocus"
            />
            <div v-if="showResults" class="search-panel">
              <div v-if="!hits.length" class="search-empty">没有找到相关内容</div>
              <template v-else>
                <div v-for="group in groups" :key="group.kind">
                  <template v-if="hitsOf(group.kind).length">
                    <div class="search-group">{{ group.label }}</div>
                    <button
                      v-for="hit in hitsOf(group.kind)"
                      :key="hit.id"
                      type="button"
                      class="search-item"
                      @click="openHit(hit)"
                    >
                      <span class="si-title">{{ hit.title }}</span>
                      <span class="si-meta">{{ hit.meta }}</span>
                    </button>
                  </template>
                </div>
              </template>
            </div>
          </div>
          <t-tag v-if="store.dataDir" variant="outline" size="small" class="path-tag" :title="store.dataDir">
            📁 {{ store.dataDir }}
          </t-tag>
          <t-button v-if="store.offline" theme="danger" variant="outline" size="small" @click="retry">重连</t-button>
        </div>
      </header>

      <div class="content">
        <router-view v-slot="{ Component }">
          <component :is="Component" />
        </router-view>
      </div>
    </main>

    <ConfirmHost />
  </div>
</template>
