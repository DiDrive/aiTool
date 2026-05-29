import {nextTick} from "vue";
import {SoundReplace, SoundReplaceCleaner} from "../pages/Apps/SoundReplace/task";
import {VideoGenFlow} from "../pages/Apps/VideoGenFlow/task";
import {TaskService} from "../service/TaskService";
import {useServerStore} from "../store/modules/server";
import {useTaskStore} from "../store/modules/task";
import {SoundAsr} from "./SoundAsr";
import {SoundGenerate} from "./SoundGenerate";
import {VideoGen} from "./VideoGen";
import {SubtitleTts, SubtitleTtsCleaner} from "../pages/Apps/SubtitleTts/task";
import {LongTextTts, LongTextTtsCleaner} from "../pages/Apps/LongTextTts/task";
import {TextToImage, TextToImageCleaner} from "../pages/Apps/TextToImage/task";
import {ImageToImage, ImageToImageCleaner} from "../pages/Apps/ImageToImage/task";
import {RunningHubTask, RunningHubTaskCleaner} from "../pages/Apps/RunningHubStudio/task";

const taskStore = useTaskStore();
const serverStore = useServerStore();

export const tasks = {
    // basics
    SoundGenerate,
    SoundAsr,
    VideoGen,
    // sound apps
    LongTextTts,
    SubtitleTts,
    SoundReplace,
    // video apps
    VideoGenFlow,
    TextToImage,
    ImageToImage,
    RunningHubTask,
};

export const taskCleaners = {
    // sound cleaners
    LongTextTts: LongTextTtsCleaner,
    SubtitleTts: SubtitleTtsCleaner,
    SoundReplace: SoundReplaceCleaner,
    // video cleaners
    TextToImage: TextToImageCleaner,
    ImageToImage: ImageToImageCleaner,
    RunningHubTask: RunningHubTaskCleaner,
};

export const TaskManager = {
    init() {
        for (const k in tasks) {
            taskStore.register(k, tasks[k]);
        }
        nextTick(async () => {
            await serverStore.waitReady();
            for (const k in tasks) {
                await TaskService.restoreForTask(k as any);
            }
            for (const k in taskCleaners) {
                TaskService.registerCleaner(k as any, taskCleaners[k]);
            }
        }).then();
    },
    count() {
        return taskStore.records.length;
    },
};
