[Skip to content](https://www.exchangetoken.ai/doc/seedance-video#VPContent)

On This Page

# Seedance Video API [​](https://www.exchangetoken.ai/doc/seedance-video\#seedance-video-api)

Use this page when you want to create or query Seedance video generation tasks through Exchange Token.

## Supported models and endpoints [​](https://www.exchangetoken.ai/doc/seedance-video\#supported-models-and-endpoints)

| Item | Value |
| --- | --- |
| Public models | `seedance-2.0`, `seedance-2.0-fast` |
| Create task | `POST /api/v3/contents/generations/tasks` |
| Query task | `GET /api/v3/contents/generations/tasks/{id}` |
| Base URL example | `https://api.exchangetoken.ai` |
| Recommended auth | `Authorization: Bearer <YOUR_API_KEY>` |

## Request body [​](https://www.exchangetoken.ai/doc/seedance-video\#request-body)

| Field | Type | Required | Description |
| --- | --- | --- | --- |
| `model` | `string` | Yes | `seedance-2.0` or `seedance-2.0-fast` |
| `content` | `object[]` | Yes | Input array |
| `generate_audio` | `boolean` | No | Default `true` |
| `tools` | `object[]` | No | Environment-dependent capability |
| `resolution` | `string` | No | `480p` or `720p` |
| `ratio` | `string` | No | `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`, `adaptive` |
| `duration` | `integer` | No | `4` to `15`, or `-1` |
| `watermark` | `boolean` | No | Follow upstream capability |

Avoid depending on `service_tier`, `draft`, `frames`, or `camera_fixed`.

## Supported content and roles [​](https://www.exchangetoken.ai/doc/seedance-video\#supported-content-and-roles)

### Content types [​](https://www.exchangetoken.ai/doc/seedance-video\#content-types)

| `type` | Description |
| --- | --- |
| `text` | Prompt text |
| `image_url` | Image input |
| `video_url` | Video input |
| `audio_url` | Audio input |

### Roles [​](https://www.exchangetoken.ai/doc/seedance-video\#roles)

| Input type | Role | Description |
| --- | --- | --- |
| `image_url` | `first_frame` | First-frame image-to-video |
| `image_url` | `last_frame` | Last-frame image-to-video |
| `image_url` | `reference_image` | Multimodal reference image |
| `video_url` | `reference_video` | Reference video |
| `audio_url` | `reference_audio` | Reference audio |

### Supported URL forms [​](https://www.exchangetoken.ai/doc/seedance-video\#supported-url-forms)

| Input type | URL forms |
| --- | --- |
| `image_url` | Public URL, Base64, `asset://<ASSET_ID>` |
| `video_url` | Public URL, `asset://<ASSET_ID>` |
| `audio_url` | Public URL, Base64, `asset://<ASSET_ID>` |

If you plan to reference `asset://<ASSET_ID>`, create assets first on the [Seedance Asset API](https://www.exchangetoken.ai/doc/seedance-assets) page.

## Valid request patterns [​](https://www.exchangetoken.ai/doc/seedance-video\#valid-request-patterns)

| Scenario | Minimum input |
| --- | --- |
| Text to video | `text` |
| First-frame image to video | `image_url(first_frame)` with optional `text` |
| First and last frame image to video | `image_url(first_frame)` \+ `image_url(last_frame)` with optional `text` |
| Multimodal guided generation | Legal combinations of `reference_image`, `reference_video`, `reference_audio`, with optional `text` |
| Video editing | `reference_video` with optional `reference_image` and `text` |
| Video extension | `reference_video` with optional `text` |

## Request rules and media limits [​](https://www.exchangetoken.ai/doc/seedance-video\#request-rules-and-media-limits)

### Rules [​](https://www.exchangetoken.ai/doc/seedance-video\#rules)

- `first_frame` and `last_frame` mode cannot be mixed with `reference_image` mode
- Audio cannot be submitted alone
- `asset://<ASSET_ID>` is only valid after the asset status becomes `Active`
- `tools=[{"type":"web_search"}]` should be validated before production use

### Media limits [​](https://www.exchangetoken.ai/doc/seedance-video\#media-limits)

| Input | Limits |
| --- | --- |
| Image | `jpeg`, `png`, `webp`, `bmp`, `tiff`, `gif`; aspect ratio `(0.4, 2.5)`; `300` to `6000 px`; `< 30 MB` each; request body `<= 64 MB` |
| Video | `mp4`, `mov`; `480p` or `720p`; `2` to `15 s` each; max `3` clips; total duration `<= 15 s`; `24` to `60 FPS`; `<= 50 MB` each |
| Audio | `wav`, `mp3`; `2` to `15 s` each; max `3` clips; total duration `<= 15 s`; `<= 15 MB` each; request body `<= 64 MB` |

## Task responses [​](https://www.exchangetoken.ai/doc/seedance-video\#task-responses)

### Create response [​](https://www.exchangetoken.ai/doc/seedance-video\#create-response)

json

```
{
  "id": "sg_vid_m9xk3g_0f8a4c0d3a2b4e9f1c20"
}
```

Exchange Token returns its own queryable task ID. Use it for later polling.

### Query response [​](https://www.exchangetoken.ai/doc/seedance-video\#query-response)

json

```
{
  "id": "sg_vid_m9xk3g_0f8a4c0d3a2b4e9f1c20",
  "model": "dreamina-seedance-2-0-fast-260128",
  "status": "succeeded",
  "content": {
    "video_url": "https://example.com/output.mp4?sig=foo&x=1"
  },
  "usage": {
    "completion_tokens": 108900,
    "total_tokens": 108900
  },
  "created_at": 1776209922,
  "updated_at": 1776210072,
  "resolution": "720p",
  "ratio": "16:9",
  "duration": 5,
  "generate_audio": true
}
```

Typical statuses:

- `queued`
- `running`
- `succeeded`
- `failed`
- `cancelled`

The response `model` may show the upstream versioned model ID rather than the public alias.

## Error format [​](https://www.exchangetoken.ai/doc/seedance-video\#error-format)

json

```
{
  "error": {
    "type": "invalid_request",
    "message": "..."
  }
}
```

| HTTP status | `error.type` | Typical meaning |
| --- | --- | --- |
| `400` | `invalid_request` | Invalid parameters or JSON |
| `401` | `unauthorized` | Missing or invalid API key |
| `402` | `quota_exhausted` | Video quota exhausted |
| `403` | `forbidden` | Token disabled, expired, or not allowed |
| `404` | `task_not_found` | Task not found |
| `429` | `rate_limited` | Too many requests |
| `502` | `upstream_error` | Upstream submit or parse failure |
| `503` | `no_channel` / `async_task_unavailable` | No available channel or async task unavailable |

## Examples [​](https://www.exchangetoken.ai/doc/seedance-video\#examples)

Before running the examples below:

bash

```
export ET_BASE='https://api.exchangetoken.ai'
export ET_TOKEN='sk-xxxxxx'
export ASSET_ID='asset-xxxxxxxx'
export TASK_ID='sg_vid_xxxxxxxx'
```

### Text to video [​](https://www.exchangetoken.ai/doc/seedance-video\#text-to-video)

bash

```
curl -sS "$ET_BASE/api/v3/contents/generations/tasks" \
  -H "Authorization: Bearer $ET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "model":"seedance-2.0",
    "content":[\
      {"type":"text","text":"A short-haired woman turns back and smiles on a city street, cinematic style, stable forward camera movement"}\
    ],
    "duration":5,
    "resolution":"720p",
    "watermark":false
  }'
```

### Asset-backed first-frame generation [​](https://www.exchangetoken.ai/doc/seedance-video\#asset-backed-first-frame-generation)

bash

```
curl -sS "$ET_BASE/api/v3/contents/generations/tasks" \
  -H "Authorization: Bearer $ET_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"model\":\"seedance-2.0\",
    \"content\":[\
      {\"type\":\"text\",\"text\":\"Make the character nod slightly and wave to the camera\"},\
      {\"type\":\"image_url\",\"image_url\":{\"url\":\"asset://$ASSET_ID\"},\"role\":\"first_frame\"}\
    ],
    \"duration\":5,
    \"watermark\":false
  }"
```

### Query a task [​](https://www.exchangetoken.ai/doc/seedance-video\#query-a-task)

bash

```
curl -sS "$ET_BASE/api/v3/contents/generations/tasks/$TASK_ID" \
  -H "Authorization: Bearer $ET_TOKEN"
```

### Video extension [​](https://www.exchangetoken.ai/doc/seedance-video\#video-extension)

bash

```
curl -sS "$ET_BASE/api/v3/contents/generations/tasks" \
  -H "Authorization: Bearer $ET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
      "model": "seedance-2.0-fast",
      "content": [\
        {\
          "type": "text",\
          "text": "Generate the content after [Video1]: the two men who are late run towards them, the five people finally meet and have a friendly chat."\
        },\
        {\
          "type": "video_url",\
          "video_url": {\
            "url": "https://ark-doc.tos-ap-southeast-1.bytepluses.com/doc_image/video_edit_prolong_ref_video.mp4"\
          },\
          "role": "reference_video"\
        }\
      ],
      "generate_audio": true,
      "ratio": "16:9",
      "duration": 5,
      "watermark": true
    }'
```

## Related page [​](https://www.exchangetoken.ai/doc/seedance-video\#related-page)

- [Seedance Asset API](https://www.exchangetoken.ai/doc/seedance-assets)