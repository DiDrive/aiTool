import {t} from "../../lang";

import LongTextTts from "./LongTextTts/LongTextTts.vue";
import SubtitleTts from "./SubtitleTts/SubtitleTts.vue";
import SoundReplace from "./SoundReplace/SoundReplace.vue";
import CloudAudio from "../Cloud/CloudAudio.vue";
import CloudVoiceClone from "../Cloud/CloudVoiceClone.vue";

import VideoGenFlow from "./VideoGenFlow/VideoGenFlow.vue";
import CloudVideo from "../Cloud/CloudVideo.vue";
import CloudLipSync from "../Cloud/CloudLipSync.vue";
import CloudDigitalHuman from "../Cloud/CloudDigitalHuman.vue";

import LongTextTtsIcon from "./LongTextTts/assets/icon.svg";
import SubtitleTtsIcon from "./SubtitleTts/assets/icon.svg";
import SoundReplaceIcon from "./SoundReplace/assets/icon.svg";

import VideoGenFlowIcon from "./VideoGenFlow/assets/icon.svg";
import CloudImage from "../Cloud/CloudImage.vue";
import TextToImageIcon from "./TextToImage/assets/icon.svg";

import FeedbackIcon from "./../../assets/image/feedback.svg";

export const SoundApps = [
    {
        name: "LongTextTts",
        title: t("task.longTextToAudio"),
        description: t("desc.longTextToAudio"),
        icon: LongTextTtsIcon,
        component: LongTextTts,
    },
    {
        name: "SubtitleTts",
        title: t("task.subtitleToAudio"),
        description: t("desc.subtitleToAudio"),
        icon: SubtitleTtsIcon,
        component: SubtitleTts,
    },
    {
        name: "SoundReplace",
        title: t("voice.replace"),
        description: t("desc.videoVoiceReplace"),
        icon: SoundReplaceIcon,
        component: SoundReplace,
    },
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
        name: "VideoGenFlow",
        title: t("avatar.oneClickSynthesis"),
        description: t("intro.textToVideo"),
        icon: VideoGenFlowIcon,
        component: VideoGenFlow,
    },
    {
        name: "CloudVideo",
        title: "云端生视频",
        description: "按模板提交云端视频生成任务",
        icon: VideoGenFlowIcon,
        component: CloudVideo,
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
];

export const ToolApps = [
    {
        name: "CloudImage",
        title: "云端生图",
        description: "按模板提交云端生图任务",
        icon: TextToImageIcon,
        component: CloudImage,
    },
];

export const ImageApps = ToolApps;

export const AllApps = [
    ...(SoundApps.map(app => ({
        ...app,
        url: `/sound?tab=${app.name}`,
    })) as any),
    ...(VideoApps.map(app => ({
        ...app,
        url: `/video?tab=${app.name}`,
    })) as any),
    ...(ToolApps.map(app => ({
        ...app,
        url: `/tool?tab=${app.name}`,
    })) as any),
    {
        title: t("feedback.toolRequest"),
        description: t("msg.moreTools"),
        icon: FeedbackIcon,
        url: "https://aigcpanel.com/wish",
    },
];
