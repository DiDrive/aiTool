[Skip to content](https://www.exchangetoken.ai/doc/seedance#VPContent)

On This Page

# Seedance [​](https://www.exchangetoken.ai/doc/seedance\#seedance)

Seedance on Exchange Token is split into two practical workflows:

- **Video generation**: create and query asynchronous video tasks
- **Asset management**: prepare reusable media and reference it with `asset://<ASSET_ID>`

This page is the entry point. Use the two detail pages below based on what you are integrating.

Recommended reading path

If you only want to submit prompts or query video jobs, read **Video API** first.

If you need reusable images, videos, or audio assets for Seedance requests, read **Asset API** first.

## Which page should you read? [​](https://www.exchangetoken.ai/doc/seedance\#which-page-should-you-read)

| Your goal | Read this |
| --- | --- |
| Create text-to-video, image-to-video, or multimodal Seedance tasks | [Seedance Video API](https://www.exchangetoken.ai/doc/seedance-video) |
| Upload reusable media and wait until it becomes usable | [Seedance Asset API](https://www.exchangetoken.ai/doc/seedance-assets) |
| Understand the overall integration path first | Stay on this page |

## Public models and core endpoints [​](https://www.exchangetoken.ai/doc/seedance\#public-models-and-core-endpoints)

### Public model aliases [​](https://www.exchangetoken.ai/doc/seedance\#public-model-aliases)

| Model | Purpose |
| --- | --- |
| `seedance-2.0` | Standard tier, prioritize quality |
| `seedance-2.0-fast` | Fast tier, prioritize latency and lower cost |

### Video task endpoints [​](https://www.exchangetoken.ai/doc/seedance\#video-task-endpoints)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/api/v3/contents/generations/tasks` | `POST` | Create a video generation task |
| `/api/v3/contents/generations/tasks/{id}` | `GET` | Query a single task |

### Asset endpoints [​](https://www.exchangetoken.ai/doc/seedance\#asset-endpoints)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/open/CreateAssetGroup` | `POST` | Create an asset group |
| `/open/CreateAsset` | `POST` | Create an asset from a public URL |
| `/open/GetAsset` | `POST` | Query asset preprocessing status |

## Quick start flow [​](https://www.exchangetoken.ai/doc/seedance\#quick-start-flow)

1. Choose `seedance-2.0` or `seedance-2.0-fast`.
2. If you are using your own media repeatedly, create assets first and wait for `Status = "Active"`.
3. Submit a video task through `/api/v3/contents/generations/tasks`.
4. Poll `/api/v3/contents/generations/tasks/{id}` until the task reaches `succeeded` or `failed`.

## Integration notes [​](https://www.exchangetoken.ai/doc/seedance\#integration-notes)

- Recommended auth header: `Authorization: Bearer <YOUR_API_KEY>`
- Base URL example: `https://api.exchangetoken.ai`
- Result URLs are time-limited; save generated videos promptly
- `GET /api/v3/contents/generations/tasks` and `DELETE /api/v3/contents/generations/tasks/{id}` are not part of the formal public contract

## Next pages [​](https://www.exchangetoken.ai/doc/seedance\#next-pages)

- [Go to Seedance Video API](https://www.exchangetoken.ai/doc/seedance-video)
- [Go to Seedance Asset API](https://www.exchangetoken.ai/doc/seedance-assets)