# Krometra MCP 服务器

[Русский](./README.md) · [English](./README.en.md) · **中文**

该服务器让 AI 客户端（Claude Code 及其他 MCP 客户端）控制实时 Krometra 编辑器：读取模型、执行操作，并获取带边和面 ID 标注的视口截图。

几何由浏览器计算，因此命令始终由编辑器页面通过 `window.cadControl` 执行。服务器不实现建模操作：它从编辑器的 `capabilities` 获取操作清单及参数，并原样转发调用。通道新增操作后无需修改服务器即可使用。

远程模式下，用户标签页通过 WebSocket 连接到站点服务器：

```
AI 客户端 <- HTTP /mcp (Bearer krm_...) -> web/mcp/remote-server.mjs <- WebSocket /mcp/ws -> /editor/<id> 标签页 -> window.cadControl
                                                    |
                                                    +-- backend /api（密钥登录、项目、验证标签页令牌）
```

本地模式下，服务器自行在 Chromium 中保持编辑器页面：

```
AI 客户端 <- stdio JSON-RPC -> web/mcp/server.mjs <- Playwright -> /editor/<id> 页面 -> window.cadControl
                                        |
                                        +-- /api/auth/token, /api/projects/（无需浏览器的登录和项目访问）
```

## 连接 Claude Code

两种模式提供相同工具。

- **远程（推荐）：**服务器运行于 `https://<site>/mcp`，无需安装。AI 命令在用户打开的编辑器标签页中执行，模型变化实时可见，视口显示 AI 正在控制的标识。
- **本地：**将服务器安装到电脑，由 Playwright 在后台 Chromium 中打开编辑器。无需保持标签页打开，但需要 git、Node 22+ 和 Chromium。

### 远程服务器

1. 在账户页面（`/account`）创建 `krm_...` 访问密钥。密钥仅显示一次；页面还提供现成命令及复制代理连接说明的按钮。
2. 为所有 Claude Code 项目连接服务器：

   ```bash
   claude mcp add krometra -s user --transport http https://krometra.ru/mcp \
     --header 'Authorization: Bearer krm_...'
   ```

   `--header` 必须放在最后：它接受多个值，否则会将服务器名称和地址也当作参数。
3. 以密钥所有者的身份登录，并在浏览器中打开项目。内核就绪后编辑器标签页自动连接。若标签页未打开，`cad_open_project` 最多等待一分钟，随后返回需要打开的链接。
4. 确认 `claude mcp list` 中 `krometra` 状态为 `Connected`，然后请助手列出项目。

远程模式的文件通过服务器传输，不使用本地磁盘：`cad_export` 返回 15 分钟有效的链接（可不带密钥使用 `curl` 下载；链接为随机且仅发放一次）；`cad_import` 返回一次性上传链接，使用 `curl -X PUT --data-binary @file.step` 上传，再次调用以导入上传的文件。

### 本地服务器

```bash
git clone https://github.com/krometra/krometra.git ~/krometra
cd ~/krometra/web && npm install
npx playwright install chromium
claude mcp add krometra -s user \
  -e CAD_STUDIO_URL=https://krometra.ru \
  -e CAD_STUDIO_API_KEY=krm_... \
  -- "$(command -v node)" "$HOME/krometra/web/mcp/server.mjs"
```

- 如果无法下载 Chromium，设置 `CAD_STUDIO_BROWSER_CHANNEL=chrome`，使用已安装的 Google Chrome。
- `-s user` 为所有 Claude Code 项目连接服务器，而非仅当前目录。
- `$(command -v node)` 提供 Node 的完整路径：Claude Code 启动服务器时不加载 shell 配置，nvm 的 Node 可能不在 `PATH` 中。
- 若仓库克隆到其他位置，将 `web/mcp/server.mjs` 替换为对应绝对路径。
- 不使用客户端的检查方式：`printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node web/mcp/server.mjs`。
- 要在自己的浏览器中观看本地服务器，使用 `cad_open_project` 返回的 `watchUrl`：同一项目的观察模式（`/editor/<id>?watch=1`）。此模式没有编辑、快捷键和自动保存，每 1.5 秒自动刷新模型且不重置相机，因此不会干扰 AI。

### 撤销密钥

在账户页面删除密钥后访问立即失效，下一次工具调用将返回登录错误。用 `claude mcp remove krometra -s user` 从 Claude Code 移除服务器。要更换密钥，请先创建新密钥，移除服务器，再使用新密钥重新连接。

### 本地开发

本地服务栈（`make up` 和 `cd web && npm run dev`）地址为 `http://localhost:5173`，在 `http://localhost:5173/account` 创建密钥。检查 `curl localhost:5173/api/health` 返回 `"app":"Крометра"`。5173 端口可能被其他项目占用；服务器会验证地址，不会向其他应用发送密钥。

开发环境中，`make up` 也会启动远程 `mcp` 服务（端口 8787），Vite 将 `/mcp` 及 WebSocket 代理给它。前端只有在构建时设置 `VITE_MCP_RELAY=1` 才会连接中继（`web` 镜像默认启用）：`VITE_MCP_RELAY=1 npm run dev`。不启动整套服务时可使用 `BACKEND_URL=http://localhost:8000 PUBLIC_URL=http://localhost:5173 node web/mcp/remote-server.mjs`。

本地服务器也可使用 `CAD_STUDIO_EMAIL` 和 `CAD_STUDIO_PASSWORD` 代替 `CAD_STUDIO_API_KEY` 登录；设置密钥时不会使用邮箱和密码。建议为 AI 单独创建用户：e2e 设置（`web/e2e/auth.setup.ts`）会删除其用户的全部项目。

修改服务器代码后需要重新连接：`/mcp` → krometra → Reconnect（远程模式还需重新构建 `mcp` 服务）。

## 环境变量

| 变量 | 默认值 | 用途 |
|---|---|---|
| `CAD_STUDIO_URL` | `http://localhost:5173` | 应用基础地址（站点或代理 `/api` 的前端）。 |
| `CAD_STUDIO_API_KEY` | 无 | 账户页面创建的 `krm_...` 访问密钥，主要登录方式。 |
| `CAD_STUDIO_EMAIL` | 无 | 备用登录邮箱，仅无密钥时使用。 |
| `CAD_STUDIO_PASSWORD` | 无 | 备用登录密码，仅无密钥时使用。 |
| `CAD_STUDIO_HEADLESS` | `1` | `0`、`false`、`no` 或 `off` 打开可见浏览器窗口，可观察 AI。 |
| `CAD_STUDIO_BROWSER_CHANNEL` | `chromium` | `chromium`（Playwright Chromium）或 `chrome`（已安装的 Google Chrome）。 |
| `CAD_STUDIO_READY_TIMEOUT_MS` | `60000` | 等待编辑器就绪的最长时间。 |
| `CAD_STUDIO_REQUEST_TIMEOUT_MS` | `120000` | 等待单次通道操作响应的最长时间。 |

远程服务器（`mcp` 服务）使用独立变量：

| 变量 | 默认值 | 用途 |
|---|---|---|
| `MCP_PORT` | `8787` | HTTP 和 WebSocket 端口。 |
| `BACKEND_URL` | `http://localhost:8000` | 负责密钥登录、项目和标签页令牌验证的后端（compose 中为 `http://app:8000`）。 |
| `PUBLIC_URL` | `http://localhost:5173` | 用于生成编辑器和导出链接的站点公网地址；生产环境从 `.env` 获取。 |
| `MCP_OPEN_TIMEOUT_MS` | `60000` | `cad_open_project` 等待用户打开项目标签页的时间。 |
| `MCP_REQUEST_TIMEOUT_MS` | `120000` | 等待标签页单次操作响应的时间。 |

没有密钥或邮箱密码时，本地服务器仍可启动，但工具会返回错误，说明缺少的变量和创建密钥的页面。密钥、密码和令牌不会出现在工具响应或 stderr 中：已知秘密和类似 JWT 的字符串会被屏蔽。

## 工具

| 工具 | 参数 | 用途 |
|---|---|---|
| `cad_list_projects` | 无 | 列出用户项目，不启动浏览器。 |
| `cad_create_project` | `name`, `description?` | 创建空项目并返回 ID。 |
| `cad_open_project` | `project_id`（ID 或 `/editor/<id>` 链接） | 本地打开项目、等待 `cadControl.ready` 并返回 `watchUrl`；远程连接到已打开的标签页（或等待），并返回项目链接。 |
| `cad_capabilities` | 无 | 通道操作的名称、说明、是否修改模型和参数；操作信息的唯一权威来源。 |
| `cad_state` | 无 | 编辑器模式、内核、文档、实体、草图、时间线及忙碌状态。 |
| `cad_request` | `op`, `params?` | 将 `{ op, params }` 传给 `cadControl.request` 并原样返回结果。 |
| `cad_snapshot` | `labels?` (`none`, `edges`, `faces`), `body_id?`, `label_text?` (`id`, `number`), `body_ids?` | 视口截图，可标注边或面并附文字图例。`body_ids` 临时仅显示指定实体，不修改文档。 |
| `cad_section` | `plane` (`XY`, `XZ`, `YZ`), `offset?`, `body_ids?`, `points?` | 平面剖面轮廓图（实体以不同颜色显示），以及闭合状态、面积、长度和平面坐标范围。 |
| `cad_export` | 本地：`format`, `path`, `body_ids?`, `overwrite?`；远程：`format`, `body_ids?`；STL/3MF：`quality?`, `tolerance?`, `angle_deg?` | 本地将 STL、STEP 或 3MF 写入磁盘并返回路径；远程返回 15 分钟有效链接和 `curl` 命令。 |
| `cad_import` | 本地：`path`；远程：`upload_id?` | 导入 STEP，每个实体成为文档中的独立实体。远程模式分两步：获取上传链接，再导入上传的文件。 |

工具错误以 `isError: true` 返回，服务器继续运行。通道返回 `ok: false` 时也标记为 `isError`，第二个文本块提供错误代码提示（`busy`：1–2 秒后重试；`unknown_op` 和 `invalid_params`：查阅 `cad_capabilities`；等等）。

## 工作流程

1. 通过 `cad_list_projects` 或 `cad_create_project` 获取项目 ID。
2. 调用 `cad_open_project`；其他工具要求项目已打开。
3. 使用 `cad_capabilities` 获取操作和参数，不要猜测操作名称。
4. 使用 `cad_state`、`cad_snapshot` 读取模型。
5. 使用 `cad_request` 执行操作；坐标和尺寸单位为毫米。
6. 使用 `cad_state` 或 `cad_snapshot` 确认结果。
7. 使用 `cad_export` 保存 STL 或 STEP。

`history.undo` 恰好撤销最后一条历史记录（操作、草图创建或编辑、删除实体或记录），并在 `undone` 中报告具体内容。操作隐藏的实体重新显示；`history.redo` 恢复相同的实体和记录 ID。如果操作产生的对象后来被修改，撤销会返回 `operation_failed`，且不会更改模型。

以下示例已在实时编辑器中验证（操作名称来自 `capabilities`，可能随通道变化）：

```
cad_create_project { "name": "Кронштейн" }                       -> { "id": "64d8..." }
cad_open_project   { "project_id": "64d8..." }                   -> { "channelVersion": 1, ... }
cad_capabilities                                                 -> { "version": 1, "ops": [...] }
cad_request { "op": "sketch.create", "params": { "plane": "XY", "entities": [
  { "type": "rectangle", "corner1": { "x": -20, "y": -15 }, "corner2": { "x": 20, "y": 15 } } ] } }
                                                                 -> { "ok": true, "result": { "sketchId": "sketch-..." } }
cad_request { "op": "extrude", "params": { "sketchId": "sketch-...", "distance": 20 } }
                                                                 -> { "ok": true, "result": { "feature": { "bodyId": "body-..." } } }
cad_snapshot { "labels": "edges" }                               -> 图片和边 ID 图例
cad_request { "op": "fillet", "params": { "bodyId": "body-...", "edgeIds": ["e-2mqi2sfajd"], "radius": 4 } }
cad_state                                                        -> bodies 中的新实体和 timeline 中的记录
```

## 建模技巧

- **指定高度的实体：**使用 `sketch.create { plane: "XY", offset: 4, entities }`，再执行 `extrude`，实体从 Z = 4 开始，无需支撑面或反向切除。`XZ` 沿 Y 偏移，`YZ` 沿 X 偏移。
- **端面草图：**`extent = distance` 的 `extrude` 返回 `capFaceIds`（远端面）和 `baseFaceIds`（草图平面上的面），可直接用于 `sketch.create { bodyId, faceId }`。其他面可通过 `face.find { bodyId, normal?, point? }` 查找；通过 `include`、`planar`、`normal` 筛选 `topology`。
- **草图中的面轮廓：**面边界作为构造实体引入：直线为 `line`、圆为 `circle`、圆弧为 `arc`。
- **草图阵列：**`entities` 支持 `{ type: "linear_pattern", entities, count, step, count2?, step2? }` 或 `{ type: "circular_pattern", entities, count, center, angle? }`；一个元素即可描述间距 2.54 毫米的 2×14 孔阵列。
- **实体链：**合并、切除、圆角、倒角、螺纹、布尔和移动会消耗原实体并为结果生成新 ID。`state.bodies` 默认只显示活动实体；`allBodies: true` 还显示被消耗实体及其 `consumedBy`（历史记录）和 `replacedBy`（结果实体）。
- **移动和复制：**`body.transform { bodyId, translate?, rotate?: { axis, angle, origin? }, copy? }` 创建 `transform` 历史记录；`copy: true` 保留原实体，面 ID 保留到结果。
- **镜像：**`body.mirror { bodyId, plane?: XY | XZ | YZ, offset?, faceId?, merge? }` 相对于带偏移的基准平面或实体自身的平面镜像。没有 `merge` 时创建新实体并保留原实体；`merge: true` 将镜像与原实体合并。平面和偏移可在树中编辑并重建。
- **推拉面：**`pressPull { bodyId, faceIds, distance, newBody? }` 以有符号 `distance` 沿法线偏移平面和圆柱面（正值向外，负值向内；配合间隙可用 `-0.07`，沿孔壁使用 `-1` 可将孔扩大 1）。偏移后的面保留 ID。`newBody: true` 将面拉伸为新实体并保留原实体；偏移可在树中编辑并重建。
- **一次操作处理多个实体：**`boolean { operation, targetBodyId, toolBodyIds: [...], keepTools? }` 用一条历史记录处理一个目标和任意数量的工具；`keepTools: true` 保留工具可见。`extrude { operation: "cut", targetBodyIds: [...] }` 一次切除列出的实体（无列表且无 `targetBodyId` 时处理所有可见实体）；未被工具接触的实体跳过。
- **实体阵列：**`body.pattern { bodyId, type: "linear" | "circular", axis, count, spacing?, angle?, axis2?, count2?, spacing2?, separate? }` 创建 `pattern` 记录；轴可以是 X/Y/Z、直边、面或任意直线。副本默认与原实体合并，可先阵列工具实体再通过一次布尔运算切除。
- **清理：**`body.delete` 删除实体及其生成历史；`timeline.delete` 删除一条记录（依赖项从输入实体重建，无法构建的记录保留错误）；`timeline.suppress` 停用操作；`timeline.rollback` 移动回滚标记（新操作插入标记处）；`timeline.deleteAfterMarker` 删除标记后的所有记录；`sketch.delete` 删除未使用草图。均可用 `history.undo` 撤销。实体可使用 `body.setVisible`、`body.rename`、`body.setColor`；草图轮廓使用 `sketch.setVisible`。操作使用的草图默认在视口中隐藏。
- **检查内部：**`cad_section`（或 `section` 操作）显示剖面轮廓、间隙、厚度和孔；`mesh.stats` 的 `zLevels` 可快速获取高度。
- **距离符号：**`extrude` 历史记录的 `distance` 沿草图法线保存符号。重复操作时使用 `distance = |distance|`，`reversed = (operation = cut ? distance > 0 : distance < 0)`。
- **被分割的面：**其中一部分保留原 ID，其余部分获得 `~1`、`~2` 后缀。
- **连接失败：**`save_failed` 表示几何已构建，但服务器重试后仍未保存（断线、502–504）。模型未改变；检查 `cad_state`，10–20 秒后重试。`operation_failed` 表示实质性失败，重复相同参数无效。

## 带标注的截图

`cad_snapshot { "labels": "edges" }` 获取实体 `topology`，使用 `viewport.project` 投影边中点，使用 `viewport.capture` 截取视口，并通过标签页内的 `image.drawLabels` 绘制标注，因此本地和远程模式工作方式相同。第二个文本块为图例，每行一个对象：

```
{"bodyId":"body-0037f21469a2","kind":"edges","units":"mm","image":{"width":876,"height":674},"labeled":12,"offscreen":0,"items":[
{"id":"e-2mqi2sfajd","start":[-20,-15,20],"end":[20,-15,20],"at":[384,315]},
...
]}
```

- `id` 是操作使用的精确标识；`start`、`end` 是边的端点（毫米）；面包含 `point`，平面还包含 `normal`；`at` 是标注像素坐标。
- `label_text: "number"` 在图片上显示编号，图例中的 `label` 给出编号与 ID 的对应关系，适合标注重叠的情况。
- 仅有一个可见实体时可省略 `body_id`。
- 画面内所有对象都会标注，包括被实体遮挡的对象：通道不报告可见性。通过图例坐标选择对象比仅看图片更可靠。
- 画面外对象计入 `offscreen`，不显示标注。最多绘制 120 个标注，其余数量记录在 `notes` 中；需要时请放大相机。
- 截图前后都会检查投影；相机移动时重新截图，如果一直未停止，`notes` 中会有警告。
- 可通过 `cad_request { "op": "camera.set", "params": { "position": [90, -110, 80], "target": [0, 0, 10] } }` 调整视角。

## 导出到文件

本地 `cad_export` 调用通道 `export`，将字节写入磁盘并返回：

```
cad_export { "format": "stl", "path": "/Users/me/print/" }
-> {"path":"/Users/me/print/Кронштейн.stl","bytes":684,"mime":"model/stl","filename":"Кронштейн.stl"}
```

- 不提供 `body_ids` 时导出所有可见实体，与“导出”按钮相同；提供时仅导出指定实体。要为每个实体生成独立 STL，请分别调用并每次传入一个 ID。
- STL 和 3MF 的网格精度：`quality`（`draft`：0.1 毫米和 30°；默认 `normal`：0.01 毫米和约 28.6°；`high`：0.002 毫米和 6°），或用 `tolerance`（毫米）和 `angle_deg` 覆盖预设。3MF 是包含毫米单位 `3D/3dmodel.model` 的 ZIP，每个实体一个对象。
- `path` 为绝对路径（允许 `~/`）。带格式扩展名（`.stl`、`.3mf`、`.step`、`.stp`）的路径表示文件；已有目录、以斜杠结尾或没有扩展名的路径表示目录，必要时自动创建，文件名由编辑器提供。
- 没有 `overwrite: true` 时不覆盖现有文件；指定文件路径时会在联系编辑器之前拒绝。
- 不匹配格式的扩展名会被拒绝，STL 不会写入 `.step` 文件。
- 仅使用编辑器提供的文件名的最后一个路径分量，防止写入指定目录之外。

`cad_request` 不返回文件：base64 内容由提示使用 `cad_export` 的占位符代替。图片（`mime` 以 `image/` 开头）例外，作为独立 image 块返回。

## 登录与会话

通过 API 登录，无需点击表单：使用 `grant_type=api_key` 和 `api_key` 字段调用 `POST /api/auth/token`（备用方式为密码授权）。密钥会话与密钥绑定：删除密钥会立即使访问令牌和浏览器刷新会话失效。服务器从不刷新令牌；访问令牌过期时使用同一密钥重新登录。浏览器通过专门为其执行的登录获得刷新 Cookie，并自行轮换，避免同一刷新 Cookie 被重复使用而触发后端重放保护。API 路径使用结尾斜杠（`/api/projects/`）；绕过 Vite 代理的重定向视为错误。

## 测试

```bash
cd web && npm run test:mcp
```

这些测试无需启动完整服务栈：测试启动本地 HTTP 服务器与实现 `window.cadControl` 和必要 API 的模拟页面，以子进程启动 MCP 服务器，并在无头 Chromium 中运行 JSON-RPC 场景。`remote.test.mjs` 启动远程服务器，通过 WebSocket 连接模拟标签页，检查密钥登录、会话、命令中继、导出和上传链接。`export.test.mjs` 在临时目录写入并删除文件。`labels.test.mjs`、`core.test.mjs` 和 `maixcam.test.mjs` 不使用浏览器，检查纯逻辑。

在实时服务栈上运行 e2e（`make up`、`cd web && npm run dev`，`/api/health` 返回 `"app":"Крометра"`）：

```bash
cd web && npm run e2e:mcp
```

`e2e/mcp-maixcam.spec.ts` 以 `CAD_STUDIO_URL=E2E_BASE_URL`（默认 `http://localhost:5173`）和 e2e 用户凭据（`E2E_USER_EMAIL`、`E2E_USER_PASSWORD`）启动 `server.mjs` 子进程，绘制缩小版 MaixCAM 板（`line` 和 `arc` 轮廓及孔、合并链、通过反向切除在支柱上制作摄像头、面上草图），将 STEP 和 STL 导出到临时目录并截取视口。结束时删除创建的项目；测试拒绝 `krometra.ru` 地址。已知回归标记为 `test.fail`：修复后 Playwright 会报告意外通过，此时应将 `test.fail` 改为 `test`。

## 结构

| 文件 | 职责 |
|---|---|
| `server.mjs` | 入口：stdio 循环、依赖组装和关闭浏览器。 |
| `protocol.mjs` | JSON-RPC：`initialize`、`ping`、`tools/list`、`tools/call`。 |
| `tools.mjs` | 共用工具及处理器；文件工具按模式连接。 |
| `toolKit.mjs` | 工具参数解析和响应块。 |
| `localFiles.mjs`, `import.mjs` | 使用磁盘的本地 `cad_export` 和 `cad_import`。 |
| `section.mjs` | `cad_section` 的剖面摘要。 |
| `remote-server.mjs` | 远程服务器入口：环境配置、启动和停止。 |
| `remote/server.mjs` | HTTP 服务器和 `/mcp/ws` 标签页 WebSocket 端点。 |
| `remote/http.mjs` | `/mcp` 上的 Streamable HTTP MCP（POST、`Mcp-Session-Id`），以及 `/mcp/files/<token>` 和 `/mcp/uploads/<id>` 链接。 |
| `remote/hub.mjs` | 带令牌的标签页握手、通过 `/api/auth/me` 验证、带超时请求和 ping。 |
| `remote/relayEditor.mjs` | 远程会话编辑器：连接用户标签页并通过它调用通道。 |
| `remote/apiSession.mjs` | 通过后端进行密钥登录并获取项目和用户 ID。 |
| `remote/remoteFiles.mjs`, `remote/fileStore.mjs` | 远程导出、导入及带 TTL 的临时文件存储。 |
| `Dockerfile`, `package.json` | `mcp` 服务镜像：仅远程服务器和 `ws`。 |
| `config.mjs` | 环境变量配置。 |
| `session.mjs` | API 登录、项目和浏览器身份验证状态。 |
| `editor.mjs` | 浏览器和编辑器页面：打开项目、等待就绪、调用通道。 |
| `channel.mjs` | 通道响应契约和错误代码提示。 |
| `snapshot.mjs` | 视口截图、实体隔离和 `image.drawLabels` 标注。 |
| `export.mjs` | 文件导出：路径解析、防止覆盖及写入。 |
| `labels.mjs` | 标注纯逻辑：锚点、投影、布局和图例。 |
| `png.mjs`, `errors.mjs`, `playwright.mjs` | PNG 尺寸、错误和秘密屏蔽、Playwright 加载。 |
| `test/` | 应用模拟（`stub/`）、JSON-RPC 客户端和 PNG 解码器（`support/`）、测试。 |

## 标签页协议与部署

编辑器标签页（非观察模式）在通道就绪后打开 `wss://<site>/mcp/ws` 并发送 `{ type: "hello", token, projectId, channelVersion }`，其中 `token` 是其访问令牌。服务器通过 `/api/auth/me` 验证后返回 `welcome` 或 `rejected`。随后服务器发送 `{ type: "request", id, request: { op, params } }`，标签页以 `{ type: "reply", id, reply }` 返回 `window.cadControl.request` 的响应；`{ type: "session", attached }` 控制 AI 代理标识。MCP 命令只发送给密钥所有者、且打开了 `cad_open_project` 所指定项目的标签页；若有多个匹配标签页，使用最近连接的一个。标签页自动重连，等待时间最多 30 秒。

生产环境中，`mcp` 服务在 `docker-compose.prod.yml` 中定义，nginx 将 `/mcp` 及 WebSocket 代理给它（`web/nginx-app.conf`）；链接地址使用 `.env` 中的 `PUBLIC_URL`（由 `scripts/deploy.sh` 添加）。前端使用 `VITE_MCP_RELAY=1` 构建。

## 限制

- 本地模式一页、远程模式一个 MCP 会话同时只能打开一个项目。使用其他 ID 调用 `cad_open_project` 会切换编辑器。
- 远程模式需要项目标签页保持打开；关闭后调用会返回错误及重新打开链接。
- 如果编辑器在打开后重载（例如 Vite 重建模块），调用会失败；请通过 `cad_open_project` 重新打开。服务器可自动处理打开过程中的重载。
- 大型通道响应（例如螺纹实体的拓扑）会完整返回，但客户端可能截断。
- `cad_request` 的文本响应不传递 base64：图片作为独立 image 块返回，其他二进制数据以占位符代替。截图使用 `cad_snapshot`，文件使用 `cad_export`。
- 导出文件完整经过服务器和浏览器内存；非常大的模型可能达到 `CAD_STUDIO_REQUEST_TIMEOUT_MS` 限制。
