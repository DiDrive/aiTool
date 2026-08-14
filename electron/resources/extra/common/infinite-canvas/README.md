# Infinite Canvas sidecar

This directory is reserved for a separately distributed build of
[`tigerowo/infinite-canvas`](https://github.com/tigerowo/infinite-canvas).

The upstream project is licensed under AGPL-3.0. A distributable bundle must
include its `LICENSE`, the complete corresponding source code for the exact
build, and a description of local modifications. Do not add a real
`sidecar.json` until both runtime files exist; the workbench uses its presence
to detect an installed bundle.

Expected layout:

```text
infinite-canvas/
  sidecar.json
  api/server.exe
  web/server.js
  web/.next/...
  web/public/...
  LICENSE
  SOURCE/
  MODIFICATIONS.md
```

`sidecar.json`:

```json
{
  "version": "upstream-version+workbench.1",
  "apiExecutable": "api/server.exe",
  "webEntry": "web/server.js",
  "healthPath": "/api/health",
  "loopbackOnly": true
}
```

`loopbackOnly` is a safety assertion and is required. Set it only after the Go
fork has been changed and verified to honor `BIND_ADDRESS=127.0.0.1`.

For development, set `AIGCPANEL_INFINITE_CANVAS_ROOT` to an absolute bundle
directory instead of copying binaries into this folder.

If Docker Hub is unreachable, the build script accepts an explicit registry
prefix, for example `-DockerImagePrefix "m.daocloud.io/docker.io"`. This is a
third-party cache; use an organization-controlled registry mirror for release
builds when available.
