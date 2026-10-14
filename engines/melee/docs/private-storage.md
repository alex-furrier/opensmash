# Local browser source storage

The local asset server can keep accepted browser source imports outside the code
checkout. All options are optional; without them, existing paths and behavior
remain unchanged.

| Server option | Contents | Default relative to the Melee checkout |
| --- | --- | --- |
| `--private-source-root` | Retained imports under `web-v1-<source-id>/` | `assets/characters` |
| `--import-cache-root` | `roster.json`, portraits, import logs and retry archives | `build/character-imports` |
| `--source-cache-root` | Content-addressed revision directories and preparation failure logs | `build/native-fit/local/revisions` |

Pass these options to `tools/serve_melee.py` alongside `--private-roster` for a
local browser asset service. The same interfaces are available as
`ImportManager(..., source_root=..., cache_root=...)` and
`native_source.prepare(..., cache_root=...)`. The latter cache root contains
revision directories directly, rather than the entire native-fitting build.

The accepted manifest and its direct `exports/<slug>` children remain a separate,
immutable input release. The exporter allowlist, hash checks and rejection of
symlinked input assets are unchanged. Paths do not participate in character
identity or source revision identity; the source content and preprocessing code
still do. Applying a new preprocessing code revision can invalidate an older
cache even when the storage location is unchanged.

Custom import storage supports source-only browser imports. The older conversion
pipeline still expects checkout-local build and asset paths, so custom storage
rejects conversion requests before running it. Compiled engine files, fitting
WASM and target templates retain their existing build paths. These options do not
port the desktop/shared renderer or change hosted cache configuration.

This interface does not migrate existing files or indexes. Keep a prior release
and configuration until a separately approved migration has passed import,
serving and gameplay checks. A private companion workspace can pin the public
code commit and provide its accepted manifest and these three local paths.
