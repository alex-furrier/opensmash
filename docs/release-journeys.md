# Opt-in user journey checks

Use these E2E probes when a meaningful fix or broad change crosses a user journey.
They are **not required on every PR or every release**. Small regressions belong in
normal focused tests. Select the relevant journey plus its adjacent recovery path;
run the wider set when changing shared loading, input, routing or room ownership.
No CI workflow, scheduled job or mandatory gate is added here.

This supplements the historical [feature verification map](feature-verification.md).
A unit/protocol pass does not establish that the actual launcher can complete a
journey. A local two-page game does not certify WAN, phones or physical controllers.

## Running a selected journey

Use an isolated host, task-owned browser profile, legal local disc and output
outside Git. Keep credentials, room links, profiles, screenshots, private IDs and
assets out of commits. Authenticate the task profile normally if the host requires
it. These tools can create ephemeral rooms on their target: select an isolated
host rather than a shared production room registry.

Existing tools use the supplied `MELEE_PLAYWRIGHT_MODULE`; no new framework or
package install is required. `$ORIGIN`, `$ISO`, `$PROFILE`, `$OUT` and character IDs
are operator inputs, not repository defaults.

```sh
# Paired-lobby journey: actual create/join, both Ready, native progression,
# fresh rematch, disconnect/return and rejection of a stale room link.
node engines/melee/tools/prove_friend_rooms.mjs --origin "$ORIGIN" \
  --profile "$PROFILE" --iso "$ISO" --characters "$FIRST,$SECOND" --output "$OUT/lobby"
# Narrow reproduction without launching a paired match:
# same command with --only create; --gamepad-index 7 selects the sparse-input regression

# Existing owned-controller proof; choose one count per relevant change.
node engines/melee/tools/prove_controller_selection.mjs --origin "$ORIGIN" \
  --iso "$ISO" --players 4 --characters "$FIRST,$SECOND,$THIRD,$FOURTH" --output "$OUT/pads4"
# --players 2 retains the detailed ownership/base/hotplug proof;3/4 exercise
# independent native movement and return through the actual picker.

# Existing fresh-disc/default/short-results/fault-Retry probe:
node engines/melee/tools/prove_launcher_flows.mjs --origin "$ORIGIN" \
  --iso "$ISO" --character "$FIRST" --only solo --output "$OUT/solo"
# Select --only companion for the scripted second-browser path, or --only all.
```

The lobby and controller tools also accept `--context-module /absolute/adapter.mjs`
exporting `async createContext()`. This reuses an existing task fixture's Playwright
context, authentication and transport routing. Supply an already verified cached
disc or `--iso`. The adapter must stay outside Git if it contains private paths or
IDs. It must route both HTTP **and WebSocket** traffic to the intended fixture;
routing only HTTP can accidentally contact a shared room registry. No runtime,
room messages or preparation results should be mocked in a real-game check.

## Current evidence and regressions

Snapshot: 2026-10-19. Product base `29b9520` plus the sparse friend-controller correction in this
branch; production restored to `a0269df`
after candidate helper startup exceeded its 60-second readiness bound. Graphics
`052a82f` and the accepted roster are unchanged. The candidate is not deployed.

**Passed** means the stated layer/environment passed, not every browser. **Failed**
means a reproduced failure at that layer. **Untested** means no current observation.
Private receipts remain in the operator's `match-fix/` evidence directory; commit
only a sanitized result summary when publishing evidence. Historical E-numbers are
in the feature verification map.

| ID / journey | Opt-in real-flow probe or acceptance steps | Current status / evidence | Normal regression anchors |
| --- | --- | --- | --- |
| AUTH: login, rejection, protected app/assets | `prove_shared_login.mjs --output "$OUT/auth"` uses synthetic isolated credentials; then authenticated app/worker/roster identity on the selected host | Passed: public restored login/authenticated sealed-byte and 60-entry checks04:48UTC. Synthetic login E2E retained historically E24/E28. No password values in receipts. | `web-prototype/server/shared-password.test.js`; upgrade framing tests |
| SETUP: choose legal disc, verify, save | `prove_launcher_flows --only solo`; inspect visible phases through actual Settings → ROM Management | Historical E2E pass E2/E26. Current candidate reuses a verified task-owned ISO; no fresh full download this run. | [browser_disc.test.mjs](../engines/melee/tests/browser_disc.test.mjs), [verify_disc.test.mjs](../engines/melee/tests/verify_disc.test.mjs), [browser_disc_cache.test.mjs](../engines/melee/tests/browser_disc_cache.test.mjs) |
| DOWNLOAD: hosted acquisition, cancel, resume/retry | `prove_host_disc.mjs --origin … --output … --phase download`; `prove_disc_transfer.mjs` for paired transfer (see each tool's inputs) | Untested on current deployment. Historical E26–E32 include both passes and phone/storage blockers; do not infer current Safari success. | [host_disc_download.test.mjs](../engines/melee/tests/host_disc_download.test.mjs), [private_handoff.test.mjs](../engines/melee/tests/private_handoff.test.mjs), [handoff-transfer.test.js](../web-prototype/shared/handoff-transfer.test.js) |
| CACHE: reload and saved-copy restore | Launcher companion probe after reload; local match → close → reload → match without disc GET | Passed candidate Chrome real native: `integrated-rest-result.json`, refreshRecovery=true, zero disc GETs. | [browser_disc_cache.test.mjs](../engines/melee/tests/browser_disc_cache.test.mjs), [melee-session.test.js](../web-prototype/shared/melee-session.test.js) |
| STORAGE: root denied, visible recovery, opt-in failure capture | On a task profile inject storage denial; check original error, recovery guidance and one-shot opt-in. No real profile clearing. | Historical controlled-browser E34 pass; current physical iPhone/Safari root-storage failure remains unverified. | [setup-report.test.js](../web-prototype/shared/setup-report.test.js), [setup-reports.test.js](../web-prototype/server/setup-reports.test.js), disc/cache tests |
| ROSTER: filters, defaults, alternate/base choice | `prove_roster_tabs.mjs`; two-player controller proof exercises independent base choices. Choose a nondefault, return, change roster and reload. | Passed candidate private acceptance and earlier E3/E13; all 60 accepted choices, companions/transforms retained privately. | [melee-roster-choice.test.js](../web-prototype/shared/melee-roster-choice.test.js), [launch_roster.test.mjs](../engines/melee/tests/launch_roster.test.mjs), [test_roster_choices.py](../engines/melee/tests/test_roster_choices.py) |
| PAD2: independent locks/bases, reconnect, replacement neutral | Controller proof `--players 2` | Passed candidate native synthetic2-player plus ownership regressions. Physical adapter ports remain untested; browser-hidden HID ports are not repaired by picker code. | [controller-selection.test.js](../web-prototype/shared/controller-selection.test.js), [controller-ports.test.js](../web-prototype/shared/controller-ports.test.js), [launcher_selection.test.mjs](../engines/melee/tests/launcher_selection.test.mjs) |
| PAD3/PAD4: selection, launch, independent movement, return | Controller proof `--players 3` or 4; run both for input/selection changes | Passed candidate private integrated E2E, including sparse indices1/3/5/7; synthetic only. Reusable count probes also passed: `pad3-e2e/game.json` and `pad4-e2e/game.json`. | controller selection and sparse launch-option regressions |
| SOLO: human plus native CPU / unused-port behavior | Launcher probe `--only solo`; inspect four-port session and actual native progression | Historical fresh-default/CPU pass E2. Candidate 2/3-human runs retained unused CPU ports. Scripted online opponent is a separate mode. | [launch_roster.test.mjs](../engines/melee/tests/launch_roster.test.mjs), [friend_match.test.mjs](../engines/melee/tests/friend_match.test.mjs) |
| END: results → menu → new match | Launcher solo short-match probe; repeat local match in same tab | Passed candidate native results then repeat (`integrated-result.json`). | [match_return.test.mjs](../engines/melee/tests/match_return.test.mjs), [netplay_lifecycle.test.mjs](../engines/melee/tests/netplay_lifecycle.test.mjs) |
| PREP: cold/repeat, companions and transforms | Select Zelda/Sheik/Ice Climbers where accepted; start, transform, close and repeat | Passed candidate: 7 costume assets, both transformations, 2.720s cold/.495s repeat, seven fitted hits and no repeat source GETs (`integrated-rest-result.json`). Local measurements, not WAN timing. | [native-preparation.test.js](../web-prototype/shared/native-preparation.test.js), [native-fit.test.js](../web-prototype/shared/native-fit.test.js), [fitting-worker-assets.test.js](../web-prototype/shared/fitting-worker-assets.test.js) |
| RETRY: asset failure then Try again | Launcher solo probe fault step; keep real worker/engine | Passed candidate injected source 503 → visible error → actual Try again recovery. | same preparation tests; [launch_diagnostics.test.mjs](../engines/melee/tests/launch_diagnostics.test.mjs) |
| CANCEL: close during prep / delayed scroll / disc restore | Close the visible flow while pending; wait; assert no overlay resurrection; launch again | Passed candidate local actual preparation/close plus focused generation-guard regressions (`integrated-rest-result.json`). | [launch-cancellation.test.js](../web-prototype/shared/launch-cancellation.test.js), preparation abort/retry tests |
| LOBBY: create/share surface/Ready | Friend probe `--only create`; Join uses the observed assignment link without logging its code; clipboard Copy action is separately untested | Failed before: one synthetic pad at browser index7 is rejected as missing human input (`lobby-pad7-before/summary.json`). Fixed the room filter to match accepted physical indices; see after-fix paired receipt. This may differ from the user report, whose controller index is unknown. No public test room was created. | [friend_match.test.mjs](../engines/melee/tests/friend_match.test.mjs), [friend_origin.test.mjs](../engines/melee/tests/friend_origin.test.mjs), [rooms.test.mjs](../engines/melee/tools/netplay/rooms.test.mjs) |
| JOIN/READY: link → join → prepare both → both Ready → native game | Friend probe default paired journey | Passed: `lobby-e2e/summary.json` (all six checks); both peer pages use the real room server/runtime. No WAN or two-device claim. | same room tests; identity and confirmed-input tests |
| ROOM-END: rematch/disconnect/stale-link recovery | Same paired journey; require a new room identity for rematch and both views return on Stop | Passed paired E2E: fresh rematch progressed, Stop returned both peers, stale join rejected. Normal protocol tests alone do not establish the React launcher flow. | [netplay_lifecycle.test.mjs](../engines/melee/tests/netplay_lifecycle.test.mjs), [rooms.test.mjs](../engines/melee/tools/netplay/rooms.test.mjs), [netplay_identity.test.mjs](../engines/melee/tests/netplay_identity.test.mjs) |
| COMPANION: scripted second browser | Launcher probe `--only companion`; both engines prepare/Ready, results and fresh room | Historical E2E E2/E3/E14. Not native CPU AI and not a remote human peer. Current rerun untested. | [local_opponent_progress.test.mjs](../engines/melee/tests/local_opponent_progress.test.mjs), [test_simulated_peer.test.mjs](../engines/melee/tests/test_simulated_peer.test.mjs) |
| MOBILE: touch, orientation, fullscreen, release on blur | `prove_ui_polish.mjs` uses actual game with emulated touch. `prove_touch_ui.mjs` is a mocked standalone UI surface and must retain that label. | Historical emulated Chrome pass E14; current physical phone/Safari/Android/controller certification untested. | [mobile-input.test.js](../web-prototype/shared/mobile-input.test.js), [mobile-controls.test.js](../web-prototype/shared/mobile-controls.test.js) |
| HOST: switch, rollback, correct served bytes | Task-owned Standard launchd fixture before switching; scoped helper-first activation, authenticated roster readiness, public sealed-byte verification and repeat-match smoke after activation | Failed candidate activation 04:28 UTC; old helper recovered 04:31:13, web never stopped. Public rollback verified 04:48:18. Candidate Standard fixture later passed 30.923s. Public candidate gameplay remains untested. | [test_mac_release.py](../engines/melee/tests/test_mac_release.py); operator sequencing failure tests (8 passed) |

## Supported mode inventory and remaining E2E gaps

The shared [launch schema](../engines/melee/runtime/launch-options.json) and
[mode contract](../engines/melee/docs/LAUNCH_MODES.md) expose five destinations.
These are separate journeys; a successful Free-for-All does not cover the others.

| Destination | Opt-in actual user-flow check | Current browser evidence |
| --- | --- | --- |
| Free-for-All (0) | Pick fighters, set rules, launch, control, results, return and repeat; use the solo/controller probes above | Passed candidate local native, including native CPU on unused ports. Frame progress is not a sustained-FPS claim. |
| VS Menu (1) | In Settings select VS Menu, launch, navigate original VS menu, enter a match, then Back/return | Untested on this candidate; launch-option regressions validate destination encoding only. |
| VS Character Select (2) | Select this destination, launch, change an injected identity/base in native CSS, Start, choose stage, play and return | Untested on this candidate; historical native CSS evidence does not certify this browser release. |
| Classic Character Select (3) | Select Classic, launch, choose fighter/difficulty, start a stage, then Back and verify choices persist | Untested on this candidate; normal settings tests are not an end-to-end Classic run. |
| Original Title / All Modes (4) | Use Start game or select this destination, pass original title/save flow, enter a supported native mode and return | Untested on this candidate. The destination exposes original menus; it does not promise every original mode is accepted. |

Online friend rooms have exactly two human peers with one local human input
source each. Multiple local controllers use the local path; they do not expand
online rooms to four peers. A local scripted opponent is a second browser peer,
whereas local CPU opponents run native AI. Desktop and Smash64 remain separate
products/checks, linked from the feature map rather than certified by this matrix.

## Recording a run

Record source/runtime identities, journey ID, browser/OS, real versus simulated
input, fixture/host, checks passed/failed/untested, command with private values
redacted, and outside-Git receipt names. Retain the first failure and its repair
run separately. A failure should add a focused regression at the owning layer;
add or extend an E2E only when it covers a user-flow boundary the focused test
cannot prove. Refresh only the affected evidence rows; a small fix does not imply
rerunning this entire document.
