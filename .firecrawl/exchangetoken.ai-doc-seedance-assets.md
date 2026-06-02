[Skip to content](https://www.exchangetoken.ai/doc/seedance-assets#VPContent)

On This Page

# Seedance Asset API [​](https://www.exchangetoken.ai/doc/seedance-assets\#seedance-asset-api)

Use this page when you want to upload reusable media, group assets, and wait until assets become usable in Seedance video requests.

## Core endpoints and defaults [​](https://www.exchangetoken.ai/doc/seedance-assets\#core-endpoints-and-defaults)

### Endpoints [​](https://www.exchangetoken.ai/doc/seedance-assets\#endpoints)

| Endpoint | Method | Purpose |
| --- | --- | --- |
| `/open/CreateAssetGroup` | `POST` | Create an asset group |
| `/open/ListAssetGroups` | `POST` | List visible asset groups |
| `/open/GetAssetGroup` | `POST` | Query one asset group |
| `/open/UpdateAssetGroup` | `POST` | Update asset group metadata |
| `/open/CreateAsset` | `POST` | Create an asset from a public URL |
| `/open/ListAssets` | `POST` | List assets |
| `/open/GetAsset` | `POST` | Query one asset |
| `/open/UpdateAsset` | `POST` | Rename an asset |

### Defaults [​](https://www.exchangetoken.ai/doc/seedance-assets\#defaults)

| Field | Default |
| --- | --- |
| `GroupType` | `AIGC` |
| `AssetType` | `Image` |
| `PageNumber` | `1` |
| `PageSize` | `20` |
| `PageSize` max | `100` |

## Shared response format [​](https://www.exchangetoken.ai/doc/seedance-assets\#shared-response-format)

### Success response [​](https://www.exchangetoken.ai/doc/seedance-assets\#success-response)

json

```
{
  "ResponseMetadata": {
    "RequestId": "req-...",
    "Action": "CreateAsset",
    "Version": "2024-01-01",
    "Service": "ark",
    "Region": "ap-southeast-1"
  },
  "Result": {
    "Id": "asset-20260414171639-5vbmg"
  }
}
```

### Error response [​](https://www.exchangetoken.ai/doc/seedance-assets\#error-response)

json

```
{
  "error": {
    "type": "invalid_request",
    "message": "resource not found"
  }
}
```

## AssetGroup operations [​](https://www.exchangetoken.ai/doc/seedance-assets\#assetgroup-operations)

| Operation | Required fields | Purpose |
| --- | --- | --- |
| `CreateAssetGroup` | `Name` | Create a logical media group |
| `ListAssetGroups` | None | Query visible asset groups |
| `GetAssetGroup` | `Id` | Query one group |
| `UpdateAssetGroup` | `Id` | Rename or describe one group |

## Asset operations [​](https://www.exchangetoken.ai/doc/seedance-assets\#asset-operations)

| Operation | Required fields | Purpose |
| --- | --- | --- |
| `CreateAsset` | `GroupId`, `URL` | Create one media asset from a public URL |
| `ListAssets` | None | Query assets with filters |
| `GetAsset` | `Id` | Query one asset |
| `UpdateAsset` | `Id` | Rename one asset |

## Recommended workflow [​](https://www.exchangetoken.ai/doc/seedance-assets\#recommended-workflow)

1. Call `CreateAssetGroup`
2. Call `CreateAsset`
3. Poll `GetAsset` until `Result.Status = "Active"`
4. Use `asset://<ASSET_ID>` in the [Seedance Video API](https://www.exchangetoken.ai/doc/seedance-video)

## Example requests [​](https://www.exchangetoken.ai/doc/seedance-assets\#example-requests)

Before running the examples below:

bash

```
export ET_BASE='https://api.exchangetoken.ai'
export ET_TOKEN='sk-xxxxxx'
export GROUP_ID='group-xxxxxxxx'
export ASSET_ID='asset-xxxxxxxx'
export IMAGE_URL='https://example.com/demo-image.jpg'
```

### Create an asset group [​](https://www.exchangetoken.ai/doc/seedance-assets\#create-an-asset-group)

bash

```
curl -sS "$ET_BASE/open/CreateAssetGroup" \
  -H "Authorization: Bearer $ET_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "Name":"demo-group",
    "Description":"seedance asset demo group",
    "GroupType":"AIGC"
  }'
```

### Create an asset [​](https://www.exchangetoken.ai/doc/seedance-assets\#create-an-asset)

bash

```
curl -sS "$ET_BASE/open/CreateAsset" \
  -H "Authorization: Bearer $ET_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{
    \"GroupId\":\"$GROUP_ID\",
    \"URL\":\"$IMAGE_URL\",
    \"Name\":\"demo-asset-1\",
    \"AssetType\":\"Image\"
  }"
```

### Poll until the asset becomes active [​](https://www.exchangetoken.ai/doc/seedance-assets\#poll-until-the-asset-becomes-active)

bash

```
while true; do
  resp="$(curl -sS "$ET_BASE/open/GetAsset" \
    -H "Authorization: Bearer $ET_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"Id\":\"$ASSET_ID\"}")"

  status="$(printf '%s' "$resp" | jq -r '.Result.Status // empty')"
  echo "$resp"

  if [ "$status" = "Active" ]; then
    break
  fi
  if [ "$status" = "Failed" ]; then
    echo "asset preprocess failed"
    break
  fi
  sleep 5
done
```

## Error reference [​](https://www.exchangetoken.ai/doc/seedance-assets\#error-reference)

| HTTP status | `error.type` | Typical meaning |
| --- | --- | --- |
| `400` | `invalid_request` | Invalid parameters |
| `401` | `unauthorized` | Missing or invalid API key |
| `403` | `forbidden` | Permission denied |
| `404` | `invalid_request` | Resource not found |
| `429` | `rate_limited` | Request rate exceeded |
| `502` | `upstream_error` | Upstream fetch or processing failed |
| `503` | `no_channel` | Asset channel unavailable |

## Integration notes [​](https://www.exchangetoken.ai/doc/seedance-assets\#integration-notes)

- `CreateAsset.URL` must be a stable public HTTPS URL reachable by upstream services
- `GetAsset` and `ListAssets` may return temporary signed URLs; store stable IDs instead of using full URLs as cache keys
- If source media is rate-limited or blocked, preprocessing may fail
- Once the asset becomes `Active`, you can reference it as `asset://<ASSET_ID>` in Seedance video tasks

## Related page [​](https://www.exchangetoken.ai/doc/seedance-assets\#related-page)

- [Seedance Video API](https://www.exchangetoken.ai/doc/seedance-video)