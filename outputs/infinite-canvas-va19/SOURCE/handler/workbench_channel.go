package handler

import (
	"encoding/json"
	"fmt"
	"strings"

	"github.com/tigerowo/infinite-canvas/model"
)

func workbenchProtocol(channel model.ModelChannel) string {
	value := strings.TrimPrefix(strings.ToLower(strings.TrimSpace(channel.Protocol)), "workbench-")
	switch value {
	case "pix", "kwjm", "exchangetoken", "modeltop", "custom":
		return value
	default:
		return ""
	}
}

func isWorkbenchChannel(channel model.ModelChannel) bool { return workbenchProtocol(channel) != "" }

func normalizeWorkbenchRequestBody(body []byte, contentType, modelName string, channel model.ModelChannel, upstreamPath string) ([]byte, string, error) {
	payload, err := readAPIMartPayload(body, contentType, channel)
	if err != nil {
		return body, contentType, err
	}
	protocol := workbenchProtocol(channel)
	if protocol == "pix" && (upstreamPath == "/images/generations" || upstreamPath == "/images/edits") {
		normalized := normalizeWorkbenchPixImage(payload, modelName)
		if images, ok := normalized["images"].([]string); ok && len(images) > workbenchPixImageReferenceLimit(modelName) {
			return body, contentType, fmt.Errorf("PIX %s 最多支持 %d 张参考图，当前绑定了 %d 张", firstNonEmpty(modelName, "image model"), workbenchPixImageReferenceLimit(modelName), len(images))
		}
		return encodeWorkbenchPayload(normalized)
	}
	if upstreamPath == "/videos/generations" && (protocol == "pix" || protocol == "kwjm") {
		return encodeWorkbenchPayload(normalizeWorkbenchVideo(payload, modelName, protocol))
	}
	return body, contentType, nil
}

func encodeWorkbenchPayload(payload map[string]any) ([]byte, string, error) {
	encoded, err := json.Marshal(payload)
	return encoded, "application/json", err
}

func normalizeWorkbenchPixImage(payload map[string]any, modelName string) map[string]any {
	images := workbenchReferences(payload, "image", "images", "image_urls", "input_reference", "input_reference[]")
	result := map[string]any{
		"model":  firstNonEmpty(modelName, toStringSafe(payload["model"])),
		"prompt": toStringSafe(payload["prompt"]),
		"mode":   "text-to-image",
		"count":  workbenchNumber(payload, "n", "count", 1),
	}
	for _, key := range []string{"size", "quality", "aspect_ratio", "thinking_level", "bot_type", "chaos", "version"} {
		if value, ok := payload[key]; ok && !isEmptyValue(value) {
			result[key] = value
		}
	}
	if len(images) > 0 {
		result["mode"] = "image-edit"
		if len(images) > 1 {
			result["mode"] = "multi-reference"
		}
		result["images"] = images
	}
	return result
}

func workbenchPixImageReferenceLimit(modelName string) int {
	modelName = strings.ToLower(strings.TrimSpace(modelName))
	if strings.Contains(modelName, "mj_imagine") {
		return 4
	}
	if strings.Contains(modelName, "gemini") {
		return 14
	}
	return 16
}

func normalizeWorkbenchVideo(payload map[string]any, modelName, protocol string) map[string]any {
	firstFrames := workbenchReferences(payload, "first_frame_url", "first_frame_image")
	lastFrames := workbenchReferences(payload, "last_frame_url", "last_frame_image")
	references := workbenchReferences(payload, "input_reference", "input_reference[]", "image", "images")
	prompt := toStringSafe(payload["prompt"])
	duration := workbenchNumber(payload, "seconds", "duration", 5)
	ratio := firstNonEmpty(toStringSafe(payload["size"]), toStringSafe(payload["aspect_ratio"]), "16:9")
	resolution := firstNonEmpty(toStringSafe(payload["resolution_name"]), toStringSafe(payload["resolution"]), "720p")
	if protocol == "kwjm" {
		model := "kw-video-v2"
		if strings.Contains(strings.ToLower(modelName), "fast") {
			model = "kw-video-v2-fast"
		}
		content := []any{map[string]any{"type": "text", "text": prompt}}
		for _, value := range firstFrames {
			content = append(content, workbenchContent("image", value, "first_frame"))
		}
		for _, value := range lastFrames {
			content = append(content, workbenchContent("image", value, "last_frame"))
		}
		for _, value := range references {
			content = append(content, workbenchContent("image", value, "reference_image"))
		}
		return map[string]any{"model": model, "content": content, "generate_audio": workbenchBool(payload["video_generate_audio"]), "resolution": resolution, "ratio": ratio, "duration": duration, "watermark": false}
	}
	images := append(append(firstFrames, lastFrames...), references...)
	mode := "text-to-video"
	if len(firstFrames) > 0 && len(lastFrames) > 0 {
		mode = "first-last"
	} else if len(firstFrames) > 0 {
		mode = "first-frame"
	} else if len(images) > 0 {
		mode = "reference"
	}
	pixModel := firstNonEmpty(modelName, "seedance-2-0-official")
	if strings.HasPrefix(strings.ToLower(pixModel), "seedance-2.0") {
		pixModel = "seedance-2-0-official"
	}
	result := map[string]any{"model": pixModel, "prompt": prompt, "mode": mode, "aspect_ratio": ratio, "duration": duration, "count": 1, "resolution": resolution}
	if len(images) > 0 {
		result["images"] = images
	}
	return result
}

func workbenchContent(kind, value, role string) map[string]any {
	key := kind + "_url"
	return map[string]any{"type": key, key: map[string]any{"url": value}, "role": role}
}

func workbenchReferences(payload map[string]any, keys ...string) []string {
	var result []string
	seen := map[string]bool{}
	for _, key := range keys {
		for _, value := range collectAPIMartReferenceStrings(payload[key], 0) {
			value = strings.TrimSpace(value)
			if value != "" && !seen[value] {
				result = append(result, value)
				seen[value] = true
			}
		}
	}
	return result
}

func workbenchNumber(payload map[string]any, primary, secondary string, fallback int) int {
	for _, key := range []string{primary, secondary} {
		if value := strings.TrimSpace(toStringSafe(payload[key])); value != "" {
			var number int
			if _, err := fmt.Sscanf(value, "%d", &number); err == nil && number > 0 {
				return number
			}
		}
	}
	return fallback
}

func workbenchBool(value any) bool {
	switch strings.ToLower(strings.TrimSpace(toStringSafe(value))) {
	case "1", "true", "yes", "on":
		return true
	}
	return false
}
