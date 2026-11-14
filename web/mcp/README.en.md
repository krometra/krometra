# Krometra MCP server

[Русский](./README.md) · **English** · [中文](./README.zh-CN.md)

This server lets an AI client (Claude Code or another MCP client) control a live Krometra editor: read the model, perform operations, and get viewport snapshots with edge and face IDs.

The browser calculates geometry, so the editor page always executes commands through `window.cadControl`. The server does not implement modeling operations: it gets their list and parameters from the editor (`capabilities`) and forwards calls unchanged. New channel operations become available without server changes.

In remote mode the user's editor tab connects to the site server via WebSocket:

```
AI client <- HTTP /mcp (Bearer krm_...) -> web/mcp/remote-server.mjs <- WebSocket /mcp/ws -> /editor/<id> tab -> window.cadControl
                                                    |
                                                    +-- backend /api (key sign-in, projects, tab token verification)
```

In local mode the server itself keeps the editor open in Chromium:

```
AI client <- stdio JSON-RPC -> web/mcp/server.mjs <- Playwright -> /editor/<id> page -> window.cadControl
                                        |
                                        +-- /api/auth/token, /api/projects/ (sign-in and projects without a browser)
```

## Connect to Claude Code

Both modes offer the same tools.

- **Remote (recommended):** the server runs at `https://<site>/mcp`, with nothing to install. AI commands run in the user's open editor tab; changes are visible immediately and the viewport shows an AI control indicator.
- **Local:** install the server on your computer; it opens the editor in background Chromium through Playwright. You do not need to keep a tab open, but git, Node 22+ and Chromium are required.

### Remote server

1. On the Account page (`/account`), create a `krm_...` access key. It is shown only once. The page also provides a ready-to-use command and a button to copy connection instructions for an agent.
2. Connect the server for all Claude Code projects:

   ```bash
   claude mcp add krometra -s user --transport http https://krometra.ru/mcp \
     --header 'Authorization: Bearer krm_...'
   ```

   `--header` must be last: it accepts multiple values and would otherwise consume the server name and address.
3. Open the project in a browser, signed in as the key's owner. The editor tab connects automatically when its kernel is ready. If closed, `cad_open_project` waits up to a minute and then returns a link to open.
4. Check `claude mcp list` shows `krometra` as `Connected`, then ask the assistant to list projects.

In remote mode files go through the server, not the local disk. `cad_export` returns a link valid for 15 minutes (download with `curl` without a key; the link is random and issued once). `cad_import` returns a one-time upload link: upload with `curl -X PUT --data-binary @file.step`, then invoke import again for the uploaded file.

### Local server

```bash
git clone https://github.com/krometra/krometra.git ~/krometra
cd ~/krometra/web && npm install
npx playwright install chromium
claude mcp add krometra -s user \
  -e CAD_STUDIO_URL=https://krometra.ru \
  -e CAD_STUDIO_API_KEY=krm_... \
  -- "$(command -v node)" "$HOME/krometra/web/mcp/server.mjs"
```

- If Chromium cannot be downloaded, set `CAD_STUDIO_BROWSER_CHANNEL=chrome` to use installed Google Chrome.
- `-s user` connects the server for all Claude Code projects, not only the current directory.
- `$(command -v node)` supplies the absolute Node path: Claude Code starts the server without a shell profile, so nvm's Node may be absent from `PATH`.
- If the repository is elsewhere, replace the `web/mcp/server.mjs` path with its absolute path.
- Test without a client: `printf '%s\n' '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | node web/mcp/server.mjs`.
- To watch the local server in your browser, use the `watchUrl` returned by `cad_open_project`: the same project in watch mode (`/editor/<id>?watch=1`). It disables editing, hotkeys and autosave, and reloads the model every 1.5 seconds without resetting the camera, so it does not interfere with the AI.

### Revoke a key

Delete the key on the Account page: access stops immediately and the next tool call returns a sign-in error. Remove the Claude Code server with `claude mcp remove krometra -s user`. To change a key, create a new one, remove the server and reconnect with the new key.

### Local development

For a local stack (`make up` and `cd web && npm run dev`), use `http://localhost:5173` and create a key at `http://localhost:5173/account`. Check `curl localhost:5173/api/health` returns `"app":"Крометра"`. Port 5173 may belong to another project; the server checks and will not send a key to the wrong application.

In dev, `make up` also starts the remote `mcp` service (port 8787); Vite proxies `/mcp` and WebSocket to it. The tab connects to the relay only if the frontend is built with `VITE_MCP_RELAY=1` (the `web` image default): `VITE_MCP_RELAY=1 npm run dev`. Without the stack: `BACKEND_URL=http://localhost:8000 PUBLIC_URL=http://localhost:5173 node web/mcp/remote-server.mjs`.

The local server can fall back to `CAD_STUDIO_EMAIL` and `CAD_STUDIO_PASSWORD` instead of `CAD_STUDIO_API_KEY`. A configured key takes precedence. Prefer a dedicated user for AI: the e2e setup (`web/e2e/auth.setup.ts`) deletes all projects of its user.

After changing server code, reconnect with `/mcp` → krometra → Reconnect (for remote mode, rebuild the `mcp` service).

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `CAD_STUDIO_URL` | `http://localhost:5173` | Application base URL (site or frontend proxying `/api`). |
| `CAD_STUDIO_API_KEY` | none | `krm_...` access key from Account; primary sign-in. |
| `CAD_STUDIO_EMAIL` | none | Fallback email, used only without a key. |
| `CAD_STUDIO_PASSWORD` | none | Fallback password, used only without a key. |
| `CAD_STUDIO_HEADLESS` | `1` | `0`, `false`, `no` or `off` opens a visible browser to watch the AI. |
| `CAD_STUDIO_BROWSER_CHANNEL` | `chromium` | `chromium` (Playwright Chromium) or `chrome` (installed Google Chrome). |
| `CAD_STUDIO_READY_TIMEOUT_MS` | `60000` | Maximum wait for the editor to become ready. |
| `CAD_STUDIO_REQUEST_TIMEOUT_MS` | `120000` | Maximum wait for one channel operation. |

The remote server (`mcp` service) has separate variables:

| Variable | Default | Purpose |
|---|---|---|
| `MCP_PORT` | `8787` | HTTP and WebSocket port. |
| `BACKEND_URL` | `http://localhost:8000` | Backend for key sign-in, projects and tab token verification (`http://app:8000` in compose). |
| `PUBLIC_URL` | `http://localhost:5173` | Public site URL used to construct editor and export links; set in production `.env`. |
| `MCP_OPEN_TIMEOUT_MS` | `60000` | How long `cad_open_project` waits for the project tab. |
| `MCP_REQUEST_TIMEOUT_MS` | `120000` | Maximum wait for one operation in the tab. |

Without a key or an email/password pair, the local server starts but tools return an error naming the missing variable and where to create a key. Keys, passwords and tokens are omitted from tool responses and stderr: known secrets and JWT-like strings are masked.

## Tools

| Tool | Parameters | Purpose |
|---|---|---|
| `cad_list_projects` | none | List the user's projects without starting a browser. |
| `cad_create_project` | `name`, `description?` | Create an empty project and return its ID. |
| `cad_open_project` | `project_id` (ID or `/editor/<id>` link) | Locally open the project, wait for `cadControl.ready` and return `watchUrl`; remotely attach to an open tab (or wait) and return the project link. |
| `cad_capabilities` | none | Channel operations: names, descriptions, whether they mutate the model, and parameters. The sole source of truth. |
| `cad_state` | none | Editor mode, kernel, document, bodies, sketches, timeline and busy state. |
| `cad_request` | `op`, `params?` | Pass `{ op, params }` to `cadControl.request` and return its response unchanged. |
| `cad_snapshot` | `labels?` (`none`, `edges`, `faces`), `body_id?`, `label_text?` (`id`, `number`), `body_ids?` | Viewport image, optionally labeled with edges/faces and a textual legend. `body_ids` temporarily isolates those bodies without changing the document. |
| `cad_section` | `plane` (`XY`, `XZ`, `YZ`), `offset?`, `body_ids?`, `points?` | Section contours (different colors per body), closure, area, length and bounds in plane coordinates. |
| `cad_export` | local: `format`, `path`, `body_ids?`, `overwrite?`; remote: `format`, `body_ids?`; STL/3MF: `quality?`, `tolerance?`, `angle_deg?` | Locally write STL, STEP or 3MF and return the path; remotely return a 15-minute file link and a `curl` command. |
| `cad_import` | local: `path`; remote: `upload_id?` | Import STEP; each solid becomes a separate document body. Remote mode: request an upload link, then import the uploaded file. |

Tool errors return `isError: true` without stopping the server. Channel responses with `ok: false` are also marked `isError` and a second text block explains the code (`busy`: retry in 1–2 seconds; `unknown_op` and `invalid_params`: consult `cad_capabilities`; and so on).

## Workflow

1. `cad_list_projects` or `cad_create_project` to get a project ID.
2. `cad_open_project`: the other tools require an open project.
3. `cad_capabilities`: obtain operations and parameters; do not guess operation names.
4. `cad_state`, `cad_snapshot`: inspect the model.
5. `cad_request`: perform an operation. Coordinates and dimensions are in millimeters.
6. `cad_state` or `cad_snapshot`: verify the result.
7. `cad_export`: save STL or STEP.

`history.undo` reverses exactly the last history entry (operation, sketch creation/edit, body or entry deletion) and identifies it in `undone`. Bodies hidden by the operation become visible; `history.redo` restores the same body and entry IDs. If the operation's output was subsequently changed, undo returns `operation_failed` without modifying the model.

Example verified in the live editor (operation names come from `capabilities` and may change with the channel):

```
cad_create_project { "name": "Кронштейн" }                       -> { "id": "64d8..." }
cad_open_project   { "project_id": "64d8..." }                   -> { "channelVersion": 1, ... }
cad_capabilities                                                 -> { "version": 1, "ops": [...] }
cad_request { "op": "sketch.create", "params": { "plane": "XY", "entities": [
  { "type": "rectangle", "corner1": { "x": -20, "y": -15 }, "corner2": { "x": 20, "y": 15 } } ] } }
                                                                 -> { "ok": true, "result": { "sketchId": "sketch-..." } }
cad_request { "op": "extrude", "params": { "sketchId": "sketch-...", "distance": 20 } }
                                                                 -> { "ok": true, "result": { "feature": { "bodyId": "body-..." } } }
cad_snapshot { "labels": "edges" }                               -> image + edge-ID legend
cad_request { "op": "fillet", "params": { "bodyId": "body-...", "edgeIds": ["e-2mqi2sfajd"], "radius": 4 } }
cad_state                                                        -> new body in bodies, entry in timeline
```

## Modeling techniques

- **Body at a height:** `sketch.create { plane: "XY", offset: 4, entities }`, then `extrude`, starts the body at Z = 4 without a supporting face or reverse cut. `XZ` offsets along Y, `YZ` along X.
- **Sketch on an end face:** `extrude` with `extent = distance` returns `capFaceIds` (far end) and `baseFaceIds` (sketch plane), usable in `sketch.create { bodyId, faceId }`. Find other faces with `face.find { bodyId, normal?, point? }`; narrow `topology` with `include`, `planar`, `normal`.
- **Face outline in a sketch:** face edges become construction entities: `line`, `circle`, or `arc`.
- **Sketch patterns:** `entities` accepts `{ type: "linear_pattern", entities, count, step, count2?, step2? }` or `{ type: "circular_pattern", entities, count, center, angle? }`; one item can describe a 2×14 hole array at 2.54 mm pitch.
- **Body chain:** join, cut, fillet, chamfer, thread, Boolean and transform consume the original body and assign a new result ID. `state.bodies` defaults to live bodies; `allBodies: true` includes consumed bodies with `consumedBy` (history entry) and `replacedBy` (result body).
- **Transform and copies:** `body.transform { bodyId, translate?, rotate?: { axis, angle, origin? }, copy? }` creates a `transform` entry. `copy: true` retains the original; face IDs carry over.
- **Mirror:** `body.mirror { bodyId, plane?: XY | XZ | YZ, offset?, faceId?, merge? }` reflects about an offset base plane or a planar face of the body. Without `merge` it creates a new body and keeps the original; `merge: true` joins them. Plane and offset can be edited in the tree and rebuilt.
- **Press-pull:** `pressPull { bodyId, faceIds, distance, newBody? }` offsets planar or cylindrical faces by signed `distance` (positive outward, negative inward; `-0.07` for fit clearance, `-1` on a hole wall to widen it by 1). The face keeps its ID. `newBody: true` extrudes the face into a new body and keeps the original. The offset is editable and rebuildable.
- **Multiple bodies:** `boolean { operation, targetBodyId, toolBodyIds: [...], keepTools? }` uses one history entry for one target and any number of tools; `keepTools: true` keeps tools visible. `extrude { operation: "cut", targetBodyIds: [...] }` cuts listed bodies in one operation (without a list or `targetBodyId`, all visible bodies); untouched bodies are skipped.
- **Body pattern:** `body.pattern { bodyId, type: "linear" | "circular", axis, count, spacing?, angle?, axis2?, count2?, spacing2?, separate? }` creates a `pattern` entry. The axis may be X/Y/Z, a straight edge, face or arbitrary line. By default copies merge into the original; a tool body can thus be patterned and subtracted in one Boolean operation.
- **Cleanup:** `body.delete` deletes a body and the history that produced it; `timeline.delete` removes one entry (dependents rebuild from its input body, and unbuildable dependents remain with errors); `timeline.suppress` disables an operation; `timeline.rollback` moves the rollback marker (new operations are inserted there); `timeline.deleteAfterMarker` removes everything after it; `sketch.delete` removes an unused sketch. All are undoable with `history.undo`. Use `body.setVisible`, `body.rename`, `body.setColor`, and `sketch.setVisible` for visibility, names and colors. Sketches used by operations are hidden in the viewport by default.
- **Inspect internals:** `cad_section` (or op `section`) shows section contours, clearances, thicknesses and holes; `mesh.stats` with `zLevels` quickly reports heights.
- **Distance sign:** an `extrude` history entry stores signed `distance` along the sketch normal. To repeat it use `distance = |distance|`, `reversed = (operation = cut ? distance > 0 : distance < 0)`.
- **Split face:** one part retains the old ID; others receive `~1`, `~2` suffixes.
- **Connection failure:** `save_failed` means geometry was built but the server did not save it even after retries (connection loss, 502–504). The model did not change: check `cad_state` and retry after 10–20 seconds. `operation_failed` is a substantive rejection; repeating identical parameters will not help.

## Labeled snapshot

`cad_snapshot { "labels": "edges" }` obtains body `topology`, projects edge midpoints with `viewport.project`, captures the viewport with `viewport.capture`, and draws labels in the tab with `image.drawLabels`; it works the same locally and remotely. A second text block contains a legend, one object per line:

```
{"bodyId":"body-0037f21469a2","kind":"edges","units":"mm","image":{"width":876,"height":674},"labeled":12,"offscreen":0,"items":[
{"id":"e-2mqi2sfajd","start":[-20,-15,20],"end":[20,-15,20],"at":[384,315]},
...
]}
```

- `id` is the exact ID for operations; `start`, `end` are edge endpoints in mm; faces have `point` and, for planar faces, `normal`; `at` is the label pixel.
- `label_text: "number"` uses numbers on the image and maps them to IDs in the legend (`label`), useful for overlapping labels.
- `body_id` is optional when only one body is visible.
- All objects in frame are labeled, including occluded ones: the channel does not report visibility. The legend coordinates are more reliable for selection.
- Offscreen objects are counted in `offscreen`. At most 120 labels are drawn; `notes` reports the rest. Zoom in if needed.
- Projection is checked before and after capture; a moved camera causes a retry, and continued motion produces a warning in `notes`.
- Change the camera with `cad_request { "op": "camera.set", "params": { "position": [90, -110, 80], "target": [0, 0, 10] } }`.

## Export to file

Local `cad_export` calls channel `export`, writes the bytes to disk and returns:

```
cad_export { "format": "stl", "path": "/Users/me/print/" }
-> {"path":"/Users/me/print/Кронштейн.stl","bytes":684,"mime":"model/stl","filename":"Кронштейн.stl"}
```

- Without `body_ids`, export all visible bodies, like the Export button; with it, export exactly those bodies. Separate STL files require separate calls with one ID each.
- STL/3MF mesh quality: `quality` (`draft`: 0.1 mm and 30°, `normal` default: 0.01 mm and ~28.6°, `high`: 0.002 mm and 6°), or override with `tolerance` (mm) and `angle_deg`. 3MF is a ZIP containing `3D/3dmodel.model` in millimeters, one object per body.
- `path` is absolute (`~/` is allowed). A matching extension (`.stl`, `.3mf`, `.step`, `.stp`) denotes a file. An existing directory, trailing slash or extensionless path denotes a directory, created if necessary; the editor supplies the filename.
- Existing files are not overwritten without `overwrite: true`; a file path is rejected before contacting the editor.
- A mismatched extension is rejected: STL cannot be written as `.step`.
- Only the last path component of the editor-supplied filename is used, preventing writes outside the requested directory.

`cad_request` cannot return files: base64 is replaced by a hint to use `cad_export`. Images (`mime` beginning `image/`) are returned as a separate image block.

## Sign-in and session

Sign-in uses the API, without form clicks: `POST /api/auth/token` with `grant_type=api_key` and `api_key` (password grant is the fallback). A key session is bound to the key: deleting it immediately invalidates both the access token and browser refresh session. The server never refreshes a token; when access expires, it signs in again with the same key. The browser receives its own refresh cookie and rotates it, preventing duplicate refresh-cookie use and backend replay protection from killing the session. API routes use trailing slashes (`/api/projects/`); redirects outside the Vite proxy are treated as errors.

## Tests

```bash
cd web && npm run test:mcp
```

These tests require no running stack. They start a local HTTP server with a stub page implementing `window.cadControl` and required API endpoints, spawn the MCP server and run JSON-RPC scenarios in headless Chromium. `remote.test.mjs` starts the remote server, connects a mock tab over WebSocket and checks key sign-in, sessions, command relay, export and upload links. `export.test.mjs` writes to and deletes a temporary directory. `labels.test.mjs`, `core.test.mjs` and `maixcam.test.mjs` check pure logic without a browser.

E2E on a live stack (`make up`, `cd web && npm run dev`, `/api/health` returns `"app":"Крометра"`):

```bash
cd web && npm run e2e:mcp
```

`e2e/mcp-maixcam.spec.ts` spawns `server.mjs` with `CAD_STUDIO_URL=E2E_BASE_URL` (default `http://localhost:5173`) and the e2e user's credentials (`E2E_USER_EMAIL`, `E2E_USER_PASSWORD`), models a scaled MaixCAM board (line/arc outline and holes, join chain, camera on posts using reverse cut, face sketch), exports STEP/STL to a temporary directory and captures the viewport. Projects are deleted at the end; the test rejects `krometra.ru`. Known regressions are marked `test.fail`; after fixing one, Playwright flags an unexpected pass and `test.fail` should become `test`.

## Structure

| File | Responsibility |
|---|---|
| `server.mjs` | Entry point: stdio loop, dependency assembly and browser shutdown. |
| `protocol.mjs` | JSON-RPC: `initialize`, `ping`, `tools/list`, `tools/call`. |
| `tools.mjs` | Shared tools and handlers; file tools are mode-specific. |
| `toolKit.mjs` | Tool argument parsing and response blocks. |
| `localFiles.mjs`, `import.mjs` | Local `cad_export` and `cad_import` on disk. |
| `section.mjs` | Section summary for `cad_section`. |
| `remote-server.mjs` | Remote entry point: environment configuration, startup and shutdown. |
| `remote/server.mjs` | HTTP server and tab WebSocket endpoint `/mcp/ws`. |
| `remote/http.mjs` | Streamable HTTP MCP on `/mcp` (POST, `Mcp-Session-Id`), `/mcp/files/<token>` and `/mcp/uploads/<id>` links. |
| `remote/hub.mjs` | Tab greeting with token, `/api/auth/me` verification, timed requests and pings. |
| `remote/relayEditor.mjs` | Remote session editor: tab attachment and channel calls. |
| `remote/apiSession.mjs` | Backend key sign-in, projects and user ID. |
| `remote/remoteFiles.mjs`, `remote/fileStore.mjs` | Remote export/import and temporary file storage with TTL. |
| `Dockerfile`, `package.json` | `mcp` image: remote server and `ws` only. |
| `config.mjs` | Environment configuration. |
| `session.mjs` | API sign-in, projects and browser auth state. |
| `editor.mjs` | Browser and editor page: open project, await readiness, call channel. |
| `channel.mjs` | Channel response contract and error-code hints. |
| `snapshot.mjs` | Viewport snapshot, body isolation and `image.drawLabels` annotations. |
| `export.mjs` | File export: path parsing, overwrite protection and writing. |
| `labels.mjs` | Pure label logic: anchors, projection, layout and legend. |
| `png.mjs`, `errors.mjs`, `playwright.mjs` | PNG dimensions, errors and secret masking, Playwright loading. |
| `test/` | Application stub (`stub/`), JSON-RPC client and PNG decoder (`support/`), tests. |

## Tab protocol and deployment

When ready, the editor tab (outside watch mode) opens `wss://<site>/mcp/ws` and sends `{ type: "hello", token, projectId, channelVersion }`, where `token` is its access token. The server checks it through `/api/auth/me` and responds `welcome` or `rejected`. It then sends `{ type: "request", id, request: { op, params } }`; the tab answers `{ type: "reply", id, reply }` with the `window.cadControl.request` response. `{ type: "session", attached }` controls the AI-agent indicator. MCP commands go only to a tab of the key owner with the project opened through `cad_open_project`; if several tabs match, the latest connected wins. The tab reconnects automatically with a delay of up to 30 seconds.

In production, `mcp` is defined in `docker-compose.prod.yml`, nginx proxies `/mcp` including WebSocket (`web/nginx-app.conf`), and links use `PUBLIC_URL` in `.env` (added by `scripts/deploy.sh`). The frontend is built with `VITE_MCP_RELAY=1`.

## Limitations

- One project is open per page locally or MCP session remotely. `cad_open_project` with a different ID switches the editor.
- Remote mode requires an open project tab; after closure, calls return an error with a link to reopen.
- If the editor reloads after opening (e.g. Vite rebuilds modules), reopen it with `cad_open_project`. Reloads during opening are handled automatically.
- Large channel responses (e.g. topology of a threaded body) are returned in full; the client may truncate them.
- `cad_request` does not return base64 in text: images use an image block and other binary data is replaced by a stub. Use `cad_snapshot` for images and `cad_export` for files.
- Exported files pass through both browser and server memory; very large models can hit `CAD_STUDIO_REQUEST_TIMEOUT_MS`.
