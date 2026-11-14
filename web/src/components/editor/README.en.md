# Editor architecture

[Русский](README.md) · English · [中文](README.zh.md)

`views/EditorView.vue` is **only an orchestrator**: it creates editor composables, lays out components, and connects events. All logic belongs in `composables/editor/`; all markup belongs in this directory. Do not add business logic or large templates to EditorView: it once grew to 3,358 lines and was decomposed. See the map below for where to put things.

## Map

```
EditorView.vue               orchestrator, ~580 lines
├── composables/editor/          state and logic (one domain per file)
│   ├── types.ts                     shared editor types (RenderingMode, CtxItem, …)
│   ├── useDocumentModel             derived useDocument data: sketches/bodies/timelineEntries
│   ├── useBodyMeshes                scene meshes: trackMesh/untrackMesh/replaceMesh/hydrateBodyMeshes
│   ├── useSketchVisibility          sketch visibility: explicit tree eye or automatic (used sketches hidden); operation-panel sketch remains visible
│   ├── useDocumentStatus            document save status (loading/saved/…/conflict)
│   ├── useCameraSync                camera polling for ViewCube and view transitions
│   ├── useExtrudeRevolve            extrude/revolve state and commands with ghost preview
│   ├── useProfileRegions            sketch profile regions: click/Shift selection and merged preview faces
│   ├── useCutTargets                cut bodies: all visible by default, scene/tree click toggles them
│   ├── useQuantityField             numeric input with expressions and units (lib/expr + lib/units)
│   ├── useSketchLifecycle           plane/face selection, enter/exit sketch and delete
│   ├── useBooleanMode               Combine mode: target + N tools picked in scene/tree, Keep tools, apply
│   ├── useFilletChamfer             fillet/chamfer mode: pick edges and apply
│   ├── useThread                    thread mode: face selection, thread preview, apply
│   ├── useShell                     shell mode: click open faces, thickness, direction, apply
│   ├── useDraft                     draft mode: neutral plane XY/XZ/YZ or face, clicked faces with tangent chain, angle, reverse, apply
│   ├── usePressPull                 Press-Pull: clicked faces, signed offset, new body, preview, apply
│   ├── useMirror                    mirror mode: body, offset XY/XZ/YZ plane or face, preview, apply
│   ├── useSweep                     sweep: profile and path sketches, path validation, apply
│   ├── useLoft                      loft: ordered profile sketches, operation, transition, apply; useLoftPreview handles ghost
│   ├── useHole                      hole mode: planar face, centers clicked or from sketch, preview, apply
│   ├── useMeasure                   measure mode: one or two objects, read-only kernel request, material and density
│   ├── usePattern                   pattern mode: body, axis (X/Y/Z, edge, face), count, run/apply
│   ├── useWorkPlanes                work planes: creation, editing with rebuild, deletion, visibility, scene, tree menu
│   ├── useWorkPlaneTool             Plane panel: type, clicked references (pick mode), expression fields, preview, apply
│   ├── useStepImport                STEP import: file selection, limits, import command and body meshes
│   ├── useParametersSync            Parameters ↔ document.metadata synchronization
│   ├── useViewInspect               normal view and face/base-plane context menu; useSectionMode provides viewport section
│   ├── useEditorHotkeys             keyboard subscription (Esc priority chain in EditorView)
│   ├── useTimelineEdits             deletion, suppression, rollback marker (TimelineEditCommand, one Ctrl+Z undo)
│   ├── useHistoryLock               history lock while sketch is open (rules: lib/timelineGuards.ts)
│   ├── useEditorControl             window.cadControl channel: publish, readiness, register operations
│   └── control/                     channel operations by domain: read, viewport, sketch, model operations
└── components/editor/           markup + CSS Modules
    ├── EditorMenuBar                header: breadcrumb, document status, avatar
    ├── ImportStepButton             Import STEP button in header next to export
    ├── EditorRibbon                 tool ribbon → emit action
    ├── ModelTree                    model tree and rename; body click takes over active mode (shared/useBodyPick)
    ├── TreeContextMenu              context menu (items come from EditorView)
    ├── TimelineStrip                operation timeline, entry status and draggable rollback marker
    ├── SketchDeleteDialog           warning when deleting a sketch with dependent operations
    ├── EditorStatusBar              bottom status bar
    ├── ParametersModal              Parameters dialog (form state inside)
    ├── PropsPanelShell              right panel frame (head/body/foot slots)
    ├── EditorOperationPanels        right-panel switcher: sketch, active operation, or properties
    ├── SketchPropsPanel             sketch-mode panel; constraint selection/hover shared with canvas glyphs (shared/useSketchConstraintFocus)
    ├── ExtrudeRevolvePanel          extrude/revolve panel (prop: ExtrudeRevolveApi)
    ├── ProfileRegionsField          Profile row: whole sketch or selected regions and reset
    ├── BooleanPanel                 Combine panel: operation, target, tools, Keep tools
    ├── BodyPickList                 selected-body list with individual removal (Combine tools and cut bodies)
    ├── FilletChamferPanel           fillet/chamfer panel (prop: FilletChamferApi)
    ├── EdgeSelectionList            tangent-chain checkbox and selected edges with individual removal
    ├── ThreadPanel                  thread panel: profile presets, pitch, starts, preview
    ├── ShellPanel                   shell panel: open faces, thickness, inward/outward
    ├── DraftPanel                   draft panel: neutral, faces, tangent chain, angle, reverse
    ├── PressPullPanel               face-offset panel: faces, offset expression, Offset face / New body (prop: PressPullApi)
    ├── MirrorPanel                  mirror panel: plane, offset, Union (prop: MirrorApi)
    ├── SweepPanel                   Sweep panel: profile, path, operation, orientation
    ├── LoftPanel                    Loft panel: ordered profiles, operation, transition
    ├── HolePanel                    hole panel: type, centers, diameter, depth, bottom, counterbore/countersink
    ├── MeasurePanel                 measure panel: element/body filter, copyable results, material
    ├── PatternPanel                 pattern panel: linear/circular, grid, union or separate bodies
    ├── PatternAxisPicker            pattern-axis selection: X/Y/Z or clicked edge/face
    ├── WorkPlanePanel               work-plane panel: offset, angled, three-point, midplane
    ├── WorkPlaneDeleteDialog        warning before deleting a plane containing sketches
    ├── SketchPlanePickBanner        sketch-plane selection hint with Cancel (Esc)
    ├── ViewportControls             view and rendering-mode controls
    ├── NavigationMenu               navigation menu at view controls: mouse preset, two-finger trackpad pan
    ├── ViewInspectOverlay           section panel (SectionPanel) and viewport context menu
    └── AxisTriad                    camera-following axis triad (Z-up)
```

## Rules

- **New editor feature** = a composable in `composables/editor/` (state and handlers) + a component here (markup). EditorView only calls the composable and renders the component.
- **Use `useBodyMeshes` for all scene meshes.** Do not call `viewportRef.addMesh/removeMesh` directly from features: desynchronization of `meshBodies` and the scene has caused the “result invisible until reload” bug three times. `hydrateBodyMeshes` is single-flight; concurrent calls reuse the current pass.
- A **mode** (sketch, boolean, fillet/chamfer) is a composable with `enter()`/`exit()` that manages `viewportSelectionMode`. Only EditorView (`enterSketchMode`) exits other modes; modes do not know about one another.
- **Pass the whole composable API object to its panel** (`:extrude="extrude"`), then destructure the required refs in script; otherwise `vue/no-mutating-props` flags writes through props.
- A composable needing the scene receives `viewportRef` through deps; EditorView creates shared refs such as `viewportSelectionMode` and passes them down.
- Put types needed by both component templates and EditorView in `composables/editor/types.ts`: `export type` inside `<script setup>` does not compile.
- **The `window.cadControl` channel** (e2e driver and MCP) is published by `useEditorControl`; its contract and operation rules are in `web/src/lib/control/README.md`. Channel operations invoke the same composable methods as panels and ribbon, without clicking. Every new mode or operation needs an operation in `composables/editor/control/` and a mode name in `lib/control/mode.ts`, otherwise the driver and MCP cannot see it.
- The Esc priority chain (menu → rename → plane selection → sketch → viewport context menu and section → modes → extrude panel → selection) lives in `EditorView.handleEscape`. Integrate new modes there deliberately.
