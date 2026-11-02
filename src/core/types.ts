/** 全局数据结构定义（TypeScript 覆盖所有存储结构） */

export type Status = 'todo' | 'doing' | 'done' | 'shelved';
export type Priority = 'high' | 'mid' | 'low';
export type Quadrant = 'q1' | 'q2' | 'q3' | 'q4';
export type IdeaStatus = 'inbox' | 'adopted' | 'archived';
export type Repeat = 'none' | 'daily' | 'weekly';

/** 一条工时流水：某天在某任务上投入了多少小时 */
export interface TimeLog {
  id: string;
  /** 发生日期 yyyy-mm-dd */
  date: string;
  hours: number;
  note: string;
}

/** 项目 / 任务：同一个类型，靠 children 递归成树；顶层数组元素即为「项目」 */
export interface Task {
  id: string;
  title: string;
  note: string;
  status: Status;
  priority: Priority;
  /** 截止日期 yyyy-mm-dd */
  due: string | null;
  tags: string[];
  estHours: number | null;
  /** 实际工时合计：有流水时等于流水之和，无流水时是手填值 */
  actHours: number | null;
  /** 工时流水（按天记录，周报按日期聚合） */
  timeLogs: TimeLog[];
  children: Task[];
  createdAt: string;
  updatedAt: string;
  /** 完成时间；仅 status === 'done' 时有值 */
  doneAt: string | null;
  archived: boolean;
  /** 软删除时间；非空表示在回收站 */
  deletedAt: string | null;
}

export type Project = Task;

/** 今日待办 */
export interface Todo {
  id: string;
  /** 归属日期 yyyy-mm-dd */
  date: string;
  title: string;
  note: string;
  priority: Priority;
  quadrant: Quadrant;
  tags: string[];
  /** 截止时间 HH:mm */
  dueTime: string | null;
  /** 提醒时间 yyyy-mm-ddTHH:mm */
  remindAt: string | null;
  done: boolean;
  doneAt: string | null;
  pinned: boolean;
  order: number;
  repeat: Repeat;
  /** 由哪条重复待办生成的 */
  repeatOf: string | null;
  /** 从项目引入时记录来源 */
  projectId: string | null;
  taskId: string | null;
  createdAt: string;
  updatedAt: string;
}

/** 灵光一闪 */
export interface Idea {
  id: string;
  content: string;
  tags: string[];
  status: IdeaStatus;
  favorite: boolean;
  convertedTo: { type: 'task' | 'todo'; id: string; title: string } | null;
  createdAt: string;
  updatedAt: string;
}

/** 磁盘上每个 JSON 文件的封装 */
export interface Doc<T> {
  schema: number;
  rev: number;
  updatedAt: string | null;
  items: T[];
}

export const STATUS_LABEL: Record<Status, string> = {
  todo: '待开始',
  doing: '进行中',
  done: '已完成',
  shelved: '已搁置',
};

export const PRIORITY_LABEL: Record<Priority, string> = { high: '高', mid: '中', low: '低' };
export const PRIORITY_ORDER: Record<Priority, number> = { high: 0, mid: 1, low: 2 };

export const QUADRANT_LABEL: Record<Quadrant, string> = {
  q1: '重要且紧急',
  q2: '重要不紧急',
  q3: '不重要但紧急',
  q4: '不重要不紧急',
};
export const QUADRANT_SHORT: Record<Quadrant, string> = {
  q1: '紧急·重要',
  q2: '重要',
  q3: '紧急',
  q4: '常规',
};
export const QUADRANT_ORDER: Quadrant[] = ['q1', 'q2', 'q3', 'q4'];

export const IDEA_STATUS_LABEL: Record<IdeaStatus, string> = {
  inbox: '未处理',
  adopted: '已采纳',
  archived: '已归档',
};

export const REPEAT_LABEL: Record<Repeat, string> = {
  none: '不重复',
  daily: '每天',
  weekly: '每周',
};

/* ---------------- 工作汇报（周报 / 月报） ---------------- */
export type ReportKind = 'week' | 'month' | 'quarter';
export type ReportStatus = 'draft' | 'final';

export interface ReportMetrics {
  todoTotal: number;
  todoDone: number;
  todoRate: number;
  todoUndone: number;
  todoQuadrants: Record<Quadrant, number>;
  todoQuadrantDone: Record<Quadrant, number>;
  taskDone: number;
  taskOpen: number;
  hoursEst: number;
  hoursAct: number;
  ideaNew: number;
  ideaAdopted: number;
  /** 上期对比 */
  prevTodoDone: number;
  prevTodoRate: number;
  prevHoursAct: number;
}

export interface ReportProjectLine {
  id: string;
  title: string;
  progress: number;
  doneInPeriod: number;
  hoursAct: number;
  due: string | null;
  status: Status;
}

export interface ReportTodoLine {
  id: string;
  title: string;
  quadrant: Quadrant;
  priority: Priority;
  dueTime: string | null;
  note: string;
  date: string;
}

export interface ReportTaskLine {
  id: string;
  title: string;
  project: string;
  due: string | null;
  priority: Priority;
}

export interface ReportIdeaLine {
  id: string;
  content: string;
  convertedTo: string | null;
  createdAt: string;
}

/** 汇报章节：key 固定，标题可改，可隐藏，可排序 */
export type ReportSectionKey = 'overview' | 'projects' | 'todos' | 'ideas' | 'next' | 'manual';

export interface ReportSectionConfig {
  key: ReportSectionKey;
  title: string;
  enabled: boolean;
}

export interface ReportTemplate {
  id: string;
  name: string;
  sections: ReportSectionConfig[];
  updatedAt: string;
}

/** 生成时冻结的统计数据（重新生成会刷新，手写部分保留） */
export interface ReportSnapshot {
  /** 生成时使用的章节配置（顺序/标题/开关），老报告可能没有 */
  sections?: ReportSectionConfig[];
  metrics: ReportMetrics;
  projects: ReportProjectLine[];
  undoneTodos: ReportTodoLine[];
  doneTodos: { id: string; title: string }[];
  undoneTasks: ReportTaskLine[];
  ideas: ReportIdeaLine[];
  highlights: { id: string; title: string; project: string; hours: number }[];
  dailyHours: { date: string; hours: number }[];
  /** 按标签统计的本期工时（多标签按数量平摊，避免重复计数） */
  tagHours?: { tag: string; hours: number }[];
}

export interface Report {
  id: string;
  kind: ReportKind;
  start: string;
  end: string;
  title: string;
  status: ReportStatus;
  snapshot: ReportSnapshot;
  /** 主观内容：用户自己写 */
  manual: {
    summary: string;
    highlights: string;
    risks: string;
    nextPlan: string;
  };
  generatedAt: string;
  updatedAt: string;
}
