package handler

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/tigerowo/infinite-canvas/model"
)

func TestWorkbenchPixUploadUsesFilesEndpoint(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/v1/files" {
			t.Fatalf("upload path = %q", r.URL.Path)
		}
		if _, err := io.ReadAll(r.Body); err != nil {
			t.Fatal(err)
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"data":{"file":{"url":"https://cdn.example.com/input.png"}}}`))
	}))
	defer server.Close()
	got, err := uploadAPIMartImageBytes(model.ModelChannel{BaseURL: server.URL, APIKey: "test", Protocol: "workbench-pix"}, []byte("png"), "input.png", "image/png")
	if err != nil {
		t.Fatal(err)
	}
	if got != "https://cdn.example.com/input.png" {
		t.Fatalf("upload URL = %q", got)
	}
}

func TestResolveWorkbenchPaths(t *testing.T) {
	tests := []struct{ protocol, path, want string }{
		{"workbench-kwjm", "/videos", "/videos/generations"},
		{"workbench-kwjm", "/videos/job-1", "/videos/generations/job-1"},
		{"workbench-pix", "/images/edits", "/images/generations"},
		{"workbench-pix", "/videos/job 1", "/skills/task-status?task_id=job+1"},
		{"workbench-exchangetoken", "/videos", "/contents/generations/tasks"},
	}
	for _, test := range tests {
		got := resolveAIProxyPath(model.ModelChannel{Protocol: test.protocol}, "seedance-2.0", test.path)
		if got != test.want {
			t.Fatalf("%s %s: got %q, want %q", test.protocol, test.path, got, test.want)
		}
	}
}

func TestNormalizeWorkbenchVideoBodies(t *testing.T) {
	body := []byte(`{"prompt":"跳舞","seconds":"8","size":"9:16","resolution_name":"720p","video_generate_audio":"true"}`)
	kwjm, _, err := normalizeWorkbenchRequestBody(body, "application/json", "seedance-2.0-fast", model.ModelChannel{Protocol: "workbench-kwjm"}, "/videos/generations")
	if err != nil {
		t.Fatal(err)
	}
	var kwjmPayload map[string]any
	if err := json.Unmarshal(kwjm, &kwjmPayload); err != nil {
		t.Fatal(err)
	}
	if kwjmPayload["model"] != "kw-video-v2-fast" || kwjmPayload["ratio"] != "9:16" || kwjmPayload["generate_audio"] != true {
		t.Fatalf("unexpected KWJM body: %s", kwjm)
	}

	pix, _, err := normalizeWorkbenchRequestBody(body, "application/json", "seedance-2.0", model.ModelChannel{Protocol: "workbench-pix"}, "/videos/generations")
	if err != nil {
		t.Fatal(err)
	}
	var pixPayload map[string]any
	if err := json.Unmarshal(pix, &pixPayload); err != nil {
		t.Fatal(err)
	}
	if pixPayload["model"] != "seedance-2-0-official" || pixPayload["mode"] != "text-to-video" || pixPayload["aspect_ratio"] != "9:16" {
		t.Fatalf("unexpected PIX body: %s", pix)
	}
}

func TestNormalizeWorkbenchPixImageEdit(t *testing.T) {
	body := []byte(`{"model":"gpt-image-2","prompt":"换成白发","n":2,"image":["https://example.com/a.png"]}`)
	got, _, err := normalizeWorkbenchRequestBody(body, "application/json", "gpt-image-2", model.ModelChannel{Protocol: "workbench-pix"}, "/images/generations")
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(got, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["mode"] != "image-edit" || payload["count"] != float64(2) {
		t.Fatalf("unexpected PIX image body: %s", got)
	}
}

func TestNormalizeWorkbenchPixImageMultiReference(t *testing.T) {
	body := []byte(`{"model":"gpt-image-2","prompt":"组合人物和场景","image":["https://example.com/a.png","https://example.com/b.png"]}`)
	got, _, err := normalizeWorkbenchRequestBody(body, "application/json", "gpt-image-2", model.ModelChannel{Protocol: "workbench-pix"}, "/images/generations")
	if err != nil {
		t.Fatal(err)
	}
	var payload map[string]any
	if err := json.Unmarshal(got, &payload); err != nil {
		t.Fatal(err)
	}
	if payload["mode"] != "multi-reference" {
		t.Fatalf("unexpected PIX multi-reference body: %s", got)
	}
	if images, ok := payload["images"].([]any); !ok || len(images) != 2 {
		t.Fatalf("unexpected PIX image references: %s", got)
	}
}

func TestNormalizeWorkbenchPixImageRejectsTooManyReferences(t *testing.T) {
	images := make([]string, 17)
	for index := range images {
		images[index] = fmt.Sprintf("https://example.com/%d.png", index)
	}
	body, err := json.Marshal(map[string]any{"model": "gpt-image-2", "prompt": "组合素材", "images": images})
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := normalizeWorkbenchRequestBody(body, "application/json", "gpt-image-2", model.ModelChannel{Protocol: "workbench-pix"}, "/images/generations"); err == nil {
		t.Fatal("expected reference limit error")
	}
}
