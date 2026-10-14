# Run the local Melee website

The committed website entry point is
[`web-prototype/server/index.js`](../web-prototype/server/index.js).
[`serve_melee.py`](../engines/melee/tools/serve_melee.py) provides the local
source/preparation API. The website serves the configured browser runtime on its
own listener and owns room sockets and the optional scripted companion.
Tailscale Serve is an external HTTPS proxy, not code in this repository.

The current local demo uses these committed entry points with local process
commands and private paths. This fork does not install an OpenSmash launch agent
or provide a persistent service supervisor. A running URL is not a reboot/restart
guarantee. See the [feature map](feature-verification.md) for verified scope.

## Prerequisites and wiring

Use an existing prepared checkout, project Node/Python dependencies, a composed
browser engine and the player's legal local disc. Build/preparation is described
in the [multiplayer runtime contract](multiplayer/README.md#local-upstream-launcher-preparation).
The normal website build is `npm run build --prefix web-prototype`.
Private source packages, release manifests, caches, screenshots and disc files
stay outside tracked Git content. The private companion owns their exact paths,
release hashes and rollback records. Its direct `exports/<slug>` manifest contract
is unchanged. Do not replace the current catalog with an old archive catalog.

Both `MELEE_PC_ROOT` (helper) and `MELEE_NETPLAY_ENGINE_ROOT` (website) name the
engine checkout root. Source runtime files live in `platforms/browser`; compiled
JS/WASM live in `build/browser/runtime/platforms/browser`. The
[runtime manifest](../engines/melee/server/runtime-assets.mjs) hashes this exact
file set. Reuse a runtime only when its code/patch/build identity matches.
A runtime-only snapshot can serve these files but is not a buildable checkout.
At the map's checkpoint the gameplay branch is `multiplayer/confirmed-input-seam`.
For setup/update, resolve that chosen branch to a SHA and record it with runtime
hashes and the previous release for rollback. A newer website SHA does not
automatically certify an older engine. Documentation/cleanup PRs are separate.
For an isolated clean engine at the pin in `upstream.json`,
`python3 engines/melee/tools/prepare_confirmed_input.py "$MELEE_ENGINE" --apply --launcher`
composes and verifies both patches; the current launcher patch includes the
opt-in source-pivot renderer. It performs no build or installation. Build the
composed engine with its `tools/browser/build.py --jobs 6` and existing pinned SDK,
then build the matching fitter using `engines/melee/tools/build_native_fit.py`
as described in [fitting documentation](../engines/melee/runtime/fitting/README.md).
The normal `build_upstream.py` entry point requires a clean pinned checkout and
rejects the dirty composed candidate. Do not use it as an incremental builder
after applying the launcher patches. Coordinate resource-heavy builds separately.

Set shell variables to existing local paths and unused **loopback** ports:
`OPENSMASH_CODE`, `MELEE_ENGINE`, `MELEE_DISC`, `PRIVATE_MANIFEST`, `SOURCE_LIBRARY`,
`SITE_PORT` and `ASSET_PORT`. Quoted values are paths, not uploaded files.
These are runbook shell variables; entry points receive the actual flags/env below.

Start the asset helper in one terminal:

```sh
cd "$OPENSMASH_CODE/engines/melee"
MELEE_PC_ROOT="$MELEE_ENGINE" python3 tools/serve_melee.py --upstream --port "$ASSET_PORT" --characters "$SOURCE_LIBRARY" --iso "$MELEE_DISC" --private-roster "$PRIVATE_MANIFEST"
```

Start the website in another terminal:

```sh
cd "$OPENSMASH_CODE/web-prototype"
NODE_ENV=production HOST=127.0.0.1 PORT="$SITE_PORT" MELEE_LOCAL_ORIGIN="http://127.0.0.1:$ASSET_PORT" MELEE_NETPLAY_ENGINE_ROOT="$MELEE_ENGINE" node server/index.js
```

For the already authorized local companion, additionally set
`MELEE_SIMULATED_PEER_ISO` to the private disc path and
`MELEE_PLAYWRIGHT_MODULE` to an existing Playwright package before starting Node.
Without these options the scripted companion is absent; it is not native CPU AI.
Without the netplay engine option the website reports friend mode disabled.
Production builds and source/runtime patches must match; do not change a live
engine root merely to make a document's example run.

## Existing private HTTPS topology

An approved Tailscale Serve mapping forwards one exact private HTTPS origin to
the loopback website. The website forwards allowed Melee preparation routes to
the loopback asset helper. It never proxies raw game/operator/system routes to
the remote browser. Set `MELEE_PRIVATE_ORIGIN` to that exact HTTPS origin before
starting Node; it configures request validation, not the Tailscale mapping.
An arbitrary remote HOST, broad origin, Funnel or new custom-domain route is not
part of this setup. See [route restrictions](../engines/melee/server/README.md#private-tailnet-development).

With an existing Tailscale CLI, `tailscale serve status --json` reads the mapping.
On macOS the CLI may be inside the installed app; the private local example
records its verified path. If unavailable, report it rather than installing or
changing configuration. Preserve unrelated mappings. New persistent service or
network access changes are separate authorized work; do not run a global Serve
reset to stop this app.

## Check and stop

```sh
curl -fsS "http://127.0.0.1:$SITE_PORT/melee/api/netplay/config"
curl -fsS "http://127.0.0.1:$SITE_PORT/melee/api/imports?roster=available"
curl -fsS "http://127.0.0.1:$SITE_PORT/melee/api/imports?roster=active"
```

Check the expected installed/active roster and exact source/runtime identities,
then test selection → play → Stop/return. Use the existing launcher proof linked
in the feature map when changing behavior. Check the actual HTTPS served build
separately from the local build; origin/forbidden-route tests remain relevant.
Physical controllers, two-device WAN, TV streaming and custom-domain homelab
hosting require their own evidence.

Use **Stop** for a match. For task-owned foreground processes, Ctrl+C in the Node
terminal invokes the room/companion shutdown handler; Ctrl+C in the Python
terminal ends that helper. For detached processes verify the exact PID/listener
before sending SIGINT to Node or terminating the helper. Stop only this task's
processes; keep shared Tailscale mappings unless their owner authorizes a change.
