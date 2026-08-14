"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button, InputNumber, Modal, Slider, Tooltip } from "antd";
import { Crosshair, Pause, Play, Scissors, StepBack, StepForward, ZoomIn, ZoomOut } from "lucide-react";

import type { CanvasNodeData, CanvasNodeMetadata } from "../types";

type Props = {
    node: CanvasNodeData | null;
    open: boolean;
    onClose: () => void;
    onConfirm: (patch: Partial<CanvasNodeMetadata>) => void;
    onCreateClip: (node: CanvasNodeData, range: { startMs: number; endMs: number }) => Promise<void>;
};

type RangeTuple = [number, number];
type ActiveTrack = "trim" | "analysis";

const DEFAULT_FPS = 30;

export function CanvasVideoTrimDialog({ node, open, onClose, onConfirm, onCreateClip }: Props) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const timelineRef = useRef<HTMLDivElement>(null);
    const sourceDurationMs = Math.max(1, node?.metadata?.durationMs || 1);
    const [durationMs, setDurationMs] = useState(sourceDurationMs);
    const [trim, setTrim] = useState<RangeTuple>([0, sourceDurationMs]);
    const [analysis, setAnalysis] = useState<RangeTuple>([0, sourceDurationMs]);
    const [activeTrack, setActiveTrack] = useState<ActiveTrack>("trim");
    const [currentMs, setCurrentMs] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [pixelsPerSecond, setPixelsPerSecond] = useState(24);
    const [thumbnails, setThumbnails] = useState<string[]>([]);
    const [thumbnailLoading, setThumbnailLoading] = useState(false);
    const [videoDimensions, setVideoDimensions] = useState({ width: Math.max(1, node?.metadata?.naturalWidth || 16), height: Math.max(1, node?.metadata?.naturalHeight || 9) });
    const [creatingClip, setCreatingClip] = useState(false);

    useEffect(() => {
        if (!open || !node) return;
        const duration = Math.max(1, node.metadata?.durationMs || 1);
        const savedTrim = node.metadata?.videoTrim;
        const savedAnalysis = node.metadata?.videoAnalysisRange;
        const nextTrim = normalizeRange(savedTrim?.startMs ?? 0, savedTrim?.endMs ?? duration, duration);
        setDurationMs(duration);
        setTrim(nextTrim);
        setAnalysis(normalizeRange(savedAnalysis?.startMs ?? 0, savedAnalysis?.endMs ?? duration, duration));
        setCurrentMs(nextTrim[0]);
        setActiveTrack("trim");
        setPlaying(false);
        setVideoDimensions({ width: Math.max(1, node.metadata?.naturalWidth || 16), height: Math.max(1, node.metadata?.naturalHeight || 9) });
    }, [node, open]);

    const seek = useCallback((timeMs: number, shouldPlay = false) => {
        const video = videoRef.current;
        const safe = Math.max(0, Math.min(timeMs, durationMs));
        setCurrentMs(safe);
        if (!video) return;
        video.currentTime = safe / 1000;
        if (shouldPlay) void video.play();
    }, [durationMs]);

    const activeRange = activeTrack === "trim" ? trim : analysis;
    const setActiveRange = useCallback((next: RangeTuple) => {
        if (activeTrack === "trim") {
            const normalized = normalizeRange(next[0], next[1], durationMs);
            setTrim(normalized);
        } else {
            setAnalysis(normalizeRange(next[0], next[1], durationMs));
        }
    }, [activeTrack, durationMs]);

    const stepFrame = useCallback((direction: -1 | 1) => {
        const video = videoRef.current;
        video?.pause();
        seek(currentMs + direction * (1000 / DEFAULT_FPS));
    }, [currentMs, seek]);

    const togglePlayback = useCallback(() => {
        const video = videoRef.current;
        if (!video) return;
        if (video.paused) {
            if (currentMs < activeRange[0] || currentMs >= activeRange[1]) seek(activeRange[0], true);
            else void video.play();
        } else video.pause();
    }, [activeRange, currentMs, seek]);

    useEffect(() => {
        if (!open) return;
        const onKeyDown = (event: KeyboardEvent) => {
            const target = event.target as HTMLElement | null;
            if (target?.matches("input, textarea, select, [contenteditable=true]")) return;
            if (event.code === "Space") { event.preventDefault(); togglePlayback(); }
            else if (event.code === "ArrowLeft") { event.preventDefault(); stepFrame(-1); }
            else if (event.code === "ArrowRight") { event.preventDefault(); stepFrame(1); }
            else if (event.key.toLowerCase() === "i") setActiveRange([Math.min(currentMs, activeRange[1] - 1), activeRange[1]]);
            else if (event.key.toLowerCase() === "o") setActiveRange([activeRange[0], Math.max(currentMs, activeRange[0] + 1)]);
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [activeRange, currentMs, open, setActiveRange, stepFrame, togglePlayback]);

    useEffect(() => {
        if (!open || !node?.metadata?.content || durationMs <= 1) return;
        let cancelled = false;
        setThumbnailLoading(true);
        generateVideoThumbnails(node.metadata.content, durationMs, 24).then((items) => {
            if (!cancelled) setThumbnails(items);
        }).finally(() => { if (!cancelled) setThumbnailLoading(false); });
        return () => { cancelled = true; };
    }, [durationMs, node?.metadata?.content, open]);

    const timelineWidth = Math.max(1000, Math.round(durationMs / 1000 * pixelsPerSecond));
    const ticks = useMemo(() => buildTicks(durationMs, pixelsPerSecond), [durationMs, pixelsPerSecond]);
    if (!node?.metadata?.content) return null;

    const applyMeasuredDuration = (measured: number) => {
        if (measured <= 0 || Math.abs(measured - durationMs) <= 10) return;
        const wholeTrim = trim[0] === 0 && trim[1] === durationMs;
        const wholeAnalysis = analysis[0] === 0 && analysis[1] === durationMs;
        const nextTrim = wholeTrim ? [0, measured] as RangeTuple : normalizeRange(trim[0], trim[1], measured);
        setDurationMs(measured);
        setTrim(nextTrim);
        setAnalysis(wholeAnalysis ? [0, measured] : normalizeRange(analysis[0], analysis[1], measured));
        setCurrentMs((value) => Math.min(value, measured));
    };

    return (
        <Modal title={<div className="flex items-center gap-2"><Scissors className="size-4 text-blue-500" />视频编辑</div>} open={open} centered width="min(1240px, calc(100vw - 32px))" footer={null} onCancel={onClose} destroyOnHidden styles={{ body: { padding: 0 } }}>
            <div className="overflow-hidden rounded-b-xl bg-[#161616] text-stone-100">
                <div className="flex border-b border-white/10 bg-[#101010] px-4 pt-2">
                    <EditorTab active={activeTrack === "trim"} onClick={() => { setActiveTrack("trim"); seek(trim[0]); }}>视频裁剪</EditorTab>
                    <EditorTab active={activeTrack === "analysis"} onClick={() => { setActiveTrack("analysis"); seek(analysis[0]); }}>AI 分析片段</EditorTab>
                </div>
                <div className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_330px]">
                    <div className="min-w-0">
                        <div className="flex h-[min(480px,52vh)] min-h-[320px] items-center justify-center overflow-hidden rounded-lg bg-black/70">
                            <div className={`relative overflow-hidden bg-black ${videoDimensions.width >= videoDimensions.height ? "w-full max-h-full" : "h-full max-w-full"}`} style={{ aspectRatio: `${videoDimensions.width} / ${videoDimensions.height}` }}>
                            <video ref={videoRef} src={node.metadata.content} className="h-full w-full object-contain" onLoadedMetadata={(event) => { applyMeasuredDuration(Math.round(event.currentTarget.duration * 1000)); setVideoDimensions({ width: Math.max(1, event.currentTarget.videoWidth), height: Math.max(1, event.currentTarget.videoHeight) }); }} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onTimeUpdate={(event) => { const now = event.currentTarget.currentTime * 1000; setCurrentMs(now); if (now >= activeRange[1]) { event.currentTarget.pause(); seek(activeRange[0]); } }} />
                            <div className="pointer-events-none absolute bottom-3 left-3 rounded bg-black/70 px-2 py-1 font-mono text-xs">{formatSeconds(currentMs)} / {formatSeconds(durationMs)}</div>
                            </div>
                        </div>
                        <div className="mt-3 flex items-center justify-center gap-1">
                            <TransportButton label="上一帧（←）" onClick={() => stepFrame(-1)}><StepBack className="size-4" /></TransportButton>
                            <TransportButton label={playing ? "暂停（Space）" : "播放（Space）"} onClick={togglePlayback}>{playing ? <Pause className="size-5" /> : <Play className="size-5" />}</TransportButton>
                            <TransportButton label="下一帧（→）" onClick={() => stepFrame(1)}><StepForward className="size-4" /></TransportButton>
                            <span className="mx-3 font-mono text-sm text-white">{formatSeconds(currentMs)}</span>
                            <Button size="small" onClick={() => setActiveRange([Math.min(currentMs, activeRange[1] - 1), activeRange[1]])}>设入点 I</Button>
                            <Button size="small" onClick={() => setActiveRange([activeRange[0], Math.max(currentMs, activeRange[0] + 1)])}>设出点 O</Button>
                        </div>
                    </div>

                    <div className="space-y-4 rounded-lg border border-white/10 bg-white/[0.035] p-4">
                        {activeTrack === "trim" ? <>
                            <div><div className="text-sm font-semibold">输出新视频</div><p className="mt-1 text-xs leading-5 text-stone-400">拖动缩略帧轨两侧把手选择保留内容，生成后会在画布创建一个新视频节点，原视频不变。</p></div>
                            <PreciseRangeEditor label="裁剪时间范围" value={trim} minMs={0} maxMs={durationMs} onChange={setActiveRange} />
                            <RangeSummary title="输出片段" value={trim} />
                            <div className="flex flex-wrap gap-2"><Button onClick={() => { setTrim([0, durationMs]); seek(0); }}>恢复全片</Button><Button onClick={() => seek(trim[0], true)}>预览裁剪片段</Button></div>
                        </> : <>
                            <div><div className="text-sm font-semibold">选择倒推范围</div><p className="mt-1 text-xs leading-5 text-stone-400">AI 固定使用精细分析：约每 0.5 秒采集候选帧，并结合镜头变化保留关键画面。</p></div>
                            <PreciseRangeEditor label="AI 分析时间范围" value={analysis} minMs={0} maxMs={durationMs} onChange={setActiveRange} />
                            <RangeSummary title="分析片段" value={analysis} />
                            <div className="flex flex-wrap gap-2"><Button onClick={() => { setAnalysis([0, durationMs]); seek(0); }}>分析全片</Button><Button onClick={() => seek(analysis[0], true)}>预览分析片段</Button></div>
                        </>}
                    </div>
                </div>

                <div className="border-t border-white/10 bg-[#101010]">
                    <div className="flex h-11 items-center justify-between border-b border-white/10 px-4">
                        <div className="flex items-center gap-2 text-xs text-stone-400"><Crosshair className="size-4" />点击或拖动时间线定位 · Space 播放 · ←/→ 逐帧 · I/O 设置当前轨道入出点</div>
                        <div className="flex items-center gap-2"><ZoomOut className="size-4" /><Slider className="w-32" min={12} max={160} value={pixelsPerSecond} onChange={setPixelsPerSecond} tooltip={{ formatter: (value) => `${value}px/s` }} /><ZoomIn className="size-4" /></div>
                    </div>
                    <div ref={timelineRef} className="thin-scrollbar overflow-x-auto overflow-y-hidden px-4 pb-4">
                        <div className="relative select-none" style={{ width: timelineWidth }}>
                            <TimelineRuler ticks={ticks} durationMs={durationMs} onSeek={seek} />
                            <ThumbnailTrack thumbnails={thumbnails} loading={thumbnailLoading} durationMs={durationMs} value={activeRange} color={activeTrack === "trim" ? "#3b82f6" : "#f59e0b"} label={activeTrack === "trim" ? "输出片段" : "AI 分析片段"} onSeek={seek} onChange={setActiveRange} />
                            <Playhead currentMs={currentMs} durationMs={durationMs} onSeek={seek} />
                        </div>
                    </div>
                </div>

                <div className="flex items-center justify-between border-t border-white/10 px-4 py-3"><span className="text-xs text-stone-500">{activeTrack === "trim" ? "裁剪会生成新视频，原视频保持不变。" : "保存后，视频倒推只分析所选时间范围。"}</span><div className="flex gap-2"><Button onClick={onClose}>取消</Button>{activeTrack === "analysis" ? <Button type="primary" onClick={() => onConfirm({ videoAnalysisRange: { startMs: analysis[0], endMs: analysis[1] }, videoAnalysisMode: "detailed" })}>保存分析片段</Button> : <><Button onClick={() => onConfirm({ videoTrim: { startMs: trim[0], endMs: trim[1] } })}>仅保存裁剪范围</Button><Button type="primary" loading={creatingClip} icon={<Scissors className="size-4" />} onClick={async () => { if (!node || creatingClip) return; setCreatingClip(true); try { await onCreateClip(node, { startMs: trim[0], endMs: trim[1] }); } finally { setCreatingClip(false); } }}>生成裁剪视频</Button></>}</div></div>
            </div>
        </Modal>
    );
}

function TransportButton({ label, children, onClick }: { label: string; children: React.ReactNode; onClick: () => void }) { return <Tooltip title={label}><button className="grid size-9 place-items-center rounded-md text-stone-200 hover:bg-white/10" onClick={onClick}>{children}</button></Tooltip>; }

function EditorTab({ active, children, onClick }: { active: boolean; children: React.ReactNode; onClick: () => void }) {
    return <button type="button" className={`relative px-5 py-3 text-sm font-medium transition ${active ? "text-white" : "text-stone-500 hover:text-stone-300"}`} onClick={onClick}>{children}{active ? <span className="absolute inset-x-3 bottom-0 h-0.5 rounded bg-blue-500" /> : null}</button>;
}

function RangeSummary({ title, value }: { title: string; value: RangeTuple }) {
    return <div className="rounded-md bg-black/30 p-3 text-xs leading-6 text-stone-300"><div className="font-medium text-stone-100">{title}</div><div>{formatSeconds(value[0])} ～ {formatSeconds(value[1])}</div><div>片段时长：{formatSeconds(value[1] - value[0])}</div></div>;
}

function PreciseRangeEditor({ label, value, minMs, maxMs, onChange }: { label: string; value: RangeTuple; minMs: number; maxMs: number; onChange: (value: RangeTuple) => void }) {
    return <div><div className="mb-2 text-sm font-semibold">{label}</div><div className="grid grid-cols-2 gap-2"><InputNumber controls={false} precision={3} step={0.001} min={minMs / 1000} max={(value[1] - 1) / 1000} value={value[0] / 1000} addonBefore="入点 秒" className="w-full" onChange={(next) => onChange(normalizeRange(Number(next ?? minMs / 1000) * 1000, value[1], maxMs, minMs, maxMs))} /><InputNumber controls={false} precision={3} step={0.001} min={(value[0] + 1) / 1000} max={maxMs / 1000} value={value[1] / 1000} addonBefore="出点 秒" className="w-full" onChange={(next) => onChange(normalizeRange(value[0], Number(next ?? maxMs / 1000) * 1000, maxMs, minMs, maxMs))} /></div></div>;
}

function TimelineRuler({ ticks, durationMs, onSeek }: { ticks: number[]; durationMs: number; onSeek: (ms: number) => void }) {
    return <div className="relative h-8 cursor-crosshair border-b border-white/10" onPointerDown={(event) => seekFromPointer(event, durationMs, onSeek)}>{ticks.map((ms) => <div key={ms} className="absolute bottom-0 h-2 border-l border-white/35" style={{ left: `${ms / durationMs * 100}%` }}><span className="absolute bottom-2 left-1 whitespace-nowrap font-mono text-[9px] text-stone-500">{formatRulerSeconds(ms)}</span></div>)}</div>;
}

function ThumbnailTrack({ thumbnails, loading, durationMs, value, color, label, onSeek, onChange }: { thumbnails: string[]; loading: boolean; durationMs: number; value: RangeTuple; color: string; label: string; onSeek: (ms: number) => void; onChange: (value: RangeTuple) => void }) {
    const startPercent = value[0] / durationMs * 100;
    const endPercent = value[1] / durationMs * 100;
    return <div className="relative my-3 h-24 cursor-crosshair overflow-hidden rounded-md border border-white/15 bg-white/5" onPointerDown={(event) => seekFromPointer(event, durationMs, onSeek)}>
        <div className="flex size-full">{thumbnails.length ? thumbnails.map((src, index) => <img key={`${index}-${src.slice(-12)}`} src={src} alt="" draggable={false} className="h-full min-w-0 flex-1 object-cover" />) : <div className="grid w-full place-items-center text-xs text-stone-500">{loading ? "正在生成时间线缩略图…" : "暂无缩略图"}</div>}</div>
        <div className="pointer-events-none absolute inset-y-0 left-0 bg-black/75" style={{ width: `${startPercent}%` }} />
        <div className="pointer-events-none absolute inset-y-0 right-0 bg-black/75" style={{ width: `${100 - endPercent}%` }} />
        <div className="pointer-events-none absolute inset-y-0 border-y-2" style={{ left: `${startPercent}%`, width: `${endPercent - startPercent}%`, borderColor: color }} />
        <span className="pointer-events-none absolute left-2 top-2 z-20 rounded px-2 py-1 text-[10px] font-semibold text-white shadow" style={{ backgroundColor: color }}>{label}</span>
        <RangeHandle side="start" value={value} durationMs={durationMs} color={color} onChange={onChange} onSeek={onSeek} />
        <RangeHandle side="end" value={value} durationMs={durationMs} color={color} onChange={onChange} onSeek={onSeek} />
    </div>;
}

function RangeHandle({ side, value, durationMs, color, onChange, onSeek }: { side: "start" | "end"; value: RangeTuple; durationMs: number; color: string; onChange: (value: RangeTuple) => void; onSeek: (ms: number) => void }) {
    const draggingRef = useRef(false);
    const timeMs = side === "start" ? value[0] : value[1];
    return <button type="button" aria-label={side === "start" ? "拖动裁剪入点" : "拖动裁剪出点"} className="absolute inset-y-0 z-20 w-4 -translate-x-1/2 cursor-ew-resize border-x-2 shadow-[0_0_0_1px_rgba(0,0,0,.35)]" style={{ left: `${timeMs / durationMs * 100}%`, backgroundColor: `${color}55`, borderColor: color }} onPointerDown={(event) => { event.preventDefault(); event.stopPropagation(); draggingRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!draggingRef.current) return; const parent = event.currentTarget.parentElement; if (!parent) return; const rect = parent.getBoundingClientRect(); const nextMs = Math.max(0, Math.min(durationMs, (event.clientX - rect.left) / rect.width * durationMs)); const next = side === "start" ? normalizeRange(nextMs, value[1], durationMs) : normalizeRange(value[0], nextMs, durationMs); onChange(next); onSeek(side === "start" ? next[0] : next[1]); }} onPointerUp={(event) => { draggingRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }}><span className="absolute left-1/2 top-1/2 h-7 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded bg-white/80" /></button>;
}

function Playhead({ currentMs, durationMs, onSeek }: { currentMs: number; durationMs: number; onSeek: (ms: number) => void }) {
    const dragRef = useRef(false);
    return <div className="pointer-events-none absolute bottom-0 top-0 z-30" style={{ left: `${Math.max(0, Math.min(1, currentMs / durationMs)) * 100}%` }}><div className="pointer-events-auto absolute -left-2 top-0 size-4 cursor-ew-resize rounded-sm bg-red-500" onPointerDown={(event) => { dragRef.current = true; event.currentTarget.setPointerCapture(event.pointerId); }} onPointerMove={(event) => { if (!dragRef.current) return; const parent = event.currentTarget.parentElement?.parentElement; if (!parent) return; const rect = parent.getBoundingClientRect(); onSeek((event.clientX - rect.left) / rect.width * durationMs); }} onPointerUp={(event) => { dragRef.current = false; event.currentTarget.releasePointerCapture(event.pointerId); }} /><div className="h-full border-l border-red-500" /></div>;
}

async function generateVideoThumbnails(src: string, durationMs: number, count: number) {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    video.crossOrigin = "anonymous";
    video.src = src;
    await waitForEvent(video, "loadedmetadata", 12_000);
    const canvas = document.createElement("canvas");
    canvas.width = 180;
    canvas.height = 102;
    const context = canvas.getContext("2d");
    if (!context) return [];
    const result: string[] = [];
    for (let index = 0; index < count; index += 1) {
        const atMs = Math.min(durationMs - 1, (index + 0.5) / count * durationMs);
        video.currentTime = Math.max(0, atMs / 1000);
        await waitForEvent(video, "seeked", 8_000);
        context.fillStyle = "#000";
        context.fillRect(0, 0, canvas.width, canvas.height);
        const sourceRatio = video.videoWidth / Math.max(1, video.videoHeight);
        const targetRatio = canvas.width / canvas.height;
        const drawWidth = sourceRatio > targetRatio ? canvas.width : canvas.height * sourceRatio;
        const drawHeight = sourceRatio > targetRatio ? canvas.width / sourceRatio : canvas.height;
        context.drawImage(video, (canvas.width - drawWidth) / 2, (canvas.height - drawHeight) / 2, drawWidth, drawHeight);
        result.push(canvas.toDataURL("image/jpeg", 0.72));
    }
    video.removeAttribute("src");
    video.load();
    return result;
}

function waitForEvent(target: HTMLMediaElement, event: string, timeoutMs: number) {
    return new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => { cleanup(); reject(new Error(`等待视频 ${event} 超时`)); }, timeoutMs);
        const done = () => { cleanup(); resolve(); };
        const failed = () => { cleanup(); reject(new Error("视频解码失败")); };
        const cleanup = () => { window.clearTimeout(timeout); target.removeEventListener(event, done); target.removeEventListener("error", failed); };
        target.addEventListener(event, done, { once: true });
        target.addEventListener("error", failed, { once: true });
    });
}

function seekFromPointer(event: React.PointerEvent<HTMLElement>, durationMs: number, onSeek: (ms: number) => void) {
    const rect = event.currentTarget.getBoundingClientRect();
    onSeek(Math.max(0, Math.min(durationMs, (event.clientX - rect.left) / rect.width * durationMs)));
}

function buildTicks(durationMs: number, pixelsPerSecond: number) {
    const desiredSeconds = 80 / pixelsPerSecond;
    const steps = [0.5, 1, 2, 5, 10, 15, 30, 60, 120, 300];
    const step = steps.find((value) => value >= desiredSeconds) || 300;
    const result: number[] = [];
    for (let ms = 0; ms <= durationMs; ms += step * 1000) result.push(ms);
    return result;
}

function normalizeRange(start: number, end: number, duration: number, min = 0, max = duration): RangeTuple {
    const safeMax = Math.max(min + 1, max);
    const safeStart = Math.max(min, Math.min(Math.round(start), safeMax - 1));
    const safeEnd = Math.max(safeStart + 1, Math.min(Math.round(end), safeMax));
    return [safeStart, safeEnd];
}

function formatSeconds(ms: number) {
    return `${(Math.max(0, ms) / 1000).toFixed(3)} 秒`;
}

function formatRulerSeconds(ms: number) {
    return `${Number((Math.max(0, ms) / 1000).toFixed(3))}秒`;
}
