import { TaskJobResultStepStatus } from "../../../service/TaskService";

export type RunningHubCapability =
    | "image"
    | "video"
    | "lipsync"
    | "audio"
    | "voice-clone"
    | "digital-human";

export type RunningHubConnectorType = "ai-app" | "workflow" | "model-api" | "custom-api";

export type RunningHubModelConfigType = {
    capability: RunningHubCapability;
    connectorType: RunningHubConnectorType;
    providerType?: string;
    providerProfileId?: number;
    providerProfileTitle?: string;
    templateId?: number;
    templateTitle?: string;
    templateType?: string;
    baseUrl: string;
    apiKey: string;
    proxyUrl?: string;
    directFileRelay?: {
        provider?: "123pan";
        enabled?: boolean;
        clientID?: string;
        clientSecret?: string;
        parentFileID?: number | string;
        urlAuthKey?: string;
        assetMode?: boolean;
    };
    submitPath?: string;
    queryPath?: string;
    cancelPath?: string;
    webappId?: string;
    workflowId?: string;
    nodeInfoListJson?: string;
    requestBodyJson?: string;
    requestFormat?: "json" | "form-data";
    webhookUrl?: string;
    instanceType?: string;
    accessPassword?: string;
    addMetadata?: boolean;
    retainSeconds?: number | null;
    usePersonalQueue?: boolean;
    workflowJson?: string;
    saveAsVideoTemplate?: boolean;
};

export type RunningHubJobResultType = {
    step: "Prepare" | "UploadAssets" | "Submit" | "Query" | "End";
    Prepare: {
        status: TaskJobResultStepStatus;
        error?: string;
    };
    UploadAssets: {
        status: TaskJobResultStepStatus;
        error?: string;
        records?: Array<{
            source: string;
            target: string;
        }>;
    };
    Submit: {
        status: TaskJobResultStepStatus;
        error?: string;
        taskId?: string;
        clientId?: string;
        submittedBody?: Record<string, any>;
        submittedNodeInfoList?: Array<Record<string, any>>;
        requestUrl?: string;
        responseDiagnostics?: Record<string, any>;
        responsePreview?: string;
    };
    Query: {
        status: TaskJobResultStepStatus;
        error?: string;
        taskStatus?: string;
        results?: Array<{
            url?: string;
            outputType?: string;
            text?: string | null;
            fileUrl?: string;
            localFile?: string;
        }>;
        usage?: Record<string, any>;
        promptTips?: string;
    };
    End: {
        status: TaskJobResultStepStatus;
        error?: string;
        localFiles?: string[];
    };
};
