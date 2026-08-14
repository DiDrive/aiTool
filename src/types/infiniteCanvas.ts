export type InfiniteCanvasMode = "external" | "bundled";

export type InfiniteCanvasStatus = {
    mode: InfiniteCanvasMode;
    configuredUrl: string;
    url: string;
    running: boolean;
    installed: boolean;
    starting: boolean;
    bundleRoot: string;
    message?: string;
    version?: string;
    credentials?: {
        username: string;
        password: string;
    };
};
