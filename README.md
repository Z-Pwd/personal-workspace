# 个人工作台 v2（Vue 3 + TDesign）

把 txt / Word 里的工作量记录，变成**能拆解、能统计、能复盘**的本地工作台。

- **前端**：Vue 3 + **TDesign（腾讯开源组件库，tdesign-vue-next）** + TypeScript + Vite
- **存储**：JSON 文件，落在你指定的文件夹（默认 `E:\vs_code_js\workbench\data`）
- **本地服务**：Node.js 标准库（`http` + `fs`），零第三方依赖，负责托管页面 + 读写 JSON
- **离线可用**：所有依赖都打包进 `dist/`，运行时不访问 CDN，也不上传任何数据

## 一、怎么用

1. 双击 **`启动工作台.bat`**（启动服务并自动打开浏览器）
2. 地址：`http://127.0.0.1:7788`
3. 第一次打开是空的 → 点「先看看示例数据」，或直接「建第一个项目」

> 关掉黑窗口 = 停止服务，数据已经写进文件，不会丢。

## 二、数据在哪

| 文件 | 内容 |
| --- | --- |
| `projects.json` | 项目树，子任务嵌套在 `children` 里 |
| `todos.json` | 今日待办，按 `date` 区分每天 |
| `ideas.json` | 灵感，带标签与状态 |
| `reports.json` | 周报 / 月报存档（自动统计快照 + 手写内容） |
| `_backups/` | 自动备份（5 分钟最多一份，最多 60 份）+ 手动全量备份 |

设置页可改数据目录；每个文件带 `rev` 版本号，多标签页同时开会提示冲突；写入是「先写 .tmp 再改名」的原子操作，文件损坏时会另存 `.corrupt-时间戳` 现场。

## 三、功能

### 项目管理
- 多级树：项目 → 子任务 → 子子任务，展开/折叠
- 增删改；删除进回收站（可恢复 / 彻底删除 / 清空）
- 状态一键切换（行内下拉）、优先级、截止日期（临近/逾期高亮）
- 进度按子任务自动汇总；工时预计/实际（只累加叶子任务，不重复计算）
- 标签、备注、归档；搜索 + 状态/优先级筛选
- 批量：勾选后改状态、改优先级、删除
- 行内「⋯」菜单：加子任务、编辑、加入今日待办、上移/下移、归档、删除

### 今日待办
- 列表 / 四象限看板，**拖拽换象限**、拖到卡片上调整顺序
- 优先级 + 四象限；快速添加（回车）；置顶；标签筛选
- 从项目引入（完成后自动回写任务状态）
- 未完成顺延次日；每天/每周重复（完成后自动生成下一期）
- 每日复盘：完成数、完成率；日期切换查看历史；提醒时间到点提示

### 灵光一闪
- 随手记（Ctrl+Enter 保存）、标签、全文搜索、状态流转、收藏置顶
- 时间线展示、随机回顾
- 一键转成「今日待办」或「项目任务」，灵感自动标记已采纳
- 导出 Markdown / JSON

### 工作汇报
- 周报 / 月报一键生成，起止日期可自定义
- 自动汇总：概览、重点项目进展、四象限分布、未完成事项、灵感、下期要盯的任务
- 环比（与等长上一周期对比）、完成率环形图、每日工时柱状图
- 手动补充（总结 / 亮点 / 风险 / 下期计划）边打字边自动保存
- 存档、重新生成（保留手写内容）、导出 Markdown / 纯文本 / JSON、复制摘要
- 未完成事项一键顺延到下期

### 全局
- 首页仪表盘：今日待办、项目进度、本周工时、工作量分布
- 全局搜索（Ctrl+K）：跨项目/任务/待办/灵感，点结果跳转并高亮
- 自动保存（0.4 秒）、备份与导入导出、深色模式

## 四、TDesign 组件用在哪

| 位置 | 组件 |
| --- | --- |
| 侧边导航 | `t-menu` / `t-menu-item` + `tdesign-icons-vue-next` |
| 所有按钮、图标按钮 | `t-button`（primary / outline / text / danger） |
| 表单控件 | `t-input`、`t-textarea`、`t-input-number`、`t-select`、`t-date-picker`、`t-time-picker`、`t-switch`、`t-checkbox`、`t-radio-group` |
| 标签输入 | `t-tag-input`（任务/待办的标签） |
| 弹窗 | `t-dialog`（含 `DialogPlugin` 二次确认） |
| 提示 | `MessagePlugin`（`t-message`） |
| 状态/标签 | `t-tag`（优先级、截止、来源、标签） |
| 进度 | `t-progress`（行内、项目、周报环形图） |
| 布局 | `t-card`、`t-row`、`t-col`、`t-form`、`t-form-item` |
| 其他 | `t-timeline`（灵感）、`t-dropdown`（行内菜单/导出）、`t-tooltip`、`t-radio-group variant="outline"`（视图切换） |

> 备注：`t-radio-group` 的 `default-filled` 变体在「弹窗关闭时立刻切路由」的极端时序下会报一个 TDesign 内部的 `querySelector` 错误（上游异步测量泄漏），所以统一用 `variant="outline"`，视觉同样干净。

## 五、目录结构

```
workbench/
├─ 启动工作台.bat            # 双击启动（服务 + 打开浏览器）
├─ 重新编译.bat              # 改完源码后双击重新构建
├─ index.html                # Vite 入口
├─ vite.config.ts
├─ config.json               # 数据目录、端口
├─ server/server.mjs         # 本地服务：静态托管 + JSON 读写 + 备份
├─ src/
│  ├─ main.ts                # 应用入口（加载数据后挂载）
│  ├─ App.vue                # 布局：侧边菜单 + 顶栏 + 全局搜索
│  ├─ router.ts              # hash 路由
│  ├─ styles.css             # 基于 TDesign 令牌的布局样式
│  ├─ core/                  # 与框架无关的业务层
│  │  ├─ types.ts            # 所有数据结构
│  │  ├─ api.ts              # HTTP 通信
│  │  ├─ store.ts            # 全局状态（Vue reactive）+ 自动保存 + 冲突处理
│  │  ├─ tree.ts             # 项目树计算（进度/工时/查找）
│  │  ├─ report.ts           # 周报月报统计与导出
│  │  ├─ actions.ts          # 跨页面动作（引入待办、重复生成、状态回写）
│  │  ├─ search.ts focus.ts toast.ts theme.ts util.ts seed.ts
│  ├─ components/            # TaskDialog / TodoDialog / IdeaDialog / ConvertIdeaDialog
│  │                        # ProjectNode（递归树）/ TodoCard / BarChart
│  └─ views/                 # Dashboard / Projects / Todos / Ideas / Reports / Settings
├─ dist/                     # 构建产物（服务托管的就是这里）
├─ data/                     # 数据（可改到任意文件夹）
└─ test/smoke-vue.mjs        # 端到端冒烟测试（48 项断言）
```

## 六、开发

```bash
npm install          # 首次
npm run build        # 构建 dist/（等价于双击 重新编译.bat）
npm start            # 启动本地服务
npm run dev          # Vite 开发服务器（:5577，API 代理到 7788）
npm test             # 端到端冒烟测试（需先 npm start；用临时数据目录，不动真实数据）
```

## 七、备份与恢复

- 自动备份在 `data/_backups/`，文件名带时间戳；设置页可手动「立即全量备份」并查看列表
- 恢复：把备份文件复制回 `data/` 并改名成对应 JSON
- 也可在设置页「导出全部数据」得到完整快照，随时「导入数据」还原（会校验结构）

## 八、还没做（候选）

1. 汇报模板自定义（章节顺序、字段开关）
2. 导出 Word / PDF
3. 系统级通知（浏览器桌面提醒、周五早推送）
4. 季度报 / 按标签维度统计工时

## 九、版本

- **v2.0**：页面层重写为 Vue 3 + TDesign，业务逻辑层原样复用；数据格式与 v1 完全兼容（老数据直接可用）
- **v1.x**：TypeScript + 原生 DOM 手写组件（备份在 `E:\vs_code_js\workbench_backup_v1`）
