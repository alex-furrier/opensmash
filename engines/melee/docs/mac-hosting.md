# Mac shared-password hosting operations

The Mac deployment uses a committed source release, a separate writable helper
workspace, and owner-only configuration outside both. The existing Tailscale
service remains the recovery path. These commands stage files and render jobs;
they do not activate a release, install a service or change Tunnel/DNS.

## Prepare a release

Build the frontend from a clean isolated checkout at the reviewed commit, using
the committed package-manager lock with frozen resolution. Record a private build
receipt with `sourceCommit`, `toolchain` (exact Node, package-manager and Python
versions), `lockFiles` (repository-relative lock paths mapped to SHA-256), and
`frontendFiles` (every path relative to the built frontend mapped to SHA-256).
The package command rejects a receipt that differs from the selected source or
built bytes. It cannot prove the receipt's claimed build procedure; retain the
build command and clean-checkout logs as evidence.

```sh
python3 engines/melee/tools/package_mac_release.py package \
  --repo /absolute/reviewed-checkout \
  --frontend /absolute/reviewed-checkout/web-prototype/dist \
  --audio-wasm /absolute/verified-inputs/melee-audio.wasm \
  --build-receipt /absolute/private/build-receipt.json \
  --output /absolute/releases/COMMIT
```

Only selected committed Git blobs and declared frontend asset types are copied.
The audio WASM is the sole build-directory exception. Source symlinks, ROMs,
credential suffixes, environment files, dependency directories and source maps
are rejected. Runtime WASM, templates and custom sources stay in private local
storage. Preserve upstream license files and the release's source commit.

Install the production Node dependencies into the staged release using its frozen
lock and approved package manager. Do not point `node_modules` at another checkout.
Then record hashes of the installed layer and verify the complete release:

```sh
python3 engines/melee/tools/package_mac_release.py seal-dependencies /absolute/releases/COMMIT
python3 engines/melee/tools/package_mac_release.py verify /absolute/releases/COMMIT
```

Verification rejects added files and changed source, frontend or dependency bytes.
Internal file symlinks in installed dependencies are hashed; external links and
linked dependency directories are rejected. Never update a sealed release in
place. A dependency change requires a new release and evidence. Hash checks detect
accidental drift; they do not protect against an attacker who can edit the local
manifest and files together.

## Prepare the private helper

Create an owner-private input receipt with `root` and `files` (relative paths mapped
to SHA-256). Explicitly list only the verified `assets/game/`, `build/web-game/`,
`build/native-fit/` and `build/direct-c/` files needed by the existing browser
helper. Never capture an entire build tree or an ISO. Paths and content are private;
do not commit the receipt. Symlinks and hash mismatches fail staging.

```sh
python3 engines/melee/tools/package_mac_release.py helper \
  --release /absolute/releases/COMMIT \
  --inputs /absolute/private/helper-inputs.json \
  --output /absolute/private/helpers/COMMIT
```

This copies the public engine code plus the explicitly listed private inputs into
a new writable workspace. Existing `serve_melee.py` owns preparation and its local
import/cache paths there. The accepted roster manifest and character library stay
external. No migration or deletion of the old workspace occurs. Source imports may
be materialized by the existing importer inside this private workspace; that data
never becomes part of the source package. Python dependencies live in a separately
provisioned, pinned environment; no installer is run by these tools.

## Configure and render login-only jobs

Keep the service JSON owner-owned with mode `0600`. It contains absolute paths for
`release`, `helper`, `node`, `python`, `authFile`, `engineRoot`, `characterRoot`,
`roster` and `logs`; exact `nodeVersion` and `pythonVersion` strings matching the
executables' `--version` output; `pythonPackages` with exact installed versions of
`numpy`, `Pillow` and `scipy`; and `engineFiles`, mapping every accepted runtime
input path relative to `engineRoot` to SHA-256. Include all files used by the
runtime manifest, including optional worker scripts, rather than a sample. Keep
that runtime root unchanged between deployments.

The authentication file is separately created through the secure local password
handoff. Never put its contents into this configuration, arguments, Git or logs.
The runner checks ownership/permissions, passes its path to Node, and creates a
separate process-only key for legacy app cookies. Those legacy cookies expire on
restart; the shared-password session and rotation authority remain in the external
authentication file. Code rollback must keep using the current authentication file.

```sh
python3 engines/melee/tools/mac_hosting_service.py render \
  --config /absolute/private/service.json \
  --output /absolute/private/rendered-jobs
```

Review both plists before separately approved installation. They use user-login
LaunchAgents, fixed loopback ports `4198` and `8818`, a 30-second restart throttle,
and stable log paths. Launchd retries failed processes; it does not enforce a retry
count or provide log rotation. The web runner waits for the helper's active-roster
endpoint before startup. This health check proves availability, not game acceptance.
A successful process exit stays stopped. These jobs do not promise boot-before-login
or availability while the Mac sleeps, is offline, or awaits FileVault unlock.

The runner clears inherited environment settings. It does not enable host ISO
delivery, scripted opponents or public listeners. It verifies toolchain versions,
release bytes, helper code/input hashes and configured runtime hashes before exec.
Keep the service runner itself at the reviewed immutable release path when rendering
jobs; rendering from a development checkout would retain that checkout path.

## Activate, validate and recover

Activation, launchctl installation/loading, credential provisioning and Tunnel/DNS
apply remain separate owner actions with required action-time confirmation. Notify
Alex before an interruption. Stage and inspect the new release beside the old one;
keep the previous release, helper workspace, roster manifest and service JSON.

Before exposure, verify anonymous HTTP/WSS denial, valid login, wrong/tampered/
expired/rotated sessions, rotation closing sockets and downloads, exact origins,
protected frontend/runtime/custom assets, and disabled host-disc delivery. Then
verify external-network access and actual two-device gameplay, match end, menu
return, disconnect and a fresh room. Restart is a separate recovery test: in-memory
rooms are lost and players create a fresh room. Rollback restores prior code and
helper paths while retaining the current authentication file/version. Do not delete
private data or restore old credentials during rollback.

Local fixture coverage runs with:

```sh
python3 -m unittest discover -s engines/melee/tests -p test_mac_release.py -v
```

Fixtures cover packaging boundaries, hashes, symlink escapes, dependencies, source
cleanliness, prior-release preservation and launchd rendering. They do not certify
an installed service, a clean rebuild, runtime compatibility or WAN availability.
