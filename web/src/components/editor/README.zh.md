# 编辑器架构

[Русский](README.md) · [English](README.en.md) · 中文

`views/EditorView.vue` **只负责协调**：创建编辑器 composable、布局组件并连接事件。所有逻辑都在 `composables/editor/`，所有模板都在本目录的组件中。不要向 EditorView 添加业务逻辑或大段模板：该文件曾增长到 3358 行并已拆分。下表说明各部分的归属。

## 结构图

```
EditorView.vue               协调器，约 580 行
├── composables/editor/          状态和逻辑（每个领域一个文件）
│   ├── types.ts                     编辑器共用类型（RenderingMode、CtxItem 等）
│   ├── useDocumentModel             useDocument 的派生数据：sketches/bodies/timelineEntries
│   ├── useBodyMeshes                场景网格：trackMesh/untrackMesh/replaceMesh/hydrateBodyMeshes
│   ├── useSketchVisibility          草图可见性：树中显式控制或自动控制（已使用的草图隐藏）；操作面板中的草图保持可见
│   ├── useDocumentStatus            文档保存状态（loading/saved/…/conflict）
│   ├── useCameraSync                为 ViewCube 轮询相机及视图切换
│   ├── useExtrudeRevolve            拉伸/旋转状态与命令，以及预览
│   ├── useProfileRegions            草图轮廓区域：单击/Shift 选择与合并预览面
│   ├── useCutTargets                切除实体：默认所有可见实体；在场景/树中单击可切换
│   ├── useQuantityField             支持表达式和单位的数字输入（lib/expr + lib/units）
│   ├── useSketchLifecycle           选择平面/面、进入/退出草图及删除
│   ├── useBooleanMode               组合模式：从场景/树选择目标与 N 个工具、保留工具并应用
│   ├── useFilletChamfer             圆角/倒角模式：选择边并应用
│   ├── useThread                    螺纹模式：选面、螺纹预览并应用
│   ├── useShell                     抽壳模式：单击开口面、设置厚度与方向并应用
│   ├── useDraft                     拔模模式：中性 XY/XZ/YZ 平面或面、单击选面与相切链、角度、反向并应用
│   ├── usePressPull                 面偏移（Press-Pull）：单击选面、有符号偏移、新实体、预览并应用
│   ├── useMirror                    镜像模式：实体、偏移 XY/XZ/YZ 平面或面、预览并应用
│   ├── useSweep                     扫掠：轮廓和路径草图、路径验证并应用
│   ├── useLoft                      放样：有序轮廓草图、操作、过渡并应用；useLoftPreview 负责预览
│   ├── useHole                      孔模式：平面、单击或草图中心点、预览并应用
│   ├── useMeasure                   测量模式：一或两个对象、只读内核请求、材料和密度
│   ├── usePattern                   阵列模式：实体、轴（X/Y/Z、边、面）、数量、运行/应用
│   ├── useWorkPlanes                工作平面：创建、编辑并重建、删除、可见性、场景及树菜单
│   ├── useWorkPlaneTool             平面面板：类型、单击参考（选择模式）、表达式字段、预览并应用
│   ├── useStepImport                STEP 导入：文件选择、限制、导入命令及实体网格
│   ├── useParametersSync            参数 ↔ document.metadata 同步
│   ├── useViewInspect               法向视图及面/基准平面右键菜单；useSectionMode 提供视口剖面
│   ├── useEditorHotkeys             键盘订阅（Esc 优先链在 EditorView 中）
│   ├── useTimelineEdits             删除、抑制、回滚标记（TimelineEditCommand，一次 Ctrl+Z 撤销）
│   ├── useHistoryLock               草图打开时锁定历史记录（规则：lib/timelineGuards.ts）
│   ├── useEditorControl             window.cadControl 控制通道：发布、就绪状态、注册操作
│   └── control/                     按领域划分的通道操作：读取、视口、草图、模型操作
└── components/editor/           模板与 CSS Modules
    ├── EditorMenuBar                页眉：面包屑、文档状态、头像
    ├── ImportStepButton             页眉导出旁的导入 STEP 按钮
    ├── EditorRibbon                 工具栏 → emit action
    ├── ModelTree                    模型树与重命名；单击实体交由当前模式处理（shared/useBodyPick）
    ├── TreeContextMenu              右键菜单（项目来自 EditorView）
    ├── TimelineStrip                操作时间线、条目状态和可拖动回滚标记
    ├── SketchDeleteDialog           删除有依赖操作的草图时的警告
    ├── EditorStatusBar              底部状态栏
    ├── ParametersModal              参数对话框（表单状态在组件内部）
    ├── PropsPanelShell              右侧面板框架（head/body/foot 插槽）
    ├── EditorOperationPanels        右侧面板切换：草图、当前操作或属性
    ├── SketchPropsPanel             草图模式面板；约束选择/悬停与画布符号共享（shared/useSketchConstraintFocus）
    ├── ExtrudeRevolvePanel          拉伸/旋转面板（prop：ExtrudeRevolveApi）
    ├── ProfileRegionsField          轮廓行：整个草图或所选区域及重置
    ├── BooleanPanel                 组合面板：操作、目标、工具、保留工具
    ├── BodyPickList                 支持逐项移除的已选实体列表（组合工具及切除实体）
    ├── FilletChamferPanel           圆角/倒角面板（prop：FilletChamferApi）
    ├── EdgeSelectionList            相切链复选框及可逐项移除的已选边列表
    ├── ThreadPanel                  螺纹面板：轮廓预设、螺距、头数、预览
    ├── ShellPanel                   抽壳面板：开口面、厚度、向内/向外
    ├── DraftPanel                   拔模面板：中性面、面、相切链、角度、反向
    ├── PressPullPanel               面偏移面板：面、偏移表达式、偏移面/新实体（prop：PressPullApi）
    ├── MirrorPanel                  镜像面板：平面、偏移、合并（prop：MirrorApi）
    ├── SweepPanel                   扫掠面板：轮廓、路径、操作、方向
    ├── LoftPanel                    放样面板：有序轮廓、操作、过渡
    ├── HolePanel                    孔面板：类型、中心、直径、深度、底部、沉孔/锥孔
    ├── MeasurePanel                 测量面板：元素/实体筛选、可复制结果、材料
    ├── PatternPanel                 阵列面板：线性/圆周、网格、合并或独立实体
    ├── PatternAxisPicker            阵列轴选择：X/Y/Z 或单击的边/面
    ├── WorkPlanePanel               工作平面面板：偏移、角度、三点、中间平面
    ├── WorkPlaneDeleteDialog        删除包含草图的平面前的警告
    ├── SketchPlanePickBanner        带取消（Esc）的草图平面选择提示
    ├── ViewportControls             视图和渲染模式控件
    ├── NavigationMenu               视图控件旁的导航菜单：鼠标预设、触控板双指平移
    ├── ViewInspectOverlay           剖面面板（SectionPanel）和视口右键菜单
    └── AxisTriad                    跟随相机的轴三角架（Z 轴向上）
```

## 规则

- **新的编辑器功能** = `composables/editor/` 中的 composable（状态与处理函数）+ 本目录的组件（模板）。EditorView 只调用 composable 并渲染组件。
- **场景网格只能通过 `useBodyMeshes` 管理。** 不要在功能中直接调用 `viewportRef.addMesh/removeMesh`：`meshBodies` 与场景不同步曾三次导致“刷新后才显示结果”。`hydrateBodyMeshes` 使用 single-flight，并发调用复用当前执行。
- **模式**（草图、布尔、圆角/倒角）是具有 `enter()`/`exit()` 并自行管理 `viewportSelectionMode` 的 composable。只有 EditorView（`enterSketchMode`）负责退出其他模式；各模式互不依赖。
- **将完整 composable API 对象传给面板**（`:extrude="extrude"`），再在 script 中解构需要的 ref；否则通过 prop 写入会触发 `vue/no-mutating-props`。
- 需要访问场景的 composable 通过 deps 接收 `viewportRef`；`viewportSelectionMode` 等编辑器共享 ref 由 EditorView 创建并向下传递。
- 组件模板与 EditorView 共同使用的类型放在 `composables/editor/types.ts`；`<script setup>` 中的 `export type` 无法编译。
- **`window.cadControl` 控制通道**（e2e 驱动和 MCP）由 `useEditorControl` 发布；契约和添加操作的规则见 `web/src/lib/control/README.md`。通道操作调用与面板和工具栏相同的 composable 方法，不模拟点击。每个新模式或操作都必须在 `composables/editor/control/` 增加操作，并在 `lib/control/mode.ts` 增加模式名，否则驱动和 MCP 无法识别。
- Esc 优先链（菜单 → 重命名 → 选择平面 → 草图 → 视口右键菜单及剖面 → 模式 → 拉伸面板 → 选择）位于 `EditorView.handleEscape`。添加新模式时须明确将其接入。
