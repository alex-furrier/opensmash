# Melee multiplayer: local confirmed-input prototype

This branch contains an opt-in engine source patch, a two-player confirmed-input
session, and a standalone loopback browser lobby. The candidate WASM builds and
focused tests pass. **Real-engine browser gameplay is not yet verified**; the
integration remains local and unpushed until that proof is complete.

The ordinary launcher and clean engine pin remain unchanged. No hosting,
deployment, ROM transfer, reconnect into an old match, or rollback is included.

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
The personalized-character pipeline is preserved; this prototype accepts stock
Fox versus Captain Falcon on Final Destination only.

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

Focused acceptance currently passes 22 JS cases plus the real loopback server
case, and two extracted-C tests (actual queue/consumer logic and launcher port
mapping). The lifecycle tests deliberately delay old socket/audio/Ready events
across fresh rooms. The C harness replaces JS suspension and platform services;
it does not prove Asyncify, the complete scene loop, graphics or audio behavior.

```sh
node --test engines/melee/tests/confirmed_input.test.mjs engines/melee/tests/browser_bridge.test.mjs engines/melee/tests/netplay_identity.test.mjs engines/melee/tests/netplay_lifecycle.test.mjs engines/melee/tools/netplay/rooms.test.mjs
node --test engines/melee/tools/netplay/server.test.mjs
python3 /path/to/isolated/melee-pc/tests/browser/test_confirmed_input.py
```

## Remaining real-engine acceptance

`engines/melee/tools/prove_netplay.mjs` is prepared but unexecuted. It uses fresh
Chrome contexts, the actual lobby/relay, and local File selection. Its script
acquires distinct pads at each client's owned C callback, requires independently
timed fighter attacks, movement, stock loss/respawn and matching 4,000-tick applied
traces, then runs an ordered hold, seeded message jitter, applied-input mutation,
startup RNG intervention after Ready validation, actual disconnect during a held
acquisition, and fresh neutral runtimes. It writes trace details to the local
output directory; public summaries contain hashes and metadata. These scenarios
are application-protocol checks, not TCP packet-loss or WAN measurements.

The gameplay browser is held while the separate benchmark owns the quiet window.
When released, prove two independently owned acquisition callbacks, exact applied
PADStatus traces and selected state at logical ticks; movement, independent attack,
stock loss and respawn; terminal confirmation; actual input and RNG mutation
controls; seeded ordered holds, timeout/disconnect and fresh-runtime neutral
recovery. Require progress and milestones, not matching idle traces. Verify solo
behavior and scene transitions. Stop on mismatch, queue invariant failure, crash,
missing milestone or five seconds without progress after release; preserve failure
evidence rather than weakening a comparison.

The earlier asset-free browser report remains evidence for its recorded module
hash and counter fixture only. It supplies no gameplay result for this candidate.
WAN performance, background tabs, audio wall-clock interactions, cross-platform
determinism, fixed-delay pipelining, reconnect and complete rollback remain
unsupported until separately established.

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
