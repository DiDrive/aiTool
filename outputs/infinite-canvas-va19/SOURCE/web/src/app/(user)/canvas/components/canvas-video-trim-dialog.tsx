"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Button, InputNumber, Modal, Radio, Slider } from "antd";

import type { CanvasNodeData, CanvasNodeMetadata, CanvasVideoAnalysisMode } from "../types";

type Props = {
    node: CanvasNodeData | null;
    open: boolean;
    onClose: () => void;
    onConfirm: (patch: Partial<CanvasNodeMetadata>) => void;
};

export function CanvasVideoTrimDialog({ node, open, onClose, onConfirm }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const sourceDurationMs = Math.max(1, node?.metadata?.durationMs || 1);
    const savedTrim = node?.metadata?.videoTrim;
    const savedAnalysis = node?.metadata?.videoAnalysisRange;
    const [durationMs, setDurationMs] = useState(sourceDurationMs);
    const [trim, setTrim] = useState<[number, number]>([0, sourceDurationMs]);
    const [analysis, setAnalysis] = useState<[number, number]>([0, sourceDurationMs]);
    const [mode, setMode] = useState<CanvasVideoAnalysisMode>(node?.metadata?.videoAnalysisMode || "standard");

    useEffect(() => {
        if (!open || !node) return;
        const duration = Math.max(1, node.metadata?.durationMs || 1);
        setDurationMs(duration);
        setTrim(normalizeRange(savedTrim?.startMs ?? 0, savedTrim?.endMs ?? duration, duration));
        setAnalysis(normalizeRange(savedAnalysis?.startMs ?? savedTrim?.startMs ?? 0, savedAnalysis?.endMs ?? savedTrim?.endMs ?? duration, duration));
        setMode(node.metadata?.videoAnalysisMode || "standard");
    }, [node, open, savedAnalysis?.endMs, savedAnalysis?.startMs, savedTrim?.endMs, savedTrim?.startMs]);

    const marks = useMemo(() => ({ 0: "00:00", [durationMs]: formatTime(durationMs) }), [durationMs]);
    if (!node?.metadata?.content) return null;

    const updateTrim = (value: number[]) => {
        const next = normalizeRange(value[0], value[1], durationMs);
        setTrim(next);
        setAnalysis((current) => [Math.max(next[0], current[0]), Math.min(next[1], Math.max(current[1], next[0] + 1))]);
    };

    return (
        <Modal title="视频裁剪与分析范围" open={open} centered width={920} footer={null} onCancel={onClose} destroyOnHidden>
            <div className="grid gap-5 lg:grid-cols-[minmax(0,1.25fr)_minmax(300px,.75fr)]">
                <div className="space-y-3">
                    <video
                        ref={videoRef}
                        src={node.metadata.content}
                        controls
                        className="aspect-video w-full rounded-xl bg-black object-contain"
                        onLoadedMetadata={(event) => {
                            const measured = Math.round(event.currentTarget.duration * 1000);
                            if (measured > 0 && Math.abs(measured - durationMs) > 10) setDurationMs(measured);
                        }}
                        onTimeUpdate={(event) => {
                            const now = event.currentTarget.currentTime * 1000;
                            if (now >= trim[1]) {
                                event.currentTarget.pause();
                                event.currentTarget.currentTime = trim[0] / 1000;
                            }
                        }}
                    />
                    <div className="flex flex-wrap gap-2">
                        <Button onClick={() => seekAndPlay(videoRef.current, trim[0])}>播放裁剪片段</Button>
                        <Button onClick={() => seekAndPlay(videoRef.current, analysis[0])}>播放分析范围</Button>
                        <Button onClick={() => { setTrim([0, durationMs]); setAnalysis([0, durationMs]); }}>恢复完整视频</Button>
                    </div>
                </div>

                <div className="space-y-5">
                    <RangeEditor label="视频裁剪（非破坏）" value={trim} durationMs={durationMs} marks={marks} onChange={updateTrim} />
                    <RangeEditor label="本次倒推分析范围" value={analysis} durationMs={durationMs} minMs={trim[0]} maxMs={trim[1]} marks={marks} onChange={(value) => setAnalysis(normalizeRange(value[0], value[1], durationMs, trim[0], trim[1]))} />
                    <div className="space-y-2">
                        <div className="text-sm font-medium">分析精度</div>
                        <Radio.Group value={mode} onChange={(event) => setMode(event.target.value)} optionType="button" buttonStyle="solid">
                            <Radio.Button value="fast">快速</Radio.Button>
                            <Radio.Button value="standard">标准</Radio.Button>
                            <Radio.Button value="detailed">精细</Radio.Button>
                        </Radio.Group>
                        <p className="text-xs leading-5 text-stone-500">精细模式会提高候选帧密度并按时间片生成证据图，适合剧情和动作倒推。</p>
                    </div>
                    <div className="rounded-lg bg-stone-100 p-3 text-sm dark:bg-stone-900">
                        分析绝对时间：{formatTime(analysis[0])} ～ {formatTime(analysis[1])}<br />
                        片段时长：{formatTime(analysis[1] - analysis[0])}
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button onClick={onClose}>取消</Button>
                        <Button type="primary" onClick={() => onConfirm({ videoTrim: { startMs: trim[0], endMs: trim[1] }, videoAnalysisRange: { startMs: analysis[0], endMs: analysis[1] }, videoAnalysisMode: mode })}>保存范围</Button>
                    </div>
                </div>
            </div>
        </Modal>
    );
}

function RangeEditor({ label, value, durationMs, minMs = 0, maxMs = durationMs, marks, onChange }: { label: string; value: [number, number]; durationMs: number; minMs?: number; maxMs?: number; marks: Record<number, string>; onChange: (value: number[]) => void }) {
    return (
        <div className="space-y-2">
            <div className="text-sm font-medium">{label}</div>
            <Slider range min={minMs} max={maxMs} step={10} value={value} marks={marks} tooltip={{ formatter: (value) => formatTime(value || 0) }} onChange={onChange} />
            <div className="grid grid-cols-2 gap-2">
                <InputNumber min={minMs} max={value[1] - 1} value={value[0]} addonBefore="开始 ms" className="w-full" onChange={(next) => onChange([Number(next || 0), value[1]])} />
                <InputNumber min={value[0] + 1} max={maxMs} value={value[1]} addonBefore="结束 ms" className="w-full" onChange={(next) => onChange([value[0], Number(next || maxMs)])} />
            </div>
        </div>
    );
}

function normalizeRange(start: number, end: number, duration: number, min = 0, max = duration): [number, number] {
    const safeStart = Math.max(min, Math.min(Math.round(start), max - 1));
    const safeEnd = Math.max(safeStart + 1, Math.min(Math.round(end), max));
    return [safeStart, safeEnd];
}

function seekAndPlay(video: HTMLVideoElement | null, timeMs: number) {
    if (!video) return;
    video.currentTime = timeMs / 1000;
    void video.play();
}

function formatTime(ms: number) {
    const total = Math.max(0, ms) / 1000;
    const minutes = Math.floor(total / 60);
    const seconds = total - minutes * 60;
    return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(3).padStart(6, "0")}`;
}
