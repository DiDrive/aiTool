"use client";

import { useEffect, useMemo, useState } from "react";
import { Button, Image as AntImage, Input, Modal } from "antd";
import { Boxes, Clapperboard, Image as ImageIcon, Link2, Plus, RefreshCw, Sparkles, Trash2, Unlink, Upload, Users } from "lucide-react";
import { nanoid } from "nanoid";

import { canvasThemes } from "@/lib/canvas-theme";
import { useThemeStore } from "@/stores/use-theme-store";
import { CanvasNodeType, type CanvasNodeData, type CanvasScriptScene, type CanvasStoryboardExtraAsset, type CanvasStoryboardShot } from "../types";
import { formatScriptScenes, formatStoryboardShots, isValidScriptScenes, isValidStoryboardShots, normalizeScriptScene, normalizeStoryboardShot, parseScriptScenes, parseStoryboardShots } from "../utils/canvas-workflow-structure";

type AssetKind = "character" | "scene" | "prop" | "storyboard";
type AssetPickerTarget = { shotId: string; kind: AssetKind; name: string; value?: string; extraAssetId?: string };

type Props = {
    node: CanvasNodeData | null;
    nodes: CanvasNodeData[];
    onClose: () => void;
    onMetadataChange: (nodeId: string, patch: Partial<NonNullable<CanvasNodeData["metadata"]>>) => void;
    onRegenerate: (node: CanvasNodeData) => void;
    onStructureRaw: (node: CanvasNodeData) => void;
    onCreateStoryboardScript: (node: CanvasNodeData) => void;
    onAdaptScript: (node: CanvasNodeData, requirement: string, mode: "structure" | "rhythm" | "story") => void;
    onGenerateAssets: (node: CanvasNodeData, shotIds: string[]) => void;
    onGenerateStoryboards: (node: CanvasNodeData, shotIds: string[]) => void;
    onGenerateVideos: (node: CanvasNodeData, shotIds: string[]) => void;
    onBindAsset: (node: CanvasNodeData, shotId: string, kind: AssetKind, name: string, assetNodeId: string) => void;
};

export function CanvasWorkflowDetailModal({ node, nodes, onClose, onMetadataChange, onRegenerate, onStructureRaw, onCreateStoryboardScript, onAdaptScript, onGenerateAssets, onGenerateStoryboards, onGenerateVideos, onBindAsset }: Props) {
    const theme = canvasThemes[useThemeStore((state) => state.theme)];
    const [selectedShotIds, setSelectedShotIds] = useState<string[]>([]);
    const [assetPickerTarget, setAssetPickerTarget] = useState<AssetPickerTarget | null>(null);
    const [extraAssetShotId, setExtraAssetShotId] = useState<string | null>(null);
    const [extraAssetKind, setExtraAssetKind] = useState<CanvasStoryboardExtraAsset["kind"]>("reference");
    const [extraAssetName, setExtraAssetName] = useState("");
    const [adaptationOpen, setAdaptationOpen] = useState(false);
    const [adaptationRequirement, setAdaptationRequirement] = useState("");
    const [adaptationMode, setAdaptationMode] = useState<"structure" | "rhythm" | "story">("rhythm");
    const kind = node?.metadata?.workflowKind;
    const isScript = kind === "script";
    const isStoryboard = kind === "storyboard_script";
    const scenes = node?.metadata?.scriptScenes?.length ? node.metadata.scriptScenes : node?.metadata?.status === "loading" ? [] : parseScriptScenes(node?.metadata?.content || "");
    const shots = node?.metadata?.storyboardShots?.length ? node.metadata.storyboardShots : node?.metadata?.status === "loading" ? [] : parseStoryboardShots(node?.metadata?.content || "");
    const structureValid = node?.metadata?.workflowStructureValid === false ? false : isScript ? isValidScriptScenes(scenes) : isValidStoryboardShots(shots);
    const rawText = node?.metadata?.workflowRawText || node?.metadata?.content || "";
    const mediaNodes = useMemo(() => nodes.filter((item) => (item.type === CanvasNodeType.Image || item.type === CanvasNodeType.Panorama) && item.id !== node?.id), [node?.id, nodes]);

    useEffect(() => {
        setSelectedShotIds([]);
        setAssetPickerTarget(null);
        setExtraAssetShotId(null);
        setAdaptationOpen(false);
        setAdaptationRequirement("");
        setAdaptationMode("rhythm");
        if (node?.metadata?.workflowKind === "storyboard_script" && node.metadata.storyboardShots?.length) {
            const deduplicatedShots = node.metadata.storyboardShots.map(deduplicateShotAssets);
            onMetadataChange(node.id, { storyboardShots: deduplicatedShots, content: formatStoryboardShots(deduplicatedShots) });
        }
    }, [node?.id]);

    if (!node || (!isScript && !isStoryboard)) return null;

    const updateScenes = (next: CanvasScriptScene[]) => onMetadataChange(node.id, { scriptScenes: next, content: formatScriptScenes(next), workflowStructureValid: true, workflowRawText: undefined });
    const updateShots = (next: CanvasStoryboardShot[]) => onMetadataChange(node.id, { storyboardShots: next, content: formatStoryboardShots(next), workflowStructureValid: true, workflowRawText: undefined });
    const targetShotIds = selectedShotIds.length ? selectedShotIds : shots.map((shot) => shot.id);
    const allTargetsReady = targetShotIds.length > 0 && targetShotIds.every((shotId) => !missingShotAssets(shots.find((shot) => shot.id === shotId), nodes).length);
    const bindTargetAsset = (target: AssetPickerTarget, assetNodeId: string) => {
        if (target.extraAssetId) {
            updateShots(shots.map((shot) => shot.id !== target.shotId ? shot : { ...shot, extraAssets: (shot.extraAssets || []).map((asset) => asset.id === target.extraAssetId ? { ...asset, nodeId: assetNodeId || undefined } : asset) }));
        } else {
            onBindAsset(node, target.shotId, target.kind, target.name, assetNodeId);
        }
    };
    const bindPickerAsset = (assetNodeId: string) => {
        if (!assetPickerTarget) return;
        bindTargetAsset(assetPickerTarget, assetNodeId);
        setAssetPickerTarget(null);
    };
    const addExtraAsset = () => {
        const name = extraAssetName.trim();
        if (!extraAssetShotId || !name) return;
        const extraAsset: CanvasStoryboardExtraAsset = { id: nanoid(), kind: extraAssetKind, name };
        updateShots(shots.map((shot) => shot.id === extraAssetShotId ? { ...shot, extraAssets: [...(shot.extraAssets || []), extraAsset] } : shot));
        setExtraAssetShotId(null);
        setExtraAssetName("");
        setAssetPickerTarget({ shotId: extraAssetShotId, kind: "storyboard", name, extraAssetId: extraAsset.id });
    };

    return (
        <>
        <Modal
            open
            centered
            footer={null}
            width="calc(100vw - 48px)"
            styles={{ body: { height: "calc(100vh - 112px)", overflow: "hidden", padding: 0 } }}
            title={<div className="flex items-center gap-2"><Sparkles className="size-4 text-blue-500" />{isScript ? "剧本详情" : "分镜脚本与素材检查"}</div>}
            onCancel={onClose}
        >
            <div className="flex h-full flex-col" style={{ color: theme.node.text }}>
                <div className="flex flex-wrap items-center gap-2 border-b px-4 py-3" style={{ borderColor: theme.node.stroke }}>
                    <Button icon={<RefreshCw className="size-4" />} onClick={() => onRegenerate(node)}>AI 重新生成</Button>
                    {!structureValid && rawText ? <Button type="primary" icon={<Sparkles className="size-4" />} onClick={() => onStructureRaw(node)}>AI 结构化原文</Button> : null}
                    {isScript ? (
                        <>
                            <Button disabled={!structureValid} icon={<Sparkles className="size-4" />} onClick={() => setAdaptationOpen(true)}>AI 改编</Button>
                            <Button type="primary" disabled={!structureValid} icon={<Clapperboard className="size-4" />} onClick={() => onCreateStoryboardScript(node)}>生成分镜脚本</Button>
                        </>
                    ) : (
                        <>
                            <Button disabled={!structureValid} icon={<Users className="size-4" />} onClick={() => onGenerateAssets(node, targetShotIds)}>补全人物/场景/道具</Button>
                            <Button disabled={!structureValid} icon={<ImageIcon className="size-4" />} onClick={() => onGenerateStoryboards(node, targetShotIds)}>生成分镜图</Button>
                            <Button type="primary" disabled={!allTargetsReady} icon={<Clapperboard className="size-4" />} onClick={() => onGenerateVideos(node, targetShotIds)}>生成视频</Button>
                            <span className="text-xs opacity-60">{selectedShotIds.length ? `已选 ${selectedShotIds.length} 个镜头` : "未勾选时操作全部镜头"}</span>
                        </>
                    )}
                </div>
                <div className="thin-scrollbar min-h-0 flex-1 overflow-auto p-4">
                    {!structureValid && rawText ? (
                        <RawWorkflowContent value={rawText} label={isScript ? "当前剧本原文（尚未结构化）" : "当前分镜原文（尚未结构化）"} onChange={(value) => onMetadataChange(node.id, { content: value, workflowRawText: value, workflowStructureValid: false })} />
                    ) : isScript ? <ScriptTable rows={scenes} onChange={updateScenes} /> : <StoryboardTable rows={shots} nodes={nodes} mediaNodes={mediaNodes} selectedIds={selectedShotIds} onSelectedIdsChange={setSelectedShotIds} onChange={updateShots} onGenerateAssets={(shotId) => onGenerateAssets(node, [shotId])} onGenerateStoryboard={(shotId) => onGenerateStoryboards(node, [shotId])} onGenerateVideo={(shotId) => onGenerateVideos(node, [shotId])} onChooseAsset={setAssetPickerTarget} onClearAsset={(target) => bindTargetAsset(target, "")} onAddExtraAsset={(shotId) => { setExtraAssetShotId(shotId); setExtraAssetKind("reference"); setExtraAssetName(""); }} onRemoveBaseAsset={(shotId, assetKind, name) => updateShots(shots.map((shot) => shot.id !== shotId ? shot : removeBaseShotAsset(shot, assetKind, name)))} onRemoveExtraAsset={(shotId, extraAssetId) => updateShots(shots.map((shot) => shot.id === shotId ? { ...shot, extraAssets: (shot.extraAssets || []).filter((asset) => asset.id !== extraAssetId) } : shot))} />}
                </div>
            </div>
        </Modal>
        <Modal
            open={adaptationOpen}
            centered
            title="AI 改编剧情"
            okText="生成改编版本"
            cancelText="取消"
            okButtonProps={{ disabled: !adaptationRequirement.trim() }}
            onCancel={() => setAdaptationOpen(false)}
            onOk={() => {
                const requirement = adaptationRequirement.trim();
                if (!requirement) return;
                onAdaptScript(node, requirement, adaptationMode);
                setAdaptationOpen(false);
                setAdaptationRequirement("");
            }}
        >
            <div className="space-y-3">
                <p className="text-sm opacity-70">原倒推剧本会保留，AI 将按你的要求生成一个独立的新剧本节点。</p>
                <div className="grid grid-cols-3 gap-2">
                    {([
                        ["structure", "结构复刻", "锁定切镜和时长"],
                        ["rhythm", "节奏复刻", "保留节奏，允许微调"],
                        ["story", "剧情优先", "梗概优先重排镜头"],
                    ] as const).map(([value, label, description]) => (
                        <button key={value} type="button" className={`rounded-lg border p-2 text-left text-xs transition ${adaptationMode === value ? "border-blue-500 bg-blue-500/10" : "border-black/10 dark:border-white/10"}`} onClick={() => setAdaptationMode(value)}>
                            <span className="block font-semibold">{label}</span><span className="mt-1 block opacity-60">{description}</span>
                        </button>
                    ))}
                </div>
                <Input.TextArea
                    autoFocus
                    rows={6}
                    value={adaptationRequirement}
                    placeholder="例如：把背景改为民国上海，保留核心冲突；女主改为侦探；结局更有反转；总时长控制在 60 秒。"
                    onChange={(event) => setAdaptationRequirement(event.target.value)}
                />
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-black/10 px-3 py-2 text-sm transition hover:border-blue-500 dark:border-white/10">
                    <Upload className="size-4" />上传剧情梗概（TXT / Markdown）
                    <input
                        className="hidden"
                        type="file"
                        accept=".txt,.md,text/plain,text/markdown"
                        onChange={(event) => {
                            const file = event.currentTarget.files?.[0];
                            if (!file) return;
                            void file.text().then((text) => setAdaptationRequirement(text.trim()));
                            event.currentTarget.value = "";
                        }}
                    />
                </label>
            </div>
        </Modal>
        <AssetPickerModal target={assetPickerTarget} options={mediaNodes} onClose={() => setAssetPickerTarget(null)} onSelect={bindPickerAsset} />
        <Modal open={Boolean(extraAssetShotId)} title="手动增加素材" okText="添加并选择素材" cancelText="取消" okButtonProps={{ disabled: !extraAssetName.trim() }} onOk={addExtraAsset} onCancel={() => setExtraAssetShotId(null)}>
            <div className="space-y-4 py-2">
                <label className="block text-sm"><span className="mb-1 block opacity-70">素材类型</span><select className="h-10 w-full rounded-lg border border-black/15 bg-transparent px-3 dark:border-white/15" value={extraAssetKind} onChange={(event) => setExtraAssetKind(event.target.value as CanvasStoryboardExtraAsset["kind"])}><option value="character">人物参考</option><option value="scene">场景参考</option><option value="prop">道具参考</option><option value="reference">其他参考</option></select></label>
                <label className="block text-sm"><span className="mb-1 block opacity-70">素材名称</span><input autoFocus className="h-10 w-full rounded-lg border border-black/15 bg-transparent px-3 outline-none focus:border-blue-500 dark:border-white/15" placeholder="例如：女主角冬季服装、夜景街道、品牌标志" value={extraAssetName} onChange={(event) => setExtraAssetName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") addExtraAsset(); }} /></label>
                <div className="text-xs opacity-60">添加后将打开可视化素材选择器。该素材会参与当前镜头的缺失检查和后续生成。</div>
            </div>
        </Modal>
        </>
    );
}

function RawWorkflowContent({ value, label, onChange }: { value: string; label: string; onChange: (value: string) => void }) {
    return <div className="flex min-h-[560px] flex-col rounded-xl border border-amber-400/40 bg-amber-400/5 p-4"><div className="mb-3 text-sm font-semibold text-amber-600">{label}</div><div className="mb-3 text-xs opacity-65">模型返回的内容未匹配场次/镜头字段，因此先完整保留原文，不再错误拆表。点击上方“AI 结构化原文”后再进入表格。</div><textarea className="thin-scrollbar min-h-0 flex-1 resize-none rounded-lg border border-black/10 bg-transparent p-4 font-mono text-sm leading-7 outline-none dark:border-white/10" value={value} onChange={(event) => onChange(event.target.value)} /></div>;
}

function ScriptTable({ rows, onChange }: { rows: CanvasScriptScene[]; onChange: (rows: CanvasScriptScene[]) => void }) {
    const update = (index: number, patch: Partial<CanvasScriptScene>) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    return (
        <div className="min-w-[1180px] overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            <div className="grid grid-cols-[72px_150px_90px_180px_2fr_2fr_80px_44px] bg-black/5 px-2 py-2 text-xs font-semibold dark:bg-white/5"><span>场次</span><span>场景</span><span>时间</span><span>人物</span><span>动作/剧情</span><span>对白/旁白</span><span>时长</span><span /></div>
            {rows.map((row, index) => (
                <div key={row.id} className="grid grid-cols-[72px_150px_90px_180px_2fr_2fr_80px_44px] items-stretch border-t border-black/10 p-2 text-xs dark:border-white/10">
                    <Cell value={row.sceneNumber} onChange={(value) => update(index, { sceneNumber: value })} />
                    <Cell value={row.location} onChange={(value) => update(index, { location: value })} />
                    <Cell value={row.timeOfDay} onChange={(value) => update(index, { timeOfDay: value })} />
                    <Cell value={row.characters.join("、")} onChange={(value) => update(index, { characters: splitList(value) })} />
                    <Cell value={row.action} multiline onChange={(value) => update(index, { action: value })} />
                    <Cell value={row.dialogue} multiline onChange={(value) => update(index, { dialogue: value })} />
                    <Cell value={String(row.durationSeconds)} onChange={(value) => update(index, { durationSeconds: Math.max(1, Number(value) || 1) })} />
                    <button className="grid place-items-center text-red-400" onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))}><Trash2 className="size-4" /></button>
                </div>
            ))}
            <button className="flex w-full items-center justify-center gap-1 border-t border-black/10 py-3 text-xs text-blue-500 dark:border-white/10" onClick={() => onChange([...rows, normalizeScriptScene({}, rows.length)])}><Plus className="size-4" />添加场次</button>
        </div>
    );
}

function StoryboardTable({ rows, nodes, mediaNodes, selectedIds, onSelectedIdsChange, onChange, onGenerateAssets, onGenerateStoryboard, onGenerateVideo, onChooseAsset, onClearAsset, onAddExtraAsset, onRemoveBaseAsset, onRemoveExtraAsset }: { rows: CanvasStoryboardShot[]; nodes: CanvasNodeData[]; mediaNodes: CanvasNodeData[]; selectedIds: string[]; onSelectedIdsChange: (ids: string[]) => void; onChange: (rows: CanvasStoryboardShot[]) => void; onGenerateAssets: (shotId: string) => void; onGenerateStoryboard: (shotId: string) => void; onGenerateVideo: (shotId: string) => void; onChooseAsset: (target: AssetPickerTarget) => void; onClearAsset: (target: AssetPickerTarget) => void; onAddExtraAsset: (shotId: string) => void; onRemoveBaseAsset: (shotId: string, kind: "character" | "scene" | "prop", name: string) => void; onRemoveExtraAsset: (shotId: string, extraAssetId: string) => void }) {
    const update = (index: number, patch: Partial<CanvasStoryboardShot>) => onChange(rows.map((row, rowIndex) => rowIndex === index ? { ...row, ...patch } : row));
    const toggle = (id: string) => onSelectedIdsChange(selectedIds.includes(id) ? selectedIds.filter((item) => item !== id) : [...selectedIds, id]);
    return (
        <div className="min-w-[1990px] overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
            <div className="grid grid-cols-[42px_58px_68px_90px_130px_130px_130px_240px_170px_130px_180px_440px_220px] bg-black/5 px-2 py-2 text-xs font-semibold dark:bg-white/5"><span /><span>镜号</span><span>时长</span><span>景别</span><span>场景</span><span>人物</span><span>道具</span><span>画面/动作</span><span>运镜/光线</span><span>对白/声音</span><span>连续性</span><span>素材预览与绑定</span><span>操作</span></div>
            {rows.map((row, index) => {
                const missing = missingShotAssets(row, nodes);
                return (
                    <div key={row.id} className="grid grid-cols-[42px_58px_68px_90px_130px_130px_130px_240px_170px_130px_180px_440px_220px] items-stretch border-t border-black/10 p-2 text-xs dark:border-white/10">
                        <label className="grid place-items-center"><input type="checkbox" checked={selectedIds.includes(row.id)} onChange={() => toggle(row.id)} /></label>
                        <Cell value={row.shotNumber} onChange={(value) => update(index, { shotNumber: value })} />
                        <Cell value={String(row.durationSeconds)} onChange={(value) => update(index, { durationSeconds: Math.max(1, Number(value) || 1) })} />
                        <Cell value={row.shotSize} onChange={(value) => update(index, { shotSize: value })} />
                        <Cell value={row.scene} onChange={(value) => update(index, { scene: value })} />
                        <Cell value={row.characters.join("、")} onChange={(value) => update(index, { characters: splitList(value) })} />
                        <Cell value={row.props.join("、")} onChange={(value) => update(index, { props: splitList(value) })} />
                        <Cell value={[row.visual, row.action].filter(Boolean).join("\n")} multiline onChange={(value) => update(index, { visual: value, action: "" })} />
                        <Cell value={[row.camera, row.lighting].filter(Boolean).join("\n")} multiline onChange={(value) => update(index, { camera: value, lighting: "" })} />
                        <Cell value={[row.dialogue, row.sound].filter(Boolean).join("\n")} multiline onChange={(value) => update(index, { dialogue: value, sound: "" })} />
                        <Cell value={row.continuity} multiline onChange={(value) => update(index, { continuity: value })} />
                        <div className="space-y-2 px-1">
                            {row.characters.map((name) => { const target = { shotId: row.id, kind: "character" as const, name, value: row.assetNodeIds?.characters?.[name] }; return <AssetBindingCard key={`character-${name}`} label={`人物：${name}`} value={target.value} options={mediaNodes} removable onChoose={() => onChooseAsset(target)} onClear={() => onClearAsset(target)} onRemove={() => onRemoveBaseAsset(row.id, "character", name)} />; })}
                            {row.scene ? (() => { const target = { shotId: row.id, kind: "scene" as const, name: row.scene, value: row.assetNodeIds?.scene }; return <AssetBindingCard label={`场景：${row.scene}`} value={target.value} options={mediaNodes} removable onChoose={() => onChooseAsset(target)} onClear={() => onClearAsset(target)} onRemove={() => onRemoveBaseAsset(row.id, "scene", row.scene)} />; })() : null}
                            {row.props.map((name) => { const target = { shotId: row.id, kind: "prop" as const, name, value: row.assetNodeIds?.props?.[name] }; return <AssetBindingCard key={`prop-${name}`} label={`道具：${name}`} value={target.value} options={mediaNodes} removable onChoose={() => onChooseAsset(target)} onClear={() => onClearAsset(target)} onRemove={() => onRemoveBaseAsset(row.id, "prop", name)} />; })}
                            {(() => { const target = { shotId: row.id, kind: "storyboard" as const, name: "分镜图", value: row.assetNodeIds?.storyboard }; return <AssetBindingCard label="分镜图" value={target.value} options={mediaNodes} onChoose={() => onChooseAsset(target)} onClear={() => onClearAsset(target)} />; })()}
                            {(row.extraAssets || []).map((asset) => { const target = { shotId: row.id, kind: "storyboard" as const, name: asset.name, value: asset.nodeId, extraAssetId: asset.id }; return <AssetBindingCard key={asset.id} label={`${extraAssetKindLabel(asset.kind)}：${asset.name}`} value={asset.nodeId} options={mediaNodes} removable onChoose={() => onChooseAsset(target)} onClear={() => onClearAsset(target)} onRemove={() => onRemoveExtraAsset(row.id, asset.id)} />; })}
                            <Button block size="small" icon={<Plus className="size-3" />} onClick={() => onAddExtraAsset(row.id)}>手动增加素材</Button>
                            <div className={missing.length ? "text-red-400" : "text-emerald-500"}>{missing.length ? `缺失：${missing.join("、")}` : "素材齐全，可生成视频"}</div>
                        </div>
                        <div className="flex flex-wrap content-start gap-1 px-1">
                            <Button size="small" icon={<Boxes className="size-3" />} onClick={() => onGenerateAssets(row.id)}>补素材</Button>
                            <Button size="small" icon={<ImageIcon className="size-3" />} onClick={() => onGenerateStoryboard(row.id)}>分镜图</Button>
                            <Button size="small" type="primary" disabled={missing.length > 0} icon={<Clapperboard className="size-3" />} onClick={() => onGenerateVideo(row.id)}>视频</Button>
                            <Button size="small" danger icon={<Trash2 className="size-3" />} onClick={() => onChange(rows.filter((_, rowIndex) => rowIndex !== index))} />
                        </div>
                    </div>
                );
            })}
            <button className="flex w-full items-center justify-center gap-1 border-t border-black/10 py-3 text-xs text-blue-500 dark:border-white/10" onClick={() => onChange([...rows, normalizeStoryboardShot({}, rows.length)])}><Plus className="size-4" />添加镜头</button>
        </div>
    );
}

function AssetBindingCard({ label, value, options, removable = false, onChoose, onClear, onRemove }: { label: string; value?: string; options: CanvasNodeData[]; removable?: boolean; onChoose: () => void; onClear: () => void; onRemove?: () => void }) {
    const selected = options.find((node) => node.id === value);
    const previewUrl = selected?.metadata?.content || "";
    const status = selected ? selected.metadata?.status === "loading" ? "生成中" : previewUrl ? "已就绪" : "暂无图片" : "未绑定";
    return (
        <div className="flex min-h-16 items-center gap-2 rounded-lg border border-black/10 bg-black/[0.02] p-2 dark:border-white/10 dark:bg-white/[0.03]">
            <div className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-black/5 dark:bg-white/5">
                {previewUrl ? <AntImage src={previewUrl} alt={selected?.title || label} width={48} height={48} className="object-cover" preview={{ mask: <span className="text-[10px]">预览</span> }} /> : <ImageIcon className="size-5 opacity-35" />}
            </div>
            <div className="min-w-0 flex-1">
                <div className="truncate text-[11px] opacity-65" title={label}>{label}</div>
                <div className="truncate font-medium" title={selected?.title || "未绑定"}>{selected?.title || "未绑定"}</div>
                <div className={previewUrl ? "text-[10px] text-emerald-500" : "text-[10px] text-amber-500"}>{status}</div>
            </div>
            <div className="flex shrink-0 flex-col gap-1">
                <Button size="small" icon={<Link2 className="size-3" />} onClick={onChoose}>{selected ? "更换" : "选择"}</Button>
                {selected ? <Button size="small" icon={<Unlink className="size-3" />} onClick={onClear}>解绑</Button> : null}
                {removable && onRemove ? <Button size="small" danger icon={<Trash2 className="size-3" />} onClick={onRemove}>移除</Button> : null}
            </div>
        </div>
    );
}

function AssetPickerModal({ target, options, onClose, onSelect }: { target: AssetPickerTarget | null; options: CanvasNodeData[]; onClose: () => void; onSelect: (nodeId: string) => void }) {
    return (
        <Modal open={Boolean(target)} width={900} footer={null} title={target ? `选择素材 · ${target.name}` : "选择素材"} onCancel={onClose}>
            <div className="mb-3 text-xs opacity-60">从当前画布已有图片中选择。缩略图可直接确认内容，名称用于区分不同版本。</div>
            {options.length ? <div className="grid max-h-[60vh] grid-cols-3 gap-3 overflow-auto pr-1 sm:grid-cols-4">
                {options.map((node) => {
                    const previewUrl = node.metadata?.content || "";
                    const selected = node.id === target?.value;
                    return <button key={node.id} type="button" className={`overflow-hidden rounded-xl border-2 text-left transition ${selected ? "border-blue-500 bg-blue-500/5" : "border-black/10 hover:border-blue-400 dark:border-white/10"}`} onClick={() => onSelect(node.id)}>
                        <div className="aspect-[4/3] w-full overflow-hidden bg-black/5 dark:bg-white/5">{previewUrl ? <img src={previewUrl} alt={node.title} className="size-full object-cover" /> : <span className="grid size-full place-items-center"><ImageIcon className="size-8 opacity-30" /></span>}</div>
                        <div className="p-2"><div className="truncate text-sm font-medium" title={node.title}>{node.title}</div><div className={previewUrl ? "text-[11px] text-emerald-500" : "text-[11px] text-amber-500"}>{node.metadata?.status === "loading" ? "生成中" : previewUrl ? "已就绪" : "暂无图片"}</div></div>
                    </button>;
                })}
            </div> : <div className="grid min-h-56 place-items-center rounded-xl border border-dashed border-black/15 text-sm opacity-55 dark:border-white/15">画布中还没有图片素材，请先上传或生成素材</div>}
        </Modal>
    );
}

function extraAssetKindLabel(kind: CanvasStoryboardExtraAsset["kind"]) {
    return kind === "character" ? "额外人物" : kind === "scene" ? "额外场景" : kind === "prop" ? "额外道具" : "额外参考";
}

function deduplicateShotAssets(shot: CanvasStoryboardShot): CanvasStoryboardShot {
    return { ...shot, characters: uniqueAssetNames(shot.characters), props: uniqueAssetNames(shot.props) };
}

function uniqueAssetNames(values: string[]) {
    const seen = new Set<string>();
    return values.filter((value) => {
        const key = value.trim().toLocaleLowerCase();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
    });
}

function removeBaseShotAsset(shot: CanvasStoryboardShot, kind: "character" | "scene" | "prop", name: string): CanvasStoryboardShot {
    const assetNodeIds = { ...shot.assetNodeIds };
    if (kind === "character") {
        const characters = { ...assetNodeIds.characters };
        delete characters[name];
        return { ...shot, characters: shot.characters.filter((item) => item !== name), assetNodeIds: { ...assetNodeIds, characters } };
    }
    if (kind === "prop") {
        const props = { ...assetNodeIds.props };
        delete props[name];
        return { ...shot, props: shot.props.filter((item) => item !== name), assetNodeIds: { ...assetNodeIds, props } };
    }
    return { ...shot, scene: "", assetNodeIds: { ...assetNodeIds, scene: undefined } };
}

function Cell({ value, onChange, multiline = false }: { value: string; onChange: (value: string) => void; multiline?: boolean }) {
    const className = "m-0 min-h-9 w-full resize-none border-0 bg-transparent px-1.5 py-1 text-xs outline-none focus:bg-blue-500/5";
    const rows = Math.min(16, Math.max(4, value.split("\n").reduce((total, line) => total + Math.max(1, Math.ceil(line.length / 34)), 0)));
    return multiline ? <textarea rows={rows} className={className} value={value} onChange={(event) => onChange(event.target.value)} /> : <input className={className} value={value} onChange={(event) => onChange(event.target.value)} />;
}

export function missingShotAssets(shot: CanvasStoryboardShot | undefined, nodes: CanvasNodeData[]) {
    if (!shot) return ["镜头不存在"];
    const nodeReady = (nodeId?: string) => Boolean(nodeId && nodes.find((node) => node.id === nodeId)?.metadata?.content);
    const missing: string[] = [];
    shot.characters.forEach((name) => { if (!nodeReady(shot.assetNodeIds?.characters?.[name])) missing.push(`人物 ${name}`); });
    if (shot.scene && !nodeReady(shot.assetNodeIds?.scene)) missing.push(`场景 ${shot.scene}`);
    shot.props.forEach((name) => { if (!nodeReady(shot.assetNodeIds?.props?.[name])) missing.push(`道具 ${name}`); });
    if (!nodeReady(shot.assetNodeIds?.storyboard)) missing.push("分镜图");
    (shot.extraAssets || []).forEach((asset) => { if (!nodeReady(asset.nodeId)) missing.push(`${extraAssetKindLabel(asset.kind)} ${asset.name}`); });
    return missing;
}

function splitList(value: string) {
    return value.split(/[、,，/]/).map((item) => item.trim()).filter(Boolean);
}
