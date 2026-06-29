import CloudAudio from "../Cloud/CloudAudio.vue";
import CloudVoiceClone from "../Cloud/CloudVoiceClone.vue";

import CloudVideo from "../Cloud/CloudVideo.vue";
import MarketingVideoFlow from "./MarketingVideoFlow/MarketingVideoFlow.vue";
import CloudLipSync from "../Cloud/CloudLipSync.vue";
import CloudDigitalHuman from "../Cloud/CloudDigitalHuman.vue";
import CloudDigitalHumanClipWizard from "../Cloud/CloudDigitalHumanClipWizard.vue";
import CloudDigitalHumanClips from "../Cloud/CloudDigitalHumanClips.vue";
import CloudDigitalHumanExecConfig from "../Cloud/CloudDigitalHumanExecConfig.vue";
import CloudDigitalHumanScenePack from "../Cloud/CloudDigitalHumanScenePack.vue";

import SubtitleTtsIcon from "./SubtitleTts/assets/icon.svg";
import SoundReplaceIcon from "./SoundReplace/assets/icon.svg";

import VideoGenFlowIcon from "./VideoGenFlow/assets/icon.svg";
import CloudImage from "../Cloud/CloudImage.vue";
import ToolGptImage2 from "../Cloud/ToolGptImage2.vue";
import ToolSeedance from "../Cloud/ToolSeedance.vue";
import TextToImageIcon from "./TextToImage/assets/icon.svg";
import WatermarkInpaint from "./WatermarkInpaint/WatermarkInpaint.vue";
import WatermarkInpaintIcon from "./WatermarkInpaint/assets/icon.svg";

export const SoundApps = [
    {
        name: "CloudAudio",
        title: "云端生音频",
        description: "按模板提交云端音频生成任务",
        icon: SubtitleTtsIcon,
        component: CloudAudio,
    },
    {
        name: "CloudVoiceClone",
        title: "云端克隆音色",
        description: "按模板提交云端音色克隆任务",
        icon: SoundReplaceIcon,
        component: CloudVoiceClone,
    },
];

export const VideoApps = [
    {
        name: "MarketingVideoFlow",
        title: "营销短视频批量生成",
        description: "按品牌模板生成脚本、分镜图和视频任务",
        icon: VideoGenFlowIcon,
        component: MarketingVideoFlow,
    },
    {
        name: "CloudVideo",
        title: "云端生视频",
        description: "按模板提交云端视频生成任务",
        icon: VideoGenFlowIcon,
        component: CloudVideo,
    },
    {
        name: "ToolSeedance",
        title: "Seedance 2.0",
        description: "ExchangeToken Seedance 视频生成",
        icon: VideoGenFlowIcon,
        component: ToolSeedance,
    },
];

export const DigitalHumanApps = [
    {
        name: "CloudDigitalHumanClipWizard",
        title: "直播片段生成向导",
        description: "根据商品资料一键生成直播话术、片段草稿和触发规则",
        icon: VideoGenFlowIcon,
        component: CloudDigitalHumanClipWizard,
    },
    {
        name: "CloudLipSync",
        title: "云端对口型",
        description: "按模板提交云端对口型任务",
        icon: VideoGenFlowIcon,
        component: CloudLipSync,
    },
    {
        name: "CloudDigitalHuman",
        title: "云端普通数字人",
        description: "按模板预生成数字人视频",
        icon: VideoGenFlowIcon,
        component: CloudDigitalHuman,
    },
    {
        name: "CloudDigitalHumanClips",
        title: "数字人直播片段",
        description: "管理已保存的直播片段素材",
        icon: VideoGenFlowIcon,
        component: CloudDigitalHumanClips,
    },
    {
        name: "CloudDigitalHumanExecConfig",
        title: "直播执行配置",
        description: "绑定直播各执行位所使用的云端模板",
        icon: VideoGenFlowIcon,
        component: CloudDigitalHumanExecConfig,
    },
    {
        name: "CloudDigitalHumanScenePack",
        title: "数字人直播编排",
        description: "管理待机片、讲解片和切换方案",
        icon: VideoGenFlowIcon,
        component: CloudDigitalHumanScenePack,
    },
];

export const ImageApps = [
    {
        name: "ToolGptImage2",
        title: "GPT Image 2",
        description: "ExchangeToken OpenAI 兼容生图",
        icon: TextToImageIcon,
        component: ToolGptImage2,
    },
    {
        name: "CloudImage",
        title: "云端生图",
        description: "按模板提交云端生图任务",
        icon: TextToImageIcon,
        component: CloudImage,
    },
];

export const ToolApps = [
    {
        name: "WatermarkInpaint",
        title: "水印智能修复",
        description: "对授权图片/视频素材进行水印区域标记与智能修复",
        icon: WatermarkInpaintIcon,
        component: WatermarkInpaint,
    },
];

export const AllApps = [
    ...(SoundApps.map(app => ({
        ...app,
        url: `/sound?tab=${app.name}`,
    })) as any),
    ...(VideoApps.map(app => ({
        ...app,
        url: `/video?tab=${app.name}`,
    })) as any),
    ...(DigitalHumanApps.map(app => ({
        ...app,
        url: `/live?tab=${app.name}`,
    })) as any),
    ...(ImageApps.map(app => ({
        ...app,
        url: `/image?tab=${app.name}`,
    })) as any),
    ...(ToolApps.map(app => ({
        ...app,
        url: `/tool?tab=${app.name}`,
    })) as any),
];
