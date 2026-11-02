/** 汇报模板：章节顺序 / 标题 / 开关，随数据目录保存在 templates.json */
import { store } from './store';
import type { ReportSectionConfig, ReportSectionKey, ReportTemplate } from './types';
import { nowISO, uid } from './util';

export const DEFAULT_SECTIONS: ReportSectionConfig[] = [
  { key: 'overview', title: '本期工作概览', enabled: true },
  { key: 'projects', title: '重点项目进展', enabled: true },
  { key: 'todos', title: '待办完成情况', enabled: true },
  { key: 'ideas', title: '灵感与沉淀', enabled: true },
  { key: 'next', title: '下期计划', enabled: true },
  { key: 'manual', title: '本期总结', enabled: true },
];

export const SECTION_LABEL: Record<ReportSectionKey, string> = {
  overview: '概览（待办/任务/工时/环比）',
  projects: '重点项目进展 + 每日工时',
  todos: '待办完成情况（四象限 + 未完成）',
  ideas: '灵感与沉淀',
  next: '下期要盯的任务',
  manual: '手动补充（总结/亮点/风险/计划）',
};

export function defaultSections(): ReportSectionConfig[] {
  return DEFAULT_SECTIONS.map((s) => ({ ...s }));
}

/** 把任意来源的配置补齐/纠正成合法结构（缺章节补默认、未知章节丢弃） */
export function normalizeSections(input: unknown): ReportSectionConfig[] {
  const list = Array.isArray(input) ? (input as ReportSectionConfig[]) : [];
  const byKey = new Map<ReportSectionKey, ReportSectionConfig>();
  for (const item of list) {
    if (!item || typeof item.key !== 'string') continue;
    if (!(item.key in SECTION_LABEL)) continue;
    const key = item.key as ReportSectionKey;
    if (byKey.has(key)) continue;
    const fallback = DEFAULT_SECTIONS.find((s) => s.key === key)!;
    byKey.set(key, {
      key,
      title: typeof item.title === 'string' && item.title.trim() ? item.title.trim().slice(0, 24) : fallback.title,
      enabled: item.enabled !== false,
    });
  }
  // 补上缺失的章节（放在末尾，默认隐藏，避免老报告突然多出内容）
  for (const d of DEFAULT_SECTIONS) {
    if (!byKey.has(d.key)) byKey.set(d.key, { ...d, enabled: false });
  }
  const ordered = [...byKey.values()];
  return ordered.length ? ordered : defaultSections();
}

/** 当前生效的模板：取 templates 里第一个；没有就用默认 */
export function currentTemplate(): ReportTemplate {
  const t = store.templates[0];
  if (!t) return { id: 'default', name: '默认模板', sections: defaultSections(), updatedAt: nowISO() };
  return { ...t, sections: normalizeSections(t.sections) };
}

export function currentSections(): ReportSectionConfig[] {
  return currentTemplate().sections.map((s) => ({ ...s }));
}

/** 保存模板（没有就新建一条） */
export function saveTemplate(sections: ReportSectionConfig[], name?: string): void {
  const normalized = normalizeSections(sections);
  const exist = store.templates[0];
  if (exist) {
    exist.sections = normalized;
    exist.updatedAt = nowISO();
    if (name?.trim()) exist.name = name.trim().slice(0, 20);
  } else {
    store.templates.unshift({
      id: uid(),
      name: (name ?? '默认模板').trim().slice(0, 20) || '默认模板',
      sections: normalized,
      updatedAt: nowISO(),
    });
  }
  store.touch('templates');
}

/** 恢复默认 */
export function resetTemplate(): void {
  saveTemplate(defaultSections(), '默认模板');
}

/** 上移/下移一位（用于排序） */
export function moveSection(sections: ReportSectionConfig[], index: number, dir: -1 | 1): ReportSectionConfig[] {
  const next = sections.map((s) => ({ ...s }));
  const target = index + dir;
  if (target < 0 || target >= next.length) return next;
  const tmp = next[index];
  next[index] = next[target];
  next[target] = tmp;
  return next;
}

const CN_NUM = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

/** 中文序号：一、二、三… */
export function sectionNumber(index: number): string {
  return CN_NUM[index] ?? String(index + 1);
}
