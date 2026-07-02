import packageJson from "../package.json";

const BASE_URL = "https://aigcpanel.com";

export const AppConfig = {
    name: "东风奕境AI工作台",
    title: "东风奕境AI工作台",
    slogan: "一站式AI数字人系统",
    version: packageJson.version,
    website: `${BASE_URL}`,
    apiBaseUrl: `${BASE_URL}/api`,
    updaterUrl: `${BASE_URL}/app_manager/updater/open`,
    downloadUrl: `${BASE_URL}/app_manager/download`,
    feedbackUrl: `${BASE_URL}/feedback_ticket`,
    statisticsUrl: `${BASE_URL}/app_manager/collect`,
    guideUrl: `${BASE_URL}/app_manager/guide`,
    helpUrl: `${BASE_URL}/app_manager/help`,
    serverUrl: `${BASE_URL}/aigcpanel/`,
    basic: {
        userEnable: false,
    },
};
