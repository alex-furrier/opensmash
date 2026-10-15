# Feature verification map

This map tracks the fork's Melee browser experience through merged source
`483793bfabaae80ce86228c0194742569554d38a`, consolidated on 2026-10-14 UTC.
The original baseline was `98ec5d1618568f400ab58aa888838d2d0c2e3a05`;
individual evidence records retain their own source and runtime revisions. It is a coverage index, not a claim
that every feature, device or current deployment passed one complete suite.
Smash 64 and desktop have separate [build paths](multiplayer/README.md#ancestry-and-game-selection)
and [desktop validation](../engines/melee/docs/DESKTOP_RELEASE.md).
The [local runbook](local-melee-runbook.md) documents the committed entry points,
private asset wiring, startup/stop and existing proxy topology.

**A** = automated regression with fixtures/mocks unless stated otherwise.
**B** = actual browser/game observation in the stated environment.
**U** = user-reported playtest. **Gap** = unrun or limited evidence.
Commands below select existing tests; they do not replace browser acceptance.

The 2026-10-14 read-only readiness audit reports 1,067 upstream catalog entries
and 1,108 All tiles including the installed custom roster. Only 43 source packages
are installed in that private environment; 1,065 catalog entries show **Source
unavailable**. Those counts are an environment snapshot, not a global catalog
promise. The later restoration checkpoint below supersedes source availability
for that local environment. The local menu supports two controller-owned human selections; the engine retains four ports. Online rooms
support exactly two humans with one local input source per peer.

| Feature | User-facing behavior | How tested | What the evidence establishes / limits |
| --- | --- | --- | --- |
| Gameplay and return | Select, play, reach results, Stop or return; retry owns a fresh attempt | A: [launch options](../engines/melee/tests/launch_options.test.mjs), [lifecycle](../engines/melee/tests/netplay_lifecycle.test.mjs). B: launcher proof, E2/E3 | Real local combat/results and return were observed. Selected native snapshots prove progress, not complete state equivalence. |
| Match controls and picture | Toolbar reserves space above the picture; touch controls fit portrait and landscape; narrow headers wrap actions | B: [UI proof](../engines/melee/tools/prove_ui_polish.mjs), E14 | Actual Chrome game rendering, fullscreen, emulated touch acquisition and resize release. Safari and physical-device certification remain open. |
| Local fighter selection | Two connected controllers own independent cursors, locks and per-port bases; P1 owns shared settings and start | A: [owned selection regressions](../web-prototype/shared/controller-selection.test.js). B: E11/E14 | Real Chrome gameplay with synthetic pads, reconnect/held-button, roster invalidation and neutral replacement-device input. Physical-controller certification remains open. |
| Keyboard and controllers | Unified physical-port assignment; per-device buttons, axes and trigger deadzone; guest uses its own human device | A: [controller ports](../web-prototype/shared/controller-ports.test.js), [profiles](../engines/melee/tests/controller_profiles.test.mjs), [friend selection](../engines/melee/tests/friend_match.test.mjs). B: E2/E3 | Keyboard acquisition/movement and synthetic standard gamepad routing. Gap: physical multi-controller, hotplug and nonstandard adapters. |
| Touch controls | Independent pointers and analog sticks reset on cancel/focus loss and layout changes | A: [mobile input](../web-prototype/shared/mobile-input.test.js), [touch controls](../web-prototype/shared/mobile-controls.test.js). B: [touch-emulation evidence](../engines/melee/validation/launch-prep/README.md), E14. U: E6 | Emulated browser touch plus a narrow subjective phone report; no current phone/controller certification. |
| Roster filters and base choice | Friends and Family opens first; High School and All follow; installed sources determine playability; each source/port retains an accepted base choice | A: [roster choice](../web-prototype/shared/melee-roster-choice.test.js), [launch roster](../engines/melee/tests/launch_roster.test.mjs), [route enforcement](../engines/melee/tests/test_roster_choices.py). B: E3/E13 | Catalog membership does not grant model availability. Unsupported/revoked pairs cannot prepare. Private identities and per-pair acceptance belong in the private companion. |
| Source cache | Prepare once per content/code revision; concurrent requests share work; sidecar changes invalidate; portable prepared sources can be reused | A: [native source](../engines/melee/tests/test_native_source.py). B: E2/E3 | Identity/cache behavior and local repeated launches. Fixture cache tests do not measure production cloud latency. |
| Loading and diagnostics | Bounded attempt phases, visible Retry, human Ready waits, scene preparation before play | A: [launch diagnostics](../engines/melee/tests/launch_diagnostics.test.mjs), [scene preparation](../engines/melee/tests/scene_preparation.test.mjs), [shader warmup](../engines/melee/tests/shader_warmup.test.mjs). B: E2/E4 | Failure/retry, cold/warm distinctions and phase observations. A readiness predicate does not certify sustained FPS. |
| Solo | Human first player and installed random CPU sources; missing sources fall back to vanilla opponents | A: [launch roster](../engines/melee/tests/launch_roster.test.mjs). B: E2 | Fresh settings, default preparation, keyboard progress, short-match results and asset-fault Retry. |
| Local companion | Explicit scripted second browser verifies/prepares/readies; Stop closes its owned session | A: [startup progress](../engines/melee/tests/local_opponent_progress.test.mjs), [simulated peer](../engines/melee/tests/test_simulated_peer.test.mjs). B: E2/E3/E14 | Two engines on the same Mac and fresh-session recovery. This helper is scripted, not native CPU AI or WAN evidence. |
| Online room lifecycle | Create/share/join; both verified identities must Ready; Stop ends both; rematch is fresh | A: [friend match](../engines/melee/tests/friend_match.test.mjs), [rooms](../engines/melee/tools/netplay/rooms.test.mjs), [relay](../engines/melee/tools/netplay/server.test.mjs). B: E1/E2 | Real local sockets and browser room transitions; actual private HTTPS on one Mac. Gap: two physical devices across WAN. |
| Confirmed input | Each peer acquires only its owned pad; both accept input and applied result at logical ticks; disagreement fails closed | A: [protocol](../engines/melee/tests/confirmed_input.test.mjs), [bridge](../engines/melee/tests/browser_bridge.test.mjs), [identity](../engines/melee/tests/netplay_identity.test.mjs). B: E1 | Distinct input traces, progress, mutation/disconnect/fresh-session controls and selected-state parity. No rollback/full snapshot. Ordered message faults over WebSocket/TCP are not transport packet loss. |
| Disc storage and handoff | Player supplies verified disc locally; saved browser copy restores; paired transfer has validation and cleanup | A: [disc cache](../engines/melee/tests/browser_disc_cache.test.mjs), [handoff](../engines/melee/tests/private_handoff.test.mjs). B: [historical transfer proof](multiplayer/disc-transfer-proof.json), E2 | Real Mac browser transfer and current refresh restore. Historical standalone transfer does not establish current phone or WAN handoff. |
| Donor fitting and attachments | Source package fits requested accepted donor/slot; required companion costumes remain available | A: [target choices](../engines/melee/tests/test_roster_choices.py), [native target options](../engines/melee/tests/test_native_target_options.py), [source-pivot rejection](../engines/melee/tests/source_pivot_contract.test.mjs). B: E5; [native fitting benchmark](../engines/melee/validation/native-fit/README.md) | Geometry/slot contracts and bounded target samples. Acceptance is per source/base, not all catalog combinations. Source-pivot is opt-in, reviewed 39-joint/four-donor browser/WebGPU only; standard DAT/desktop unsupported. Donor collision, attack and jump behavior is retained. |
| Private deployment boundary | Loopback service behind one approved private HTTPS origin; raw game/operator routes denied | A: [origin policy](../engines/melee/tests/friend_origin.test.mjs), [site startup](../engines/melee/tests/friend_site.test.mjs), [runtime assets](../engines/melee/tests/runtime_assets.test.mjs). B: E2/E4/E5 | Exact-origin/Host-spoof negative controls and served bundle checks. Build success alone does not prove served revision or a public production rollout. See [service contract](../engines/melee/server/README.md#private-tailnet-development). |
| Relocated private roots (separate candidate) | Retain imports and derived files outside checkout | A: [PR #2](https://github.com/alex-furrier/opensmash/pull/2), head `3d5907e`, contract and route/retry tests | 31 Python passes, four fixture skips, five JS passes. Candidate is separate from this map's source checkpoint. Gap: actual gameplay after root relocation; no private migration performed. |

## Evidence checkpoints

The public links are independently readable. E2–E5 are sanitized summaries of
private local receipts inspected during consolidation; raw traces/screenshots,
identities, sources, asset hashes and exact private URLs remain private. Use
[the private companion's verification map](https://github.com/alex-furrier/opensmash-characters/blob/main/docs/FEATURE-VERIFICATION.md)
(owner checkpoint `19b5fba`) for release acceptance. They are not public fixtures. The date below
is the consolidation date unless the original record supplies a run date.

- **E1 — protocol/game research:** [browser fixture proof](multiplayer/browser-protocol-proof.json)
  and [real-engine proof](multiplayer/gameplay-proof.json), Chrome 155.0.8059.39.
  Original engine identity, WASM/patch hashes and limitations are in those records.
  Fixture: 600 ticks and negative controls; real engine: reference/ordered hold/
  seeded jitter, 4,000 matching ticks per positive scenario. These historical
  standalone adapters do not certify later main-launcher revisions.
- **E2 — main launcher:** code/test receipt `2f0c79b0`, acceptance harness at that
  revision, runtime `de67936c`; actual fresh Chrome UI on macOS through private
  HTTPS. Five successful starts include solo default, short results, asset-fault
  Retry, restored-disc companion results and a fresh companion room. Initial
  settings/storage were empty; both companion sessions had matching applied-pad/
  selected-state traces. A prior source `185ea0c7` private HTTPS room run reached
  results with 1,959 matching ticks and route/origin negative controls. Recorded
  in the existing [multiplayer history](multiplayer/README.md#current-validation-and-historical-evidence).
- **E3 — choice integration:** code receipt `9c94ad78`, macOS Chrome, fresh
  browser storage. Default/nondefault choices, Retry, independent player choices,
  refresh, keyboard Escape and narrow viewport were checked. Solo and companion
  reached actual playable state; paired traces matched for 428 ticks. This does
  not publish or extend the private source/base acceptance matrix.
- **E4 — diagnostics/deployment:** code `c2b92322`, local macOS browser baseline,
  candidate and explicit acquisition-delay runs. Observed phase/frame data and
  selected-state comparisons are retained privately. Served HTML asset references
  and diagnostic bundles matched the reviewed build. No sustained-FPS guarantee
  follows. Older [performance reports](../engines/melee/docs/PERFORMANCE.md) retain
  failed windows and their own build identities; fitting time is not click-to-play.
- **E5 — renderer/donor integration:** code `98ec5d1`, macOS Chrome staging and
  approved private live surface. Generic receipt records 17 fit/slot checks,
  serializer/invalid-layout negative controls, unchanged ordinary humanoid fit
  output, source-pivot donor choices, actual solo/companion progress and return,
  and served-build verification. Source-specific visual acceptance and inherited
  pose limitations remain private; this is not all-target compatibility.
- **E6 — user playtest:** 2026-10-11 phone feedback reported some playability in
  an earlier standalone experiment. Device/browser, latency, controller, audio and
  current main-flow completeness were not measured. Retain as U, not B or A.
- **E7 — focused consolidation check:** 2026-10-14, source `98ec5d1`, macOS,
  Node 26.7.0: the twelve-file command below passed 69 tests. Existing Melee Python
  environment: native-source suite passed five tests. A first run without `ws`
  or NumPy failed dependency loading; no dependency installation was needed.
  These focused passes do not supersede historical full-suite failures/skips in
  [multiplayer validation](multiplayer/README.md#current-validation-and-historical-evidence).
- **E8 — upstream source restoration:** 2026-10-14, local website at `98ec5d1`
  with availability patch `d87c9ec` ([separate draft PR #4](https://github.com/alex-furrier/opensmash/pull/4)).
  The [upstream release](https://github.com/turtlesoupy/opensmash-melee/releases/tag/desktop-characters-v1)
  archive matched SHA-256 `ef0b0191a6d81b704cccc0d78a0cb459874a6e0064de4893a23e2d6542edc878`.
  Path/link checks and the existing GLB mesh reader, PNG verification and WAV
  headers validated 1,063 packages. Installed 1,061 new source folders, preserving
  two existing sources, all current catalog assignments and active private metadata.
  Live availability is 1,104 sources: 1,063 regular plus 41 active private; All
  remains 1,108 tiles. Historical private imports stay addressable but are excluded
  from active availability. Three focused route tests passed. Adam West, Ryan
  Reynolds, Scrapper and Tooth Fairy remain unavailable; no assets were fabricated.
  Chrome 155.0.8059.79 solo samples for Luigi, Kirby and Link passed owned keyboard
  acquisition, actual progress and return. A Kirby-versus-Link local companion
  sample passed gameplay and Stop/return. Solo selection used the existing React
  bridge; companion used the actual DOM Select handler and tutorial Skip. These
  are not physical-pointer/controller certification. This is a sample, not gameplay acceptance of all
  1,063 sources. Detailed asset/rollback and browser receipts remain private.

## Repeatable targeted checks

Run from repository root. Use the existing project dependencies: Node >=20
as declared in [package.json](../web-prototype/package.json); TypeScript-importing
Melee tests need a Node version with type stripping (E7 used Node 26).
Relay/policy tests need the installed `ws` dependency from
[netplay package.json](../engines/melee/tools/netplay/package.json).
Python checks use the converter environment described by
[requirements.txt](../engines/melee/requirements.txt). Missing dependencies are
an environment gap; do not install software or download assets solely for docs.

```sh
node --test web-prototype/shared/controller-ports.test.js web-prototype/shared/melee-roster-choice.test.js engines/melee/tests/launch_roster.test.mjs engines/melee/tests/controller_profiles.test.mjs engines/melee/tests/launch_diagnostics.test.mjs engines/melee/tests/local_opponent_progress.test.mjs engines/melee/tests/confirmed_input.test.mjs engines/melee/tests/browser_bridge.test.mjs engines/melee/tests/netplay_identity.test.mjs engines/melee/tests/netplay_lifecycle.test.mjs engines/melee/tests/source_pivot_contract.test.mjs engines/melee/tests/friend_origin.test.mjs
PYTHONPATH=engines/melee python3 -m unittest discover -s engines/melee/tests -p test_native_source.py
```

For transport/room changes, also select the room/relay/friend tests linked in the
table. They bind disposable loopback listeners and require local socket access.
For import or donor-policy changes, select the Python tests linked in those rows;
some converter tests skip when local game data/generated GLBs are absent. Record
the exact skip reason. Do not copy private or game assets into tracked fixtures.
For a wider website change, `npm test --prefix web-prototype` is the existing
website suite; `npm run build --prefix web-prototype` checks its production build.

Actual launcher proof requires an already running authorized local site, installed
Chrome/Playwright, the player's legal local disc and an installed accepted source.
Use a quiet GPU window. Output must be private and outside the repository:

```sh
MELEE_PLAYWRIGHT_MODULE=/absolute/path/to/playwright node engines/melee/tools/prove_launcher_flows.mjs --origin http://127.0.0.1:PORT --iso /private/path/game.iso --character INSTALLED_SLUG --output /private/path/proof
```

The [harness](../engines/melee/tools/prove_launcher_flows.mjs) exercises solo,
Retry, cached refresh, companion results and return. Its optional
`--profile-seconds 30` records diagnostics; `--debug-scenario delay|jitter|hold|reference`
injects owned acquisition waits, not WAN conditions. The existing
[protocol browser harness](../engines/melee/tools/prove_confirmed_input.mjs) uses
`PLAYWRIGHT_MODULE` and an output filename; it needs no game assets. The
[real-engine research harness](../engines/melee/tools/prove_netplay.mjs) uses
`MELEE_PC_ROOT`, `MELEE_ISO`, `PLAYWRIGHT_MODULE` and private `TEST_OUTPUT`; its
standalone surface is a different scope from normal-site acceptance.

## Updating coverage when a feature changes

Use the repo skill at [feature-verification](../.agents/skills/feature-verification/SKILL.md).
Update affected rows and evidence only. Choose tests by the behavior/ownership
boundary changed, then add one browser check when fixtures cannot establish the
claim. A docs-only clarification needs link/command/source checks, not a full
gameplay run. An untouched historical result keeps its original revision; do not
silently relabel it as a current pass.

For each new result record source SHA, runtime/build or input identity when
relevant, UTC date, environment/device/browser, exact command or manual steps,
outcome, skip/failure reasons, and limits. Separate staging from served-build
verification. Public evidence contains generic behavior/results only. The private
companion owns identity mappings, accepted source/base matrices, release manifests,
asset/render evidence and private rollout/rollback receipts.

Open acceptance gaps: physical multi-controller/hotplug testing, TV streaming,
true two-device WAN (two owned acquisition boundaries, real progress and latency),
current phone handoff/gameplay, and gameplay using relocated roots. A future WAN
check must exercise two devices and distinguish transport delay from engine/input
waits. No simulated companion, synthetic gamepad or checksum subset closes these
gaps. Full browser rollback needs complete state ownership and remains unsupported.
Custom-domain homelab deployment is unimplemented; the observed private HTTPS
surface uses a restricted tailnet origin. No recovery or deployment work is part
of this documentation change.

- **E9 — local selection repair candidate:** source `a5ea3b2cac7df780d7d43f93ea8391c2771a3fe9`,
  2026-10-14 UTC, macOS, fresh headless Chrome contexts on isolated loopback, with and without the optional room chooser.
  Runtime WASM SHA-256 `780c8e1ba76c3277cfa9baae4c52b3afa9934f1d8fbdc601985e831b11b05bf7`;
  browser runtime module `f1e92a121b7eec52c321adb6029eac845fe5a91e6c7a6bd478ab642cdb25d04c`.
  38 focused Node, 31 related room/controller regressions and four Python HTTP regressions passed. The
  opt-in [browser proof](https://github.com/alex-furrier/opensmash/blob/a5ea3b2cac7df780d7d43f93ea8391c2771a3fe9/engines/melee/tools/prove_local_selection.mjs)
  exercised two synthetic standard gamepads through navigator polling, website
  cursor P2 assignment and start clicks, submenu/native-dialog B-back, right-stick scrolling, two distinct selected
  source IDs, both native fighter kinds, 210 advancing ticks, one-pad-at-a-time directed movement with the other observed input neutral,
  return and P2 replacement. B closed the native base picker without erasing choices; its cursor rendered in the dialog top layer. Website cursor input was disabled during the match. Swapped/mirrored/opposite/missing input-trace fixtures were rejected. Unchanged neutral packets were retained as observed held inputs across the bridge’s deduplication. A native lifecycle DOM fixture also blocked website input; native gameplay was not run.
  Display alias labels preserved source identity; an ordinary All-roster portrait
  decoded as a 90×86 derivative. Run with `MELEE_PLAYWRIGHT_MODULE` set to an
  existing Playwright installation, then `node engines/melee/tools/prove_local_selection.mjs
  --origin <isolated-loopback-origin> --iso <legal-local-disc> --output <private-evidence-directory>`.
  Receipts and images remain private. This establishes candidate browser behavior;
  it does not certify physical hardware, native select-menu control, full-match
  results, new donor pairs, or a live deployment.

- **E10 — controller preparation menus:** implementation `7dde67eb62f0ef406e86a6c791e42223700f7a5c`, 2026-10-14 UTC, macOS Chrome with two isolated browser peers and synthetic standard pads. Website cursor ownership remains available while preparing or waiting for Ready, transfers to the engine at selection/start, and returns after launch failure. Two peers supplied their own legal local disc, selected two fighters, created/joined the observed room link, clicked Ready using their own polling-driven cursor, reached gameplay with both website cursors hidden, advanced 90 ticks, then stopped and returned. Seven focused selection/lifecycle checks passed; independent source review reported no findings. Repeat with two fresh Chrome contexts on an isolated configured host; use the existing P1 cursor for Create room, Join room and Ready, then verify `data-melee-input-owned` changes from false to true before gameplay. Native boot/match blocking remains a DOM fixture; physical controller and WAN certification remain unrun. Private receipts remain private.

- **E11 — two-controller menu and optional host loading:** merged source `7a6b522456890f122122f9ab444d27379ffaa67e`, 2026-10-14 UTC. Thirty-nine focused tests passed. The [controller browser proof](../engines/melee/tools/prove_controller_selection.mjs) exercised independent picks, reconnect, held-button edges, roster invalidation, distinct 90-tick input phases, replacement-device neutrality and return. The private HTTPS match advanced 210 ticks; physical controllers and Safari remain unverified. [Host loader regressions](../engines/melee/tests/host_disc_download.test.mjs) cover corrupt/interrupted downloads, cancel/retry and preservation of the previous cache. Follow-on per-port regression covers duplicate fighters and a P2-owned base dialog.
- **E12 — app-relative configured host disc:** observed 2026-10-14 UTC on macOS 26.6.1 (build 25G76), Chrome 155.0.8059.79 through the existing Playwright Chrome channel, and Node 26.7.0. The tested implementation was `e47e7c4ec282d67c25d3594f0bfc4276b05be194`; squash merge `483793bfabaae80ce86228c0194742569554d38a` has the identical source tree. The runtime content revision was `3b45217ed4e9277026720664581b0e0ed7597f5030798a36b9190a48e1bb260c`, reported as `identity.engine` by `/melee/api/netplay/manifest`. Runtime files remained unchanged: `runtime.mjs` SHA-256 `f1e92a121b7eec52c321adb6029eac845fe5a91e6c7a6bd478ab642cdb25d04c`, browser JS `5d69f2fd4a2ddcff50cc5d04084bcd14fb9b3eefef0cde96861855aec97ceda7`, and WASM `780c8e1ba76c3277cfa9baae4c52b3afa9934f1d8fbdc601985e831b11b05bf7`.

  **Observed:** the complete HTTP stream matched 1,459,978,240 bytes and pinned disc SHA-256 `0de05981a34156b9cedcef73c73d4244ac05cf6149ab3c9cfed917698819e464`. The [pinned browser proof](https://github.com/alex-furrier/opensmash/blob/e47e7c4ec282d67c25d3594f0bfc4276b05be194/engines/melee/tools/prove_host_disc.mjs) exercised app-relative download, progress, cancel/retry, existing import/cache, 60 game ticks and reload without another ISO request. After server and browser restart, the persistent profile launched from cache with zero disc GETs and at least 60 further ticks. The postmerge check repeated cached gameplay with unchanged runtime and private-asset hashes. [Pinned fixed-file tests](https://github.com/alex-furrier/opensmash/blob/e47e7c4ec282d67c25d3594f0bfc4276b05be194/engines/melee/tests/host_disc_server.test.mjs) cover size/digest, route/method/range rejection and existing private-origin policy.

  **Repeat:** use that source tree, the content-identified runtime and existing dependencies. Configure the owned ISO privately with `MELEE_HOST_DISC_FILE`, retain the approved private origin and loopback binding from the [runbook](local-melee-runbook.md), and confirm the runtime identity above. Set `MELEE_PLAYWRIGHT_MODULE` to the existing Playwright module. Choose a fresh private evidence directory outside Git and the approved app origin, then run:

  ```sh
  node engines/melee/tools/prove_host_disc.mjs --origin "$APP_ORIGIN" --output "$PRIVATE_PROOF" --phase download
  ```

  Stop and restart only the test-owned website using the same private environment; keep the asset helper and network mapping unchanged. Reopen the same proof profile:

  ```sh
  node engines/melee/tools/prove_host_disc.mjs --origin "$APP_ORIGIN" --output "$PRIVATE_PROOF" --phase restore
  ```

  Inspect both JSON receipts: exact size/digest, successful cancel/retry, gameplay progress and zero ISO GETs on restoration. The separate shutdown repair is recorded at source `06b345494c392ad3d113a69824c241e8afef43a5`. Check out that repair revision, rather than the historical E12 implementation, to repeat its configured and unconfigured regression with existing private inputs:

  ```sh
  MELEE_TEST_ENGINE_ROOT="$MELEE_ENGINE" MELEE_TEST_HOST_DISC_FILE="$MELEE_DISC" node --test engines/melee/tests/friend_site.test.mjs engines/melee/tests/host_disc_server.test.mjs engines/melee/tests/host_disc_download.test.mjs
  ```

  **Limits:** this establishes Chrome behavior on the stated Mac with the existing private app and disc. It does not certify Safari, physical controllers, fresh-machine setup, alternative discs, WAN performance or broader access. The explicit server configuration serves ISO bytes only to the app's existing authorized audience. ISO bytes, browser profiles, private paths and screenshots are excluded from the repository; private receipts remain private.

- **E13 — roster tabs and private ordering:** source `eb4d484757ff3549013b1335e4e827cf20292c46`, observed 2026-10-14 UTC on macOS 26.6.1, Node 26.7.0 and Chrome 155.0.8059.79. The candidate frontend was built and served by an isolated loopback Node process; no engine runtime was loaded. The [Chrome proof](../engines/melee/tools/prove_roster_tabs.mjs) uses generic API fixtures and separate browser contexts. Fresh storage and each legacy saved tab opened Friends and Family; the later High School selection survived reload. Per-port base choices survived migration, tab changes cleared old picks, and explicit manifest order reached the grid. The longer label was inspected at 1440px and 390px widths. Twenty JS regressions and five private-import fixture tests passed; the frontend build passed. This is menu evidence, not new source/gameplay acceptance, physical-controller or Safari certification. No live deployment or private asset update was performed.

  Tabs retain IDs `family`, `high-school`, `all`. The existing preference key `melee-roster-ui-v1` gains `defaultVersion: 2`: legacy state adopts `family` once while preserving `choices`; subsequent valid tab choices persist. Reset All Settings returns to `family` with empty choices. Private manifest entries may supply `rosterOrder`, an integer from 0 through 1,000,000. Lower numbers appear first among installed entries; equal numbers preserve manifest order, and unspecified entries follow in manifest order. Without this field the prior order is unchanged. Category IDs, source identity and asset links stay stable. Names, group membership and the actual ordering values belong in private configuration.

  From the repository root, repeat the fixture checks:

  ```sh
  node --test web-prototype/shared/melee-roster-choice.test.js web-prototype/shared/controller-selection.test.js
  PYTHONPATH=engines/melee python3 -m unittest discover -s engines/melee/tests -p test_private_roster.py
  ```

  Use the existing Python environment with Pillow and NumPy. Build the frontend in `web-prototype`, then serve the candidate on an isolated loopback port using `SERVE_BUILT_FRONTEND=1` and `FIGHTER_WORKER_DISABLED=1`. Against that candidate, run:

  ```sh
  MELEE_PLAYWRIGHT_MODULE="$EXISTING_PLAYWRIGHT_MODULE" node engines/melee/tools/prove_roster_tabs.mjs --origin "$CANDIDATE_ORIGIN" --output "$LOCAL_EVIDENCE"
  ```

  Inspect `result.json`, `tabs.png` and `tabs-narrow.png` outside the checkout. The tool opens its own Chrome contexts; it does not use existing play tabs or import private assets.

- **E14 — match toolbar and selection polish:** source `53ee18bff387ca7263054b9160da7a826562e666`, observed 2026-10-15 UTC on macOS 26.6.1, Node 26.7.0 and Chrome 155.0.8059.79. The isolated loopback preview served the built frontend with the unchanged E12 runtime content revision. Fifty-four focused roster, launch, preference, controller and touch tests passed; the frontend build passed.

  The [UI proof](../engines/melee/tools/prove_ui_polish.mjs) observed real game progress at 390×844 and 320×640 portrait, 844×390 landscape, portrait and landscape fullscreen, and 1440×1000 desktop in page and fullscreen. The toolbar and its 44px actions stayed above the rendered picture. Short portrait screens reduced the picture before clipping the touch deck; landscape play hid the website navigation while retaining match controls. Emulated touch attack and stick input reached the engine acquisition boundary; release and viewport rotation restored neutral input. This establishes layout and input routing, not sustained performance or physical touch-device certification.

  The [controller proof](../engines/melee/tools/prove_controller_selection.mjs) repeated independent locks, duplicate-source base editing, reconnect, two directed 90-tick input phases, replacement-device neutrality and return. Two fresh local companion sessions each advanced 120 logical ticks through lobby, Ready, Stop and return, with distinct session IDs and terminated owned match frames. The helper remains a scripted browser peer, with no WAN or native CPU AI claim.

  **Repeat:** build the frontend using existing dependencies and serve an isolated configured preview as in the [runbook](local-melee-runbook.md). Use a dedicated private Chrome profile and evidence directory outside Git, then run:

  ```sh
  MELEE_PLAYWRIGHT_MODULE="$EXISTING_PLAYWRIGHT_MODULE" node engines/melee/tools/prove_ui_polish.mjs --origin "$CANDIDATE_ORIGIN" --output "$PRIVATE_PROOF" --profile "$PRIVATE_PROFILE" --iso "$LOCAL_DISC"
  ```

  Inspect `geometry.json` and the seven layout screenshots. `--iso` is optional when the profile already holds a verified local disc. The proof keeps initialization input neutral because upstream A-held startup intentionally swaps Zelda and Sheik. The idle start row is hidden; selecting a fighter reveals **Start match** beside the roster tabs. Two-controller selection still exposes its readiness hint. Character defaults and accepted alternate choices retain their existing storage and validation rules. Private roster assignments, per-person game receipts and screenshots remain outside this fork. No live deployment, public asset update or Safari certification was performed.
