# Melee multiplayer in the OpenSmash launcher

The current entrypoint is the normal website at `/melee`. **Create room** uses
its roster to choose and freeze two fighters. First-time players select their
own unmodified USA 1.02 ISO/GCM and complete or skip the controls check. Both
browsers independently prepare and verify runtime, disc, costume/CSS bytes,
rules and seed before **Ready** starts confirmed-input play in the original
Melee game loop. **Stop** ends the room; **Rematch** creates a fresh session with
the assigned lineup; **Return to roster** leaves the experience. Shared
`/melee#room=<code>` links enter disc setup and joining directly.

An explicitly configured local scripted browser opponent uses that same input
path. Explicit private roster exports reuse the existing character validator
and conversion pipeline; source assets remain outside Git. The ordinary solo
launcher remains available. Browser-local disc storage and the main launcher's
**Settings → Share with another device** peer handoff remain wired. The older
standalone prototype's temporary one-tap download grant is not part of this
flow. A saved copy from the same HTTPS origin/browser can still be restored.

Private development remains loopback-bound. Optional `MELEE_PRIVATE_ORIGIN`
admits one exact HTTPS tailnet origin, without Funnel. The website denies raw
game files, disc-management/native-process APIs and system bundles, including
requests claiming a loopback Host. No public deployment, native CPU AI, complete
rollback snapshot or reconnect into an old match is included.

## Current validation and historical evidence

Production source at `185ea0c7` passed a private HTTPS Chrome flow through
selection, verified Ready, rendered combat, actual results, Stop and return,
with 1,959 matching applied-input/selected-state ticks. Twenty-four real HTTPS
raw-route/Host-spoof controls, three wrong-origin WebSocket controls, and nine
boundary/startup tests passed. An earlier private roster run exercised all nine
retained packages through the main launcher, totaling 17,498 matching ticks.
Those traces, screenshots, models and disc files remain private; they are not
repository fixtures or hardware certification.

At source/test checkpoint `d8e549ac`, the website suite passed 333 tests; Melee
Python ran 196 cases with 12 skips and no failures. TypeScript and the production
build passed. The Melee JS/relay suite had 130 passes, two skips and three failures
reproduced from exact upstream main (audio startup, legacy session fixture and
root-path expectation). Root Python had three emblem-fallback errors because
optional OpenCV was absent. Broader suites are not reported green. Independent
four-lane source reviews passed the roster repairs, final routing delta and
test-only teardown fixture cleanup at their recorded scopes.

Physical Bluetooth controller, actual iPhone gameplay/handoff, WAN behavior and
complete-state equivalence remain unverified. Selected-state digests do not
establish rollback; application-message faults over WebSocket/TCP are not
transport packet loss. Existing paired file-transfer browser proof belongs to
the historical standalone adapter, not an iPhone or current main-flow test.

The standalone lobby and fixed stock preset described below are retained
research adapters and historical evidence. Their reference, ordered-hold and
seeded-jitter predecessors each passed 4,000 ticks with movement, attacks, stock
loss and respawn, plus mutation/disconnect/fresh-session controls. Those results
retain their original candidate identities; they do not certify every later
launcher or runtime revision.

## Ancestry and game selection

This repository is a history-preserving fork of
[turtlesoupy/opensmash](https://github.com/turtlesoupy/opensmash), based on
`41410c4336df193ea693f8a1afdb9ee0a96bcf5a`. Its MIT LICENSE remains unchanged.
Engine licenses and authorship remain with their respective upstream projects.
The launcher/session/relay additions are original MIT code. The engine patch
preserves upstream authorship and licensing: port code is GPL-3.0-or-later,
while upstream labels the decompiled game directories unlicensed. See the
[engine licensing](https://github.com/turtlesoupy/opensmash-melee-pc/blob/5bc531aafcc941866f2c916afebc38ee75543222/LICENSE.md).
No game assets or experiment binaries were imported.

Both games are supported on upstream **main**, not merely historical branches.
The README says “Super Smash Bros. 64 and Super Smash Bros. Melee in the browser”.

| Game | Actual source/build path |
| --- | --- |
| Smash 64 | Sibling `turtlesoupy/BattleShip`, its decomp/libultraship/Torch dependencies, Emscripten CMake target `BattleShip.js`, and `scripts/package_web.sh`. [Build commands](https://github.com/turtlesoupy/opensmash/blob/41410c4336df193ea693f8a1afdb9ee0a96bcf5a/README.md#1-build-the-engine). Native/ROM targets also use root `build.py`; see [BUILDING.md](https://github.com/turtlesoupy/opensmash/blob/41410c4336df193ea693f8a1afdb9ee0a96bcf5a/BUILDING.md). |
| Melee | `engines/melee/tools/build_upstream.py` builds sibling Melee PC; `serve_melee.py --upstream` serves its runtime, and `web-prototype` mounts the launcher at `/melee`. [Build instructions](https://github.com/turtlesoupy/opensmash/blob/41410c4336df193ea693f8a1afdb9ee0a96bcf5a/engines/melee/UPSTREAM.md). The retained direct-C/recompiler engines are comparison/native paths, not the site's default. |

The [root .gitmodules](https://github.com/turtlesoupy/opensmash/blob/41410c4336df193ea693f8a1afdb9ee0a96bcf5a/.gitmodules)
contains `engines/melee/melee` → `doldecomp/melee`, pinned in the tree to
`64fccd19a0e7c8d54a1da6c56235016b659c354f`. This is the structure reference;
it is not the browser engine checkout. The
[engine pin](https://github.com/turtlesoupy/opensmash/blob/41410c4336df193ea693f8a1afdb9ee0a96bcf5a/engines/melee/upstream.json)
selects `turtlesoupy/opensmash-melee-pc`, `opensmash/browser`,
`5bc531aafcc941866f2c916afebc38ee75543222`; its ancestry records
`999sian/melee-pc` at `ac684f13d24b8dbb4058915f17718ae81861bd3e`.

GitHub branch metadata checked 2026-10-11: OpenSmash has `main`,
`agent/attack-pipeline`, `agent/rom-extract`, `archive/local-before-sync-2026-09-02`,
`canonical-retarget-ref`, `codex/melee-direct-c`, `codex/melee-integration`,
`codex/sync-local-changes-2026-09-02`, and `experimental-phone-optimization`.
Melee PC has `master`, `browser-platform`, `opensmash/browser`, and
`opensmash/sync-2026-09-19`. The current browser branch matches the engine pin.
No repository AGENTS.md, .agents, .codex or SKILL.md instructions were found in
either isolated checkout. Melee is selected per the owner's preference.

## Source-grounded boundary

The engine says “One simulation tick” above `gm_RunSimTick`.
[`gmscene.c:283–389`](https://github.com/turtlesoupy/opensmash-melee-pc/blob/5bc531aafcc941866f2c916afebc38ee75543222/src/melee/gm/gmscene.c#L283)
owns scene progression: `gm_801A4D34` reads the raw pad queue count, calls
`pc_net_sync()`, calls `gm_RunSimTick()`, and handles native resimulation through
`pc_net_after_tick()`. Rendering remains outside that tick iteration.
The new session never calls or replaces that loop.

[`pc_net_sync():1810`](https://github.com/turtlesoupy/opensmash-melee-pc/blob/5bc531aafcc941866f2c916afebc38ee75543222/src/pc/net.c#L1810)
already replaces the head that the simulation consumes. The native implementation
uses UDP and prediction/rollback; when neither native netplay nor recording is
active it increments the frame and returns. Its native rollback facilities do
not establish browser snapshot support.

[`HSD_PadRenewRawStatus():55`](https://github.com/turtlesoupy/opensmash-melee-pc/blob/5bc531aafcc941866f2c916afebc38ee75543222/src/sysdolphin/baselib/controller.c#L55)
samples `PADRead(now)` into the raw queue. A full queue with `qtype == 2` drops
new physical samples instead of shifting the consumed head. Master-status renewal
at line 356 consumes that head and copies all PADStatus fields. Queue preservation
across an Asyncify suspension must be tested, including queues larger than one
entry; changing qtype alone does not make a non-full queue immutable.

[`runtime.mjs:32`](https://github.com/turtlesoupy/opensmash-melee-pc/blob/5bc531aafcc941866f2c916afebc38ee75543222/platforms/browser/runtime.mjs#L32)
owns physical browser pad publication and short button latches.
[`Game.tsx`](https://github.com/turtlesoupy/opensmash/blob/41410c4336df193ea693f8a1afdb9ee0a96bcf5a/engines/melee/web/app/Game.tsx)
publishes UI/controller samples through the existing runtime transport.
Acquisition must be mapped from one physical controller to the room-assigned
engine slot at the engine boundary, not by sending another player's controls.

The existing `handoff-rooms.js` is for laptop-to-phone ROM transfer. It must not
be reused for gameplay. Character generation/conversion stays as-is; peers will
need identical verified costume manifests before Ready.

## Implemented contract

`engines/melee/runtime/web/netplay/confirmed-input.mjs` exposes
`createConfirmedInput({channel, session, player, identity, timeoutMs})`.
The channel is one ordered, reliable connection to the assigned peer and must
report disconnects. `send` dispatches synchronously; async transport failures
must invoke the disconnect callback. Room authorization belongs to that transport.
This is not a room registry or generic engine coordinator.

1. Construct both sessions, subscribe their transports, then call `start()`.
2. At each existing engine tick boundary, call
   `await synchronize(tick, acquireOwnedPad, priorSelectedStateDigest)`.
3. Ready must agree on protocol version, engine/disc/rules/costume identities and
   seed before the owned acquisition callback runs. These identities must be
   computed from verified local values; equality alone does not verify assets.
4. Each peer acquires its own PADStatus exactly once and sends only its assigned
   slot. The ten integer fields are button, stick X/Y, substick X/Y, left/right
   triggers, analog A/B and error, in that order. No C struct padding is transmitted.
5. Both inputs and prior selected-state digests must agree with the protocol,
   then both peers acknowledge acceptance before returning four pads. Slots 2/3
   are neutral; only two human players are supported. Missing input is never
   substituted. Delay is zero configured frames; transport stalls add latency.
6. Duplicate/out-of-order/wrong-session messages, mismatches, missing peer,
   timeout or Stop fail closed. Close the runtime as well as the session. A new
   match requires a fresh runtime, fresh session identifier and fresh transport.
   No reconnect into old simulation state is supported.
7. After the actual raw head is consumed and the engine tick completes, call
   `await confirmApplied(tick, selectedStateAndAppliedPadDigest)`. Both peers
   compare and acknowledge that result before the next tick or finite-trial
   completion. The final tick is covered by this same gate.
8. Intro/match graphics readiness travels with each input packet. The adapter
   releases preparation only when both flags are true for the same confirmed
   tick; wall-clock graphics readiness cannot advance one simulation early.

At most one local synchronization and one remote pad packet are retained.
Input delivery acceptance cannot prove identical execution. The bridge hashes
RNG, scene kind, four upstream 12-float player records as raw bits, and the
actually consumed pads after every tick. This is explicitly selected state,
not a full game snapshot or proof of complete state closure.
Application message suppression tests protocol faults, not TCP packet loss.

## Evidence and acceptance gates

Run from repository root:

```sh
node --test engines/melee/tests/confirmed_input.test.mjs
# Requires an existing Playwright installation and installed Chrome.
# PLAYWRIGHT_MODULE can point at the installed playwright package.
node engines/melee/tools/prove_confirmed_input.mjs /tmp/browser-protocol-proof.json
```

The Node proof passed 12 cases, including 4,000 matching fixture ticks with
distinct inputs acquired independently, canonical fixture-state parity, seeded
ordered delay/jitter, a hold, input/state mutations, bad owner/session/sequence/pad,
missing-message timeout, Stop/disconnect, concurrent-boundary rejection and fresh
neutral isolation. The fixture is deliberately a tiny counter, not Melee.

The Chrome proof uses two fresh browser contexts, independent module/session
memory and a task-owned ordered host relay. All requests are intercepted for the
fixture and module; no server binds a port and no assets are read. It passed
600 fixture ticks, a measured ~81 ms hold at 450, input mutation stopping before
31, state mutation/disconnect stopping before 30, and 600 fresh neutral ticks.
Source/trace hashes, browser version, progress and negative-control results are
recorded in `browser-protocol-proof.json` alongside this document. It does not
test WebSocket transport or the game runtime.

The broader Melee Node suite: 70 pass, 7 fail, 2 skip in the initial restricted
run (including these new tests). Three loopback failures were sandbox restrictions;
the complete server file passes all 5 tests with loopback access. Other failures:
missing zip dependency, `window` absent in browser-session test, audio-startup
assertion, and monorepo-path assertion. The shared-site suite completed with
190 pass and 7 fail, encountering missing dependencies and loopback restrictions.
These suites are not reported green. These baseline failures are separate from the new focused tests. Audio startup,
browser-session and monorepo-path failures were reproduced in a pristine archive
of upstream `41410c4`; missing dependencies remain environment limitations.

Dependency versions were read from current source and lockfiles, not refreshed:
site pnpm 11.5.0, React 19.2.8, Vite 8.2.2, three 0.160.1;
engine pin Emscripten 6.0.9/LLVM 22, documented GCC 16/Node 22.13+.
The proof used existing Node 26.7.0 and Chrome 155.0.8059.39.

## Local engine and lobby

`runtime/patches/browser/confirmed-input.patch` applies only to pinned engine
`5bc531aafcc941866f2c916afebc38ee75543222`. Its adjacent JSON pins the patch and
each modified source file. Preparation rejects unrelated checkout changes:

```sh
python3 engines/melee/tools/prepare_confirmed_input.py /path/to/isolated/melee-pc --apply
# Use the existing pinned toolchain; this helper installs nothing.
cd /path/to/isolated/melee-pc
python3 tools/browser/build.py --jobs 2
```

The patch adds a browser capability, Asyncify gates before/after the existing
`gm_RunSimTick`, and an observer at actual raw-head consumption. The suspended
queue head is held with queue type 2; physical tail samples are discarded before
the confirmed head is consumed. Four complete ten-field PADStatus records are
validated without struct padding. Each launcher fighter uses the upstream
one-based port override, correcting the original shared-port-zero mapping.
Native netplay, record/replay and synctest cannot share this owner. Solo hooks
remain disabled, and no alternate simulation loop was introduced.

The runtime validates replacement assets and match configuration before starting
the input session. A netplay launch independently verifies the local disc and
served runtime bytes, derives rules/stock-costume/seed identity, and uses a fresh
memory card. Fail/Stop closes the room; recovery destroys the whole iframe and
worker pool. Stale socket, audio and Ready continuations cannot act on a new room.
The historical standalone adapter uses stock Donkey Kong versus Fox on
Battlefield. The current main launcher instead resolves its selected fighters,
custom assets and match settings into the room proposal. The historical preset
uses upstream CharacterKind IDs 1/2 and
external StageKind 31, as defined in [fighter enums](https://github.com/turtlesoupy/opensmash-melee-pc/blob/5bc531aafcc941866f2c916afebc38ee75543222/src/melee/ft/forward.h#L130)
and [stage enums](https://github.com/turtlesoupy/opensmash-melee-pc/blob/5bc531aafcc941866f2c916afebc38ee75543222/src/melee/gr/forward.h#L175).

From repository root, after building the candidate:

```sh
cd engines/melee/tools/netplay
npm ci --ignore-scripts
node server.mjs --engine-root /path/to/isolated/melee-pc --port 8787
```

Open `http://127.0.0.1:8787/` in two browser windows. Create a room, copy its link,
join in the other window, choose each window's legal local USA 1.02 ISO, then
press Ready in both. The relay binds **127.0.0.1 only** and validates Host and
WebSocket Origin. It allowlists source/runtime files, caps message and room
buffers, and has no asset upload or disc route. It sends only input, selected
state digests, readiness, and session metadata. This local link is usable only
on the same computer. Remote hosting requires separate work and approval.

The relay uses pinned `ws` 8.22.0 (verified against its official package source).
It is isolated from the existing frontend dependencies. No network or OS settings
were changed. The candidate build used an existing Emscripten 6.0.9/LLVM 22
installation and private copies of its cache and dependency sources: 989 game
units, 639 build steps, two jobs, 405.28 seconds. Build and copied caches occupied
about 1.9 GB. Peak RAM was not measured. `candidate-build.json` records the exact
compiled JS/WASM and served-source hashes; it contains metadata only.

Focused acceptance currently passes 23 JS cases plus the real loopback server
case, and two extracted-C tests (actual queue/consumer logic and launcher port
mapping). The lifecycle tests deliberately delay old socket/audio/Ready events
across fresh rooms. The C harness replaces JS suspension and platform services;
it does not prove Asyncify, the complete scene loop, graphics or audio behavior.

```sh
node --test engines/melee/tests/confirmed_input.test.mjs engines/melee/tests/browser_bridge.test.mjs engines/melee/tests/netplay_identity.test.mjs engines/melee/tests/netplay_lifecycle.test.mjs engines/melee/tools/netplay/rooms.test.mjs
node --test engines/melee/tools/netplay/server.test.mjs
python3 /path/to/isolated/melee-pc/tests/browser/test_confirmed_input.py
```

## Real-engine acceptance

[gameplay-proof.json](gameplay-proof.json) records the preceding candidate's evidence from
Chrome 155.0.8059.39. The test uses the actual lobby/relay and each window's local
File selection. Distinct scripted pads enter at each client's owned C acquisition
callback; comparisons use actual applied four-port PADStatus records and the
selected 50-word state at every logical tick, including the final tick.

| Scenario | Observed result |
| --- | --- |
| Reference | 4,000 matched ticks per client; independently timed attacks, movement, stock loss/respawn, rendered frames and mixer audio progress. |
| Ordered hold | Same gameplay requirements; an 80 ms owned-input hold stops both logical traces until release. |
| Seeded ordered jitter | Same gameplay requirements under 0–2 ms application-message delays. |
| Applied-input mutation | Actual accepted pad mutated before consumption; both stop at 582 confirmed ticks. |
| Startup RNG mutation | Seed changed after Ready validation, before actual game startup; stops before tick zero. |
| Disconnect | Client closes during held acquisition at tick 900; peer stops with no further confirmed progress. |
| Same-page fresh room | Old engines/workers closed, new room and fresh iframe, 4,000 matched neutral ticks from tick zero. |
| Solo smoke | Initial setup acknowledged; playable scene 2, 300 rendered frames, netplay hooks disabled. |

Reference, hold, jitter, both mutation controls and fresh recovery verify zero
surviving workers after Stop/failure. Disconnect verifies fail-stop progress; its
contexts are closed in final cleanup. Pool termination is requested synchronously
before iframe removal; actual worker targets close asynchronously, within the
bounded five-second check (about 1.5–2 seconds observed).
The 23 focused JS cases, one real HTTP/WebSocket server case and two extracted-C
cases provide narrower failure/lifecycle checks. The real-game evidence does not
inherit results from the separate prior experiment.

Run the private acceptance driver only in an assigned quiet window, supplying
`MELEE_PC_ROOT`, `MELEE_ISO`, `PLAYWRIGHT_MODULE` and an outside-repository
`TEST_OUTPUT`, then `node engines/melee/tools/prove_netplay.mjs`. The default
`build/netplay-proof` directory is ignored by the root `/build/` rule. Screenshots,
raw game traces and local assets remain private; the public report contains only
source-bound metadata and trace hashes. Earlier failed attempts are retained
locally and their causes are summarized in the report.

The solo smoke test uses the existing controller acknowledgement for initial
memory-card setup, then requires playable scene 2 and 300 rendered frames with
confirmed-input ENV and callbacks disabled. Earlier missing-input timeouts are
retained as driver failures. This smoke check is narrower than a complete solo
regression suite. Full timed match/results transitions, WAN performance, background tabs, audio wall-clock
interactions, cross-platform determinism, fixed-delay pipelining, reconnect and
complete rollback remain unsupported until separately established. Application
message delay checks are not TCP packet-loss measurements. The selected-state
comparison does not establish complete game-state equivalence.

The earlier asset-free browser report supplies counter-fixture evidence for its
recorded module hash only.

## Prior work and alternatives

The prior [research PR 81](https://github.com/alex-furrier/research/pull/81)
(head `5247e607`, same pinned Melee engine) is read-only evidence for a separate
fixed-delay WebSocket experiment. Its reported game traces, Stop/rejoin and
selected-state results are not results for this new module. No experiment paths,
scenario files, ROMs or binaries are encoded into production source.

[GGPO's guide](https://github.com/pond3r/ggpo/blob/master/doc/DeveloperGuide.md)
requires deterministic one-frame execution and complete save/load state for
rollback. Its [two-client launcher](https://github.com/pond3r/ggpo/blob/master/bin/start_vectorwar_2p.cmd)
informs the independent-client proof topology; its networking framework is not
imported. Browser state closure remains unresolved for statics, allocator,
Asyncify/DVD callbacks, JS and audio ownership. A selected checksum cannot replace
a full snapshot. Partial rollback and unrelated frameworks were therefore rejected.
The [Slippi desync account](https://medium.com/project-slippi/fighting-desyncs-in-melee-replays-370a830bf88b)
motivates canonical-state and actual mutation checks rather than input parity alone.

## Shared touch controls and opt-in scripted peer

The lobby and ordinary React Melee page use the same `touch-pad.mjs` pointer
ownership, radial deadzone, button OR logic and existing touch CSS. Main/C sticks
and multiple buttons can be held together; blur, hidden page, resize/orientation,
pointer cancellation and room teardown release controls. Editable fields suppress
game keyboard input. The ordinary launcher retains its existing controls.

For a local test opponent, open the second lobby window with `?debug=1`, join the
first window's room, and select **Script this peer's owned player 2** before Ready.
Both windows still choose their own legal local ISO. Only the second peer acquires
the scripted pad, once at the existing engine boundary; it shares the real room,
identity checks, Ready barrier and confirmed-input protocol. The script waits for
prepared gameplay and then moves, attacks and jumps. This is a deterministic
fixture, not native CPU AI. It does not spawn an automatic second engine.

Reference adds no wait. Delay requests 10 ms at every owned acquisition; jitter
uses seed 17 for 0–12 ms waits; hold requests 150 ms at tick 600. The UI reports
requested and measured acquisition wait separately. These are local application
waits, not RTT, real TCP packet loss or WAN measurements. Pending acquisition
times out or rejects on Stop; late completion cannot send a pad to a closed room.

[debug-touch-proof.json](debug-touch-proof.json) identifies this candidate's exact
served sources and bounded real-game evidence. The historical 4,000-tick matrix
above remains tied to its earlier engine identity. The compiled C engine and
source patch did not change for this feature. Focused JS checks include the new
shared pointer logic, deterministic debug input and async acquisition timeout.
The real Chrome touch UI fixture uses a mocked runtime surface at 390×844 and
844×390; it establishes UI behavior, not iOS or mobile gameplay support. Run
`engines/melee/tools/prove_touch_ui.mjs` with `MELEE_PC_ROOT`, existing
`PLAYWRIGHT_MODULE` and private outside-repository `TEST_OUTPUT`. The intended `npm run typecheck` now passes with lockfile-pinned TypeScript
5.9.3. Dependencies were installed using `npm ci --ignore-scripts --no-audit
--no-fund` into ignored project-local `build/melee-web-deps`; the existing tracked
dependency symlink was restored after the check. No lockfile, package version or
global tooling changed.

Phone gameplay remains unverified. The approved temporary private Tailscale Serve route is
`https://<approved-tailnet-host>:8450/` to loopback
`http://127.0.0.1:8787`, with explicit approval. Read-only inspection found port
8450 unused; existing routes must be preserved. This would require an explicit
exact host/origin allowance in the relay as well as temporary HTTPS/WSS proxying.
Both changes are active for this temporary private test. No Funnel, public ingress,
ACL or OS setting change was made. Existing tailnet access policy controls who can reach it.
The iPhone needs approved tailnet access, current Safari with WebGPU, a successful
adapter/cross-origin-isolation check, its own legal USA 1.02 ISO selected locally or received by explicit pairing, sufficient
memory/storage, and a trusted Ready tap for audio. Foreground touch, audio, Stop
and a fresh session must pass on the actual phone before claiming compatibility.

After successful phone preflight, the approved loopback relay command is
relay with `node engines/melee/tools/netplay/server.mjs --engine-root
/path/to/isolated/melee-pc --port 8787 --https-origin https://<approved-tailnet-host>:8450`. The exact HTTPS
origin allowance is implemented and tested. The relay does not
start a second engine automatically. On the phone, open the approved HTTPS base
URL and create a room (player 1). On the Mac, open a separate Chrome window at
the same HTTPS URL with `?debug=1`, paste the phone's room link/code and join
(player 2). Choose the Mac disc locally and pair it to the phone once, or select files independently. On the Mac, enable
**Script this peer's owned player 2 input**, choose a profile, and press Ready
on both. Keep Safari foreground and the Mac awake with its engine window visible;
background tabs/minimization are unsupported. Leave room closes both sessions;
create a fresh room for another test. The temporary private route is active; this is still an unverified phone run recipe.

## Approved temporary HTTPS proxy

The relay accepts an optional `--https-origin https://<approved-host>:8450`
argument. It still binds only `127.0.0.1`; HTTP Host must match either that exact
configured host or the local listener, and a WebSocket Origin must match the
request's own host/origin pair. Cross-pairs, other origins, credentials, paths and
non-HTTPS allowances are rejected. This enables an explicitly approved private
proxy without broadening the asset allowlist or serving a disc. The HTTPS/WSS
proxy was tested on the Mac, including all 19 runtime hashes and secure-context,
COOP/COEP, SharedArrayBuffer and WebGPU checks. Actual iPhone execution is pending.
The foreground Serve route lasts only while its command runs; Ctrl+C stops that
route. Stop its relay/browser processes separately. Never use `tailscale serve
reset` for cleanup because existing routes belong to other tasks.


The optional loading flow reuses upstream's existing device handoff and Melee
OPFS cache. On the Mac choose the legal USA 1.02 ISO and press **Send selected
disc**. On the phone enter the displayed code and press **Receive and save**.
Compare the short certificate-bound confirmation on both screens, then confirm
on the Mac. Pairing permits one receiver and expires after five minutes. File
bytes travel over direct WebRTC, with explicit empty ICE configuration: both
browsers must be on the same Wi-Fi; no STUN/TURN service is enabled. Pairing
keys stay in bounded POST bodies. The loopback relay accepts signalling only.

The receiver checks exact size before allocating storage, saves into upstream's
incoming staging file, verifies every pinned SHA-256 chunk of the complete
known image, then adopts that file into the existing versioned cache without a
second ISO copy. A previous saved copy remains until successful commit. Cancel,
validation failure and quota/write errors dispose partial files. Reload verifies
and restores the saved copy; **Forget saved copy** removes only this cache.
Browser storage availability, quota and eviction remain device dependent. The
local file picker remains available. This is paired transfer of the user's own
file, not the automatic public download seen in the deployed Smash64 launcher.

[disc-transfer-proof.json](disc-transfer-proof.json) records a full 1,459,978,240
byte actual Chrome transfer over the approved private HTTPS route, verification,
reload without selecting a file, and cache removal. The same real-browser
fixture covers cancellation and a sender-side byte mutation across the full
transfer; mutation fails known-disc validation and both failures remove staging
files. Focused checks also cover single receiver, expiry, exact role key,
certificate agreement, frame/queue bounds, wrong size before allocation,
quota/write cleanup, pending-fetch deadline, HTTP Host/Origin and JSON-only
routes. All 65 focused checks and the intended TypeScript check pass. Run
`engines/melee/tools/prove_disc_transfer.mjs` with private `MELEE_PC_ROOT`,
`MELEE_ISO`, `PLAYWRIGHT_MODULE`, outside-repository `TEST_OUTPUT`, and optional
approved `PROOF_ORIGIN`. No assets enter the repository or proof metadata.
Actual iPhone transfer and gameplay remain unverified.


## Local upstream launcher preparation

The normal website keeps friend rooms disabled unless `MELEE_NETPLAY_ENGINE_ROOT`
is supplied. Its ordinary startup does not load the optional relay dependencies.
For a configured local host, first run `npm ci --ignore-scripts` in
`engines/melee/tools/netplay`; the website image installs this pinned package.
Prepare a separate engine checkout at the exact pinned revision with:

```sh
python3 engines/melee/tools/prepare_confirmed_input.py /path/to/isolated/melee-pc --apply --launcher
```

This composes the confirmed-input patch and normal-launcher patch, verifies their
ancestry and every changed file, and rejects unrelated edits. Repeating the
command verifies an existing composed checkout. Build using the pinned toolchain.
The local website takes its private asset/conversion service from
`MELEE_LOCAL_ORIGIN=http://127.0.0.1:<service-port>` and its verified runtime from
`MELEE_NETPLAY_ENGINE_ROOT=/path/to/isolated/melee-pc`. Bind `HOST=127.0.0.1`;
ordinary room requests remain loopback-only. For an explicitly approved private
HTTPS proxy, set the one exact `MELEE_PRIVATE_ORIGIN`; see
[`engines/melee/server/README.md`](../../engines/melee/server/README.md#private-tailnet-development)
for route restrictions. This does not restore the historical download grant.

A shared `/melee#room=<code>` link opens disc setup and joining directly. The guest
uses the host's frozen launch proposal, without preparing an unrelated roster
selection. Each browser samples its own configured human controller independently
of the two shared game slots; choose a keyboard or gamepad before joining. Neither
CPU nor Off is a local input source.
