# OpenSmash friend multiplayer: implementation and validation plan

Historical planning record from 2026-10-12. Current implemented flow and validation
are documented in [README.md](README.md#current-validation-and-historical-evidence).
The staging directories, publication status, gaps and task order below describe
that earlier checkpoint; they are not current launch instructions.

Owner intent: a literal fork of the existing smash.fun UI, existing/offline prepared custom characters, two-player Melee on desktop/controllers, initially hosted locally on Alex’s Mac. Preserve upstream character conversion and solo play. No in-app roster platform, generation calls, new accounts, paid resources, public hosting, mobile-polish gate or rollback claim.

## Historical planning checkpoint and evidence boundaries

- Original checkout `../opensmash` and its playable private test route remain separate. The approved ISO deadline remains 2026-10-12T22:08:21.287Z; never renew it implicitly. Source work is isolated in `opensmash-integrated`, branch `multiplayer/upstream-launcher`, based on committed HEAD 08b77516dde7f748468e2495481908eb98675357 plus preserved uncommitted loader/bot/cache fixes. Local source-only checkpoints are authorized; no push. Earlier private loading/bot recovery is preserved in local commit49063e4; the integration checkpoint is reviewed separately.
- Earlier standalone real-engine input/state parity, gameplay milestones, mutation/disconnect/fresh-session proofs remain useful ancestor evidence. Three automatic second-engine sessions passed 3600 matching applied-input/selected-state ticks; 71 focused checks passed after the launch-retry fix. Those tests do not establish the new integrated launcher, complete rollback state, or WAN quality.
- Alex reported the first actual iPhone session was “somewhat playable”; this is subjective feedback, not measured latency/comprehensive iOS validation. Mobile is not the target acceptance platform.
- Current integration slice: opt-in fresh netplay runtime metadata; iframe channel transfer/cleanup; per-room resolved launch; installed costume/CSS byte hashing; friend room UI using existing Melee Experience/Game/controller owners. Vite build and TypeScript passed. Two new focused checks passed: prepared-asset ordering/mutation/dirty-save rejection and actual loopback two-client Ready/Stop/fresh-session. Full browser/custom-character match is NOT proven.
- Current environment preparation: existing compiled game reused; local fitter built successfully with existing Emscripten 6.0.9. Private disc extraction stays ignored/local. Upstream locked website dependencies and converter requirements are available. No game rebuild/deployment/generation calls.
- Existing custom source packages are still required. Baked playable bundles are not a substitute for rigged/source packages. Automatic approval review rejected an external POST to request a public character import link because it can create export metadata on production. Alex subsequently approved that exact request. It ran and returned404 Fighter not found, providing no source package. Read-only public roster metadata lists1046baked entries but no generated source candidates or exposed import/source links. A valid local source package or supplied existing import link is still needed; no further production mutation attempted.
- Known open defects/gaps: original iframe keyboard-focus bug has source-level mitigation in integration, not browser proof; exploratory peer timeout remains unexplained and preserved; broader upstream suites had baseline failures and are not reported green. New lifecycle/asset/room validation is incomplete.

## Skills, review selection and execution preflight

Applied Dots-exported `patch-plan` and `patch-testing-core`: proportional boundaries; behavior/negative controls; real browser/engine proof before acceptance; no generic coordinator or test framework.

Installed Dots instructions found/read at `~/.codex/plugins/cache/ai-config-alex-ai/alex-ai/1.0.81/skills/`:

- `architecture-polish-review`: planning/focused, one pass on Experience → Game → runtime, room transport and prepared-asset interfaces. Adopt the advisory seam guidance already obtained: Experience owns connection; Game owns preparation/runtime/Ready/input; resolve random choices once; keep device binding local; use fresh saves; explicitly transfer ports; generation-bound cleanup; disable unsynchronized trailer/Confirm paths for rooms. No post-diff repeat of this same architecture question. A formally skill-grounded planning pass remains to be recorded against this plan.
- `code-health-review`: focused on the owning Melee launcher/runtime/room modules and website ingress; run one deterministic diff and all four qualitative lenses for each final integration candidate where materially changed. Metrics are advisory; missing ESLint/parser/analyzers are evidence gaps, never invented scores. No auto-install of analyzer tools.
- `code-review`: fresh independent review at meaningful boundaries below, not every commit. Preferred executor contract is codex-review-v3, with externally observable separate lane processes and exact completion marker. Use a committed source-only candidate and approved intent packet at execution; preserve source hashes and original HEAD for ancestor evidence. Review does not authorize publication.

Early preflight: `codex --version` succeeded (0.146.0); `ai-runtime resolve --tool codex --role review --json` failed because no inherited runtime profile is present. Do not invent/pass a profile to force success. Exact native Pi parent subagent capability is not exposed here. This initial preflight was BLOCKED. Alex subsequently explicitly selected the existing personal Codex subscription profile; normal managed invocation and resolution now pass without credential/global configuration changes. Formal review execution is pending a clean source-only checkpoint and exact completion marker. Existing collaboration-agent reviews are advisory source reviews and do not satisfy codex-review-v3/native-pi-review-v2. Continue independent authorized implementation/testing; do not declare a reviewed release candidate while this remains unresolved.

Selected ordered profiles:

1. Core launcher integration: `full` = diff, repository_fit, completeness, bug_hunter.
2. Finished asset/room protocol boundary: `bug-hunter-fit-completeness` = bug_hunter, repository_fit, completeness.
3. Local release candidate: `full` = diff, repository_fit, completeness, bug_hunter.

Each execution binds repository, merge base, committed head, intent digest, prompt contract version (`opensmash-friends-v1`), executor/contract, completion marker and findings. Fix confirmed blockers and repeat only affected proof; request a fresh review after materially changing the reviewed boundary. Do not reuse old reviews as current acceptance.

## Milestones

### 1. Normal launcher and local character preparation

Outcome: choose existing custom characters through the actual upstream UI and enter Play with a friend; solo still works.

Bounded work: finish source import/setup, reuse existing fitting/character-select logic, fresh runtime claim and iframe channel transfer; use existing controller bindings instead of the prototype’s simplified map. Fix keyboard focus by preserving launcher input ownership. Freeze settings/props across status changes and StrictMode; no duplicate engine/simulation loop.

Acceptance: Vite build, intended TypeScript, focused launcher/session/worker tests; real browser selection/import/preparation; keyboard inputs continue after pointer/focus changes and produce non-neutral owned samples; browser-exposed gamepad axes/buttons reach the same acquisition boundary. Verify an actual physical controller manually before claiming hardware support. Cancel during preparation/unmount leaves no engine/fitting workers or stale room actions. Solo smoke and known source/controller regressions pass.

Review: fresh core `full` review and focused code-health pass once this coherent boundary is executable. No formal pass claimed until the exact execution completes.

### 2. Identical custom assets and two-player rooms

Outcome: host creates a room from selected characters/rules; friend joins the same match; both prepare/verify and Ready before play.

Bounded work: canonical resolved engine-facing launch plus costume assignments; random choices resolved once; per-client controller choice stays local. Hash actual installed costume and CSS filenames, sizes and bytes together with runtime, disc, rules and seed. Resolve character sources through existing importer; do not accept arbitrary asset/process URLs from room messages. Prepare before Ready; keep fresh-session failure recovery, not reconnect into an old simulation. No roster database/platform.

Acceptance: real WebSocket integration for assignments, late join, both Ready, ownership, bounded message/room queues, timeout/disconnect and fresh IDs. Reject different engine/disc/rules/seed, modified costume/CSS bytes, duplicate names, invalid launch/source descriptors and wrong owner/session/sequence. Prove mismatch stops both before gameplay and leaves no partial installed state claimed as valid. Controller device differences must not change the shared match identity. Shared room links work from the normal UI; missing/private source access produces an explicit failure rather than silent substitution.

Review: fresh `bug-hunter-fit-completeness` review of asset identities, room authorization/lifecycle and consumers; source-grant/privacy behavior included. Finished output equality is required even though generation itself need not repeat exactly.

### 3. Real engine end-to-end acceptance

Outcome: two independent browser engines play the chosen custom matchup in the real upstream UI, complete a match, Stop and start fresh.

Bounded work: scripted proof harness controls each client’s owned input boundary; preserve captures and source/build identities. Reuse test bot for a convenient one-human smoke path after integration works; it is not native CPU AI or WAN proof.

Acceptance: matching applied input traces and selected-state digests at logical ticks; distinct owned inputs; actual progress, movement, attack, stock loss and respawn; consistent match end/result. Complete an ordinary configured match, then Stop/retry in both role orders, with fresh runtime/session, retained verified disc and zero stale workers/ports/sockets. Keyboard and gamepad proof must exercise the integrated sampler. Add input/state/asset mutation negative controls plus seeded ordered delay/jitter/hold/disconnect cases; no timeout inflation to make a failure disappear. WebSocket app-message suppression is protocol fault testing, not TCP packet loss. Selected-state parity is not a complete-state/rollback proof.

### 4. Two humans on separate networks: stop/go gate

Outcome: friends can use desktop controllers and finish matches through the selected private access route.

Preparation: identify two testers, legal local discs and compatible desktop browsers/controllers; approve exact private route/access setup separately before exposing it. Local dual-browser tests may continue first. No OS/network settings or public routes added implicitly.

Acceptance: both humans complete a full custom-character match and a fresh rematch; record actual logical tick rate, stalls/RTT, disconnect behavior and subjective control responsiveness. Expected game progression is near the engine’s 60-tick/s pace, not merely eventual matching checksums. Agree that controls remain playable. Save failures without declaring success from synthetic delay tests.

Go: two-human playability/progress and integrity/lifecycle criteria pass. Stop: consistent WAN stalls or unplayable responsiveness fail the chosen routes despite local correctness. First measure where waits occur and compare a nearer relay; do not promise that a timeout change will solve latency. If confirmed-input round trips remain unsuitable, return a separate transport/buffering feasibility proposal. Rollback requires complete browser state closure and is not an automatic next implementation.

### 5. Reproducible Mac self-host release candidate

Outcome: a documented command/package launches the actual site, converter and relay with existing characters and persistent local data after restart.

Bounded work: pinned dependency/build/runtime receipts; source-only character library configuration; stable private storage paths; health/start/stop and failure diagnostics; correct HTTPS/isolation/MIME/versioned cache behavior; disable generation/dev ISO/test-helper services by default. Keep one room-owning relay instance initially. Preserve upstream UI, ancestry and license notices. No mandatory new account/marketplace; upstream production Firebase requirement must be retained or explicitly redesigned for the approved private access boundary.

Acceptance: clean disposable local setup from documented prerequisites, boot, character availability after restart, ISO remaining browser-local, two-browser full flow, shutdown cleanup, solo regression, focused/full relevant suites and TypeScript/build. Explain baseline/environment failures separately; no blanket “all tests green”. Fail startup on missing/stale runtime or input assets. Verify no ROMs, derived game inputs, secrets, source photos or unrelated local files enter the source/package/push manifest.

Review: fresh release-candidate `full` review plus focused final code-health evidence and findings disposition. Only claim local done when actual UI/custom match/Stop/retry and packaging pass. Record WAN acceptance separately if testers are pending.

## Approval and distribution boundaries

No public distribution, deployment, DNS, Cloudflare/homelab security configuration, credential/account creation, paid resources, photo uploads or generation calls in current implementation. Existing approved private route/expiry remains its own scope. Choosing a password-protected homelab subdomain or Cloudflare later requires exact host, route, identities/access and resource approval before enabling it.

Resolve engine-binary distribution against the upstream LICENSE.md before wider hosting; launcher MIT and a user-supplied ISO do not settle the unlicensed decompiled game-code boundary. Keep game-derived templates local/ignored and do not publish them. Exported character source links can be bearer capabilities; friend grants and permitted sharing must be explicit.

Future generation remains an offline batch: picture folder plus explicit names; reuse upstream pipeline, optional Codex artwork replacement only; mesh/rigging still needed. Group/yearbook inputs require supplied labels, never guessed identities. See offline-character-batch.md. This stretch is not part of first-version acceptance.

## Bounded follow-up checkpoint

Scoped source search in this checkout and task-5 assets/artifacts/build/downloads found no rigged character/source package. Checked-in GLBs are site props/cursor/controller assets, not usable fighter fixtures. Do not substitute them for actual existing characters.

Denied operation: POST https://smash.fun/api/melee/source/donaldtrump, Content-Type application/json, Origin https://smash.fun, body {}. It obtains an existing public character import link but may persist new sourceExport capability/file metadata and a job revision. Smallest approval: that existing-character import-link request; then read its returned manifest/files. Alternative: supply a local folder containing valid rigged/source packages. No retry or indirect workaround attempted.

Managed runtime read-only status confirms personal Codex is available with existing subscription auth, and work Codex uses API credentials/temporary per-run auth. This worker has no inherited billing profile. The normal supported path is an owning top-level ai-runtime run invocation with its approved personal profile, then inherited profile for exact review lanes; no global settings, new credentials, raw provider or paid API fallback. Parent should select the existing profile according to session authorization or ask once if that choice is genuinely unknown. Do not force preflight by inventing an inherited marker.

Current focused regression subset: 30 passes. Advisory fresh lifecycle/code-health review identified covered Ready controls and competing solo-pad publication on room blur; source fixes moved Ready into the visible status overlay and publish only neutral owned input on room blur. Browser pointer and blur/refocus proof remains pending. A two-engine stock smoke uses exact Game/FriendMatch components under StrictMode in a test-only mount; it does not substitute for normal UI/custom-character acceptance. Local fitter/templates now prepared from approved local game; no generation service or new route exposure.

Latest independent local proof: integrated-stock-proof/summary.json plus source-sha256.json outside Git bind the current slice. Two exact Game/FriendMatch components under StrictMode with separate engines matched300ticks; ordinary pointer Ready and Stop passed. Actual Chrome window blur/refocus was followed by non-neutral owned keyboard input; a browser-exposed synthetic standard gamepad produced distinct owned input. This is not physical-controller, custom-character, whole normal-UI onboarding, full-match or WAN acceptance. Upstream audio consumer now serves successfully through the isolated runtime adapter, with no observed module-fetch warning. Current Vite build and intended TypeScript pass. The scoped30-test regression subset passes.

Additional independent stock acceptance (2026-10-12): two configured1-stock/1-minute matches reached actual GS_RESULTS=5 at608/605ticks with final stock loss and matching traces through results; Stop by player0 then player1 and different fresh room links passed. Browser protocol negative controls: changed asset Ready identity stopped both before tick0; input/prior-state wire mutations at tick400 stopped both after400confirmed ticks; a subsequent fresh match produced300matching all-neutral owned-input ticks. Expected WASM abort/page errors during deliberate protocol faults are preserved in logs/diagnostics; they are not hidden as a clean run. Proof JSON+source hashes stay outside Git in integrated-full-match-proof and integrated-negative-proof. These remain stock/component proof, not complete normal-site/custom/WAN acceptance.

Review execution update: personal subscription context is explicitly user-approved and resolves normally. No account, credential or global setting changed. Deterministic code-health CLI could not run offline because hatchling is absent from the isolated cache; retain this metric evidence gap and the skill-grounded advisory qualitative review. Do not download analyzer dependencies merely to claim metrics.

Core entry refinement: Experience offers a visible Play solo /Play with a friend choice before mounting the full-screen Game, rather than putting the friend button underneath that screen. Trailer capture retains its automatic solo path. Exact Experience/Game/FriendMatch stock-component smoke passed300matching ticks, ordinary pointer mode selection/Ready, keyboard blur/refocus, browser gamepad fixture and Stop. Whole RetroHome/custom-character onboarding remains unproven.

Optional runtime capability is now reported by the local website. Friend mode is offered only when configured; otherwise normal solo/trailer behavior is retained. Exact Experience smoke passed with configured capability; disposable unconfigured server reports enabled=false. Vite auxiliary listener binds HOST rather than wildcard in development. The temporary wildcard proof listener was closed; existing private Serve/relay unchanged. Formal core review now uses the approved personal profile, exact committed integration range and private completion marker; no formal result claimed before completion.


Core review disposition (2026-10-12): the full independent review completed against
030b1a5 and found six distinct defects. Source fixes conditionally load optional
netplay modules, include identity build inputs and configured relay dependencies,
retain schema-validated companion metadata, select the configured local human
controller, compose the launcher patch through the preparation helper, and route
shared links directly into joining. Focused regressions and a Docker build-input
simulation passed; a complete container image has not been built. A fresh review
must bind the subsequent clean candidate before claiming acceptance.

Existing-character source discovery is resolved: upstream documents its public
`desktop-characters-v1` release in `engines/melee/docs/DESKTOP_RELEASE.md`.
The downloaded archive matched its published SHA-256. Only Donald Trump and Barack
Obama source folders were extracted into ignored local assets, and their existing
baked website assets matched the pinned manifest. Both sources converted through
upstream `bake_native_sources.py`. No generation, paid action, private export
workaround, or character/ROM publication occurred. Earlier missing-source notes
above describe historical checkpoints, not the current blocker.


The next full review completed against 0bc4c26 and identified three further
compatibility gaps: direct-link guests bypassed unified controller preferences,
unlimited (zero-minute) matches were rejected, and configured runtime activation
could use a non-loopback outer listener. Follow-up fixes translate the guest's
unified controller plan without resolving fighters, preserve zero in canonical
rules/identity, and reject non-loopback HOST before runtime imports/listeners.
Actual root browser regression now also proves the unified guest gamepad overrides
stale Melee keyboard preferences. Two custom matches reached results at596/611ticks;
both Stop roles, pre-tick asset mismatch rejection and a fresh100neutral ticks passed.
These compare applied pads and50selected state words; no full-state/rollback,
physical-controller or WAN assertion is made. Focused15test subset and intended
TypeScript/build pass. A fresh clean-candidate review remains required.


Review b724021 completed with three narrower edges: hidden gamepad exposure before
Join, controller updates replaying a stale link after leaving, and selected fighters
on later local ports being dropped. Link navigation now reacts only to navigation;
leaving removes the consumed room hash. FriendMatch uses the current unified device
plan at connection, then keeps the physical device/settings and runtime stable for
that room. Creating a room orders selected humans first, then their configured
opponent, into two game slots without changing local assignments. Focused later-port
selection regressions and actual root browser evidence cover these edges. The
browser uses a synthetic standard gamepad, not physical-controller proof.
