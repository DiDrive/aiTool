# Workbench sidecar modifications

The workbench build replaces upstream `main.go` with the copy included in the
corresponding source and defaults the Go HTTP server to `127.0.0.1`. It also
accepts `BIND_ADDRESS`; the Electron host explicitly supplies
`BIND_ADDRESS=127.0.0.1`.

The build also applies `workbench-protocol.patch`. Local channels synchronized
from the workbench retain their platform protocol, so KWJM, PIX,
ExchangeToken, ModelTop, and custom channels use their matching image/video
paths and request formats instead of one shared OpenAI-style route.

`canvas-material-delete.patch` adds deletion for private user materials while
keeping the public asset library read-only.

`canvas-workflow-nodes.patch` adds drag-and-connect creative workflow nodes for
ideas, scripts, storyboard scripts, character references, storyboards, and
video clips. These nodes reuse the upstream text/image/video execution engines
and are visible to the right-side Canvas Agent through `workflowKind` metadata.
Script and storyboard generation now require Simplified Chinese field content.
English or malformed model output is retained as raw text and receives one
automatic translation/structure-repair attempt before downstream generation.
Storyboard asset slots now show visual previews and node names. Users can add
and bind extra per-shot references; these participate in missing-asset checks
and downstream image/video dependency graphs.
Changing or clearing a shot asset now synchronizes existing storyboard/video
dependency edges immediately. Storyboard generation also recovers stale node
bindings and creates a new version when a completed storyboard is regenerated.
Duplicate inferred asset names are normalized, and inferred slots can be
removed individually. Storyboard image generation preserves every bound reference up to the
selected provider's declared limit. PIX uses `image-edit` for one reference and
`multi-reference` for two or more references; failures are surfaced without silently dropping
references or falling back to text-to-image.

Local model routing validates the saved capability channel against the active model before each
request. When a user switches to a model owned by another synchronized local provider, the canvas
selects that provider's channel instead of sending the model to the previous fixed channel.

Text/script nodes connected to uploaded videos no longer pass an unusable video URL to a text
request. The web client decodes each video, samples 12-20 ordered timeline frames, and sends those
frames to the configured vision-capable text model with a strict reconstruction contract. Failed
video decoding is surfaced instead of producing an unrelated guessed script.

Structured script detail now provides an AI adaptation action. The user can describe requested
changes to characters, setting, plot, style, ending, or duration; the canvas preserves the reverse-
engineered source script and creates a connected, independently editable structured script version.

Video task status values returned in Chinese are normalized to canonical queued, processing,
completed, and failed states. Existing tasks stored as `生成中` are included in recovery polling.
Per-shot video nodes suppress the full upstream storyboard text and rebuild their prompt from only
the selected shot while retaining that shot's bound image references.
