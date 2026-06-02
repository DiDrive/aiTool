[Skip to content](https://www.exchangetoken.ai/doc/gpt-image-2#VPContent)

On This Page

# GPT Image 2 [​](https://www.exchangetoken.ai/doc/gpt-image-2\#gpt-image-2)

## Model Introduction [​](https://www.exchangetoken.ai/doc/gpt-image-2\#model-introduction)

`gpt-image-2` is an OpenAI-compatible image model available through Exchange Token. It supports both text-to-image generation and image editing with the same gateway authentication pattern used by the rest of the OpenAI-compatible models.

OpenAI-Compatible Image API

Use the standard Exchange Token gateway address and keep the request format aligned with OpenAI Images API:

- Image generation: `POST /v1/images/generations`
- Image editing: `POST /v1/images/edits`

## Calling Method [​](https://www.exchangetoken.ai/doc/gpt-image-2\#calling-method)

### API Endpoint [​](https://www.exchangetoken.ai/doc/gpt-image-2\#api-endpoint)

text

```
https://api.exchangetoken.ai/v1
```

### Authentication [​](https://www.exchangetoken.ai/doc/gpt-image-2\#authentication)

All requests must include:

text

```
Authorization: Bearer YOUR_API_KEY
```

### Supported Model Name [​](https://www.exchangetoken.ai/doc/gpt-image-2\#supported-model-name)

- `gpt-image-2`

## Image Generation [​](https://www.exchangetoken.ai/doc/gpt-image-2\#image-generation)

### Request Path [​](https://www.exchangetoken.ai/doc/gpt-image-2\#request-path)

text

```
POST /v1/images/generations
```

### Request Format [​](https://www.exchangetoken.ai/doc/gpt-image-2\#request-format)

- `Content-Type: application/json`
- Put `model` in the JSON body

### Example [​](https://www.exchangetoken.ai/doc/gpt-image-2\#example)

bash

```
curl -X POST "https://api.exchangetoken.ai/v1/images/generations" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-image-2",
    "prompt": "A cute cat sitting on a windowsill, realistic photo, soft morning light",
    "n": 1,
    "size": "1024x1024",
    "quality": "high"
  }'
```

## Image Editing [​](https://www.exchangetoken.ai/doc/gpt-image-2\#image-editing)

### Request Path [​](https://www.exchangetoken.ai/doc/gpt-image-2\#request-path-1)

text

```
POST /v1/images/edits
```

### Request Format [​](https://www.exchangetoken.ai/doc/gpt-image-2\#request-format-1)

- `Content-Type: multipart/form-data`
- Put `model` in the form fields
- `image` or repeated `image[]` fields are required
- `mask` is optional

### Single-Image Example [​](https://www.exchangetoken.ai/doc/gpt-image-2\#single-image-example)

bash

```
curl -X POST "https://api.exchangetoken.ai/v1/images/edits" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=gpt-image-2" \
  -F "image=@input.png" \
  -F "prompt=Add a vivid green background behind the cat" \
  -F "mask=@mask.png"
```

### Multi-Image Example [​](https://www.exchangetoken.ai/doc/gpt-image-2\#multi-image-example)

bash

```
curl -X POST "https://api.exchangetoken.ai/v1/images/edits" \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -F "model=gpt-image-2" \
  -F "image[]=@body-lotion.png" \
  -F "image[]=@bath-bomb.png" \
  -F "image[]=@incense-kit.png" \
  -F "image[]=@soap.png" \
  -F 'prompt=Create a lovely gift basket with these four items in it'
```

## Common Parameters [​](https://www.exchangetoken.ai/doc/gpt-image-2\#common-parameters)

| Parameter | Location | Required | Description |
| --- | --- | --- | --- |
| `model` | JSON / form-data | Yes | Use `gpt-image-2` |
| `prompt` | JSON / form-data | Yes | Text instruction for generation or editing |
| `image` / `image[]` | form-data | Required for edits | Input image file, or repeated `image[]` fields for multi-image editing |
| `mask` | form-data | No | Optional transparent mask for edit region |
| `n` | JSON | No | Number of images to generate |
| `size` | JSON | No | Image size, such as `1024x1024` |
| `quality` | JSON / form-data | No | Output quality, such as `low`, `medium`, or `high` |

## Notes [​](https://www.exchangetoken.ai/doc/gpt-image-2\#notes)

- The downstream interface remains OpenAI-style. Users do not need to care about upstream Azure deployment paths or API versions.
- For image edits, `multipart/form-data` should be used instead of JSON.
- For multi-image edits, send multiple files with repeated `image[]` form fields.
- When using the OpenAI SDK, keep `base_url` pointed at `https://api.exchangetoken.ai/v1` and switch only the path and model name.