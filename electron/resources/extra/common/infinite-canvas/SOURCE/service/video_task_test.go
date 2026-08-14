package service

import "testing"

func TestNormalizeVideoTaskStatusChineseProviderValues(t *testing.T) {
	tests := map[string]string{
		"生成中":  "processing",
		"处理中":  "processing",
		"排队中":  "queued",
		"生成成功": "completed",
		"已完成":  "completed",
		"生成失败": "failed",
	}
	for input, want := range tests {
		if got := NormalizeVideoTaskStatus(input); got != want {
			t.Fatalf("NormalizeVideoTaskStatus(%q) = %q, want %q", input, got, want)
		}
	}
}
