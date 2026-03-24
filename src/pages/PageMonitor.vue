<script setup lang="ts">
import {computed, onMounted, ref, watch} from "vue";
import PageWebviewStatus from "../components/common/PageWebviewStatus.vue";

const status = ref<InstanceType<typeof PageWebviewStatus> | null>(null);
const web = ref<any | null>(null);

const emit = defineEmits({
    event: (type: string, data: any) => true,
});

const webPreload = ref("");
const webUrl = ref("");
const webUserAgent =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36";
const pageTitle = ref("");
const pageDebugToolsShow = ref(false);
const pageOpenDevTools = ref(false);
const pageScript = ref("");
const pageStatusType = ref<"info" | "success" | "error">("info");
const pageStatusMsg = ref("");
const pageStatusColor = computed(() => {
    if (pageStatusType.value === "info") {
        return "#000";
    } else if (pageStatusType.value === "success") {
        return "#4caf50";
    } else if (pageStatusType.value === "error") {
        return "#f44336";
    }
    return "#000";
});

window.__page.registerCallPage("MonitorData", (resolve, reject, payload) => {
    const {type, data} = payload;
    if ("SetTitle" == type) {
        pageTitle.value = data.title;
        emit("event", "SetTitle", {title: pageTitle.value});
    } else if ("LoadUrl" == type) {
        status.value?.setStatus("loading");
        pageOpenDevTools.value = data.openDevTools;
        pageScript.value = data.script;
        webUrl.value = data.url;
        emit("event", "SetTitle", {title: pageTitle.value + " " + data.url});
    } else if ("SendMessage" == type) {
        if (web.value) {
            const text = data.text;
            const platform = data.platform || 'douyin';
            let scriptContent = '';
            
            if (platform === 'bilibili') {
                scriptContent = `
                    (function() {
                        console.log('[Monitor] Bilibili send message triggered');
                        const text = decodeURIComponent("${encodeURIComponent(text)}");
                        let input = document.querySelector('textarea.chat-input') || 
                                    document.querySelector('.chat-input.border-box') || 
                                    document.querySelector('.chat-input');
                        
                        let btn = document.querySelector('.send-btn') || 
                                  document.querySelector('.chat-send-button') || 
                                  document.querySelector('.bl-button.bl-button--primary') || 
                                  document.querySelector('.bottom-actions .bl-button');
                                  
                        if (input && btn) {
                            let nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set || 
                                                         Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                            if (nativeInputValueSetter) {
                                nativeInputValueSetter.call(input, text);
                            } else {
                                input.value = text;
                            }
                            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            input.dispatchEvent(new Event('focus', { bubbles: true }));
                            
                            setTimeout(() => {
                                btn.removeAttribute('disabled');
                                btn.click();
                                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                            }, 300);
                        }
                    })();
                `;
            } else if (platform === 'douyin') {
                scriptContent = `
                    (function() {
                        console.log('[Monitor] Douyin send message triggered');
                        const text = decodeURIComponent("${encodeURIComponent(text)}");
                        let input = document.querySelector('.webcast-chatroom___input textarea') || 
                                    document.querySelector('[data-e2e="chat-input"]') || 
                                    document.querySelector('textarea.semi-input');
                        
                        let btn = document.querySelector('.webcast-chatroom___send-btn') || 
                                  document.querySelector('[data-e2e="chat-send-btn"]') || 
                                  document.querySelector('button.semi-button-primary');
                                  
                        if (input && btn) {
                            let nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set || 
                                                         Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                            if (nativeInputValueSetter) {
                                nativeInputValueSetter.call(input, text);
                            } else {
                                input.value = text;
                            }
                            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            
                            setTimeout(() => {
                                btn.removeAttribute('disabled');
                                btn.click();
                                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                            }, 300);
                        }
                    })();
                `;
            } else if (platform === 'kuaishou') {
                scriptContent = `
                    (function() {
                        console.log('[Monitor] Kuaishou send message triggered');
                        const text = decodeURIComponent("${encodeURIComponent(text)}");
                        let input = document.querySelector('.comment-input input') || 
                                    document.querySelector('input.common-input') || 
                                    document.querySelector('.chat-input');
                        
                        let btn = document.querySelector('.send-btn') || 
                                  document.querySelector('.chat-send-btn');
                                  
                        if (input && btn) {
                            let nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                            if (nativeInputValueSetter) {
                                nativeInputValueSetter.call(input, text);
                            } else {
                                input.value = text;
                            }
                            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            
                            setTimeout(() => {
                                btn.click();
                                input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                                input.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, keyCode: 13, key: 'Enter' }));
                            }, 300);
                        }
                    })();
                `;
            } else if (platform === 'pinduoduo' || platform === 'pdd') {
                scriptContent = `
                    (function() {
                        console.log('[Monitor] Pinduoduo send message triggered');
                        const text = decodeURIComponent("${encodeURIComponent(text)}");
                        let input = document.querySelector('.chat-input-wrapper input') || 
                                    document.querySelector('.live-chat-input');
                        
                        let btn = document.querySelector('.chat-send-btn') || 
                                  document.querySelector('.send-btn-wrapper');
                                  
                        if (input && btn) {
                            let nativeInputValueSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value")?.set;
                            if (nativeInputValueSetter) {
                                nativeInputValueSetter.call(input, text);
                            } else {
                                input.value = text;
                            }
                            input.dispatchEvent(new Event('input', { bubbles: true, composed: true }));
                            input.dispatchEvent(new Event('change', { bubbles: true, composed: true }));
                            
                            setTimeout(() => {
                                btn.click();
                            }, 300);
                        }
                    })();
                `;
            }
            
            if (scriptContent) {
                web.value.executeJavaScript(scriptContent);
            }
        }
    }
    return resolve(undefined);
});

const doOpenWebDevTools = () => {
    if (web.value) {
        if (web.value.isDevToolsOpened()) {
            web.value.closeDevTools();
        } else {
            web.value.openDevTools();
        }
    }
};

const doRefresh = e => {
    if (e.shiftKey) {
        pageDebugToolsShow.value = !pageDebugToolsShow.value;
        return;
    }
    if (web.value) {
        web.value.reload();
    }
};

watch(web, newVal => {
    if (!newVal) {
        return;
    }
    console.log("webview.listen", newVal);
    web.value.addEventListener("did-fail-load", (event: any) => {
        status.value?.setStatus("fail");
    });
    web.value.addEventListener("did-finish-load", (event: any) => {
        console.log("did-finish-load", event);
        // 保底机制：如果 dom-ready 没有成功解除 loading，这里做最后一次尝试
        status.value?.setStatus("success");
    });
    web.value.addEventListener("close", (event: any) => {
        if (web.value.isDevToolsOpened()) {
            web.value.closeDevTools();
        }
    });
    web.value.addEventListener("dom-ready", e => {
        try {
            if (pageOpenDevTools.value) {
                web.value.openDevTools();
            }
            if (pageScript.value) {
                if (pageScript.value.startsWith('local:')) {
                    const localScriptType = pageScript.value.split(':')[1];
                    let scriptContent = '';
                    if (localScriptType === 'bilibili') {
                      scriptContent = `
                          console.log('Bilibili local monitor started');
                          const { ipcRenderer } = require('electron');
                          
                          let isHistoryPeriod = true;
                          setTimeout(() => { 
                              isHistoryPeriod = false; 
                              console.log('Bilibili history period ended, starting to collect new messages');
                          }, 3000);
 
                          setInterval(() => {
                              // 获取弹幕
                              const chatItems = document.querySelectorAll('.chat-item.danmaku-item');
                              chatItems.forEach(item => {
                                  if (!item.dataset.processed) {
                                      item.dataset.processed = 'true';
                                      
                                      if (!isHistoryPeriod) {
                                          const username = item.getAttribute('data-uname') || 'User';
                                          const content = item.getAttribute('data-danmaku') || item.innerText;
                                          
                                          // 判断是否是自己发出的（基于 B站常见的房管、主播、自身标识）
                                          const isSelfOrAdmin = !!(item.querySelector('.admin-icon') || item.querySelector('.anchor-icon') || item.classList.contains('is-self'));

                                          ipcRenderer.sendToHost('data', {
                                              type: 'event',
                                              data: {
                                                  type: 'Comment',
                                                  data: { source: 'bilibili', username, content, isSelf: isSelfOrAdmin }
                                              }
                                          });
                                      }
                                  }
                              });

                              // 获取礼物
                              const giftItems = document.querySelectorAll('.chat-item.gift-item');
                              giftItems.forEach(item => {
                                  if (!item.dataset.processed) {
                                      item.dataset.processed = 'true';
                                      if (!isHistoryPeriod) {
                                          const username = item.getAttribute('data-uname') || item.querySelector('.user-name')?.innerText || 'User';
                                          const giftName = item.getAttribute('data-gift-name') || item.querySelector('.gift-name')?.innerText || '礼物';
                                          const giftCount = item.getAttribute('data-gift-num') || '1';
                                          
                                          ipcRenderer.sendToHost('data', {
                                              type: 'event',
                                              data: {
                                                  type: 'Gift',
                                                  data: { source: 'bilibili', username, content: \`\${giftName} x\${giftCount}\` }
                                              }
                                          });
                                      }
                                  }
                              });
                              // 获取礼物和点赞
                              const systemItems = document.querySelectorAll('.system-message, .gift-item, .like-item');
                              systemItems.forEach(item => {
                                  if (!item.dataset.processed) {
                                      item.dataset.processed = 'true';
                                      if (!isHistoryPeriod) {
                                          const text = item.innerText || '';
                                          if (text.includes('送给主播') || text.includes('送出') || item.classList.contains('gift-item')) {
                                              const username = item.querySelector('.name')?.innerText || '老板';
                                              const giftName = item.querySelector('.gift-name')?.innerText || '礼物';
                                              ipcRenderer.sendToHost('data', {
                                                  type: 'event',
                                                  data: {
                                                      type: 'Gift',
                                                      data: { source: 'kuaishou', username: username.trim(), content: giftName.trim() }
                                                  }
                                              });
                                          } else if (text.includes('点亮了') || text.includes('点赞') || item.classList.contains('like-item')) {
                                              const username = item.querySelector('.name')?.innerText || '宝宝';
                                              ipcRenderer.sendToHost('data', {
                                                  type: 'event',
                                                  data: {
                                                      type: 'Like',
                                                      data: { source: 'kuaishou', username: username.trim(), content: '点赞' }
                                                  }
                                              });
                                          }
                                      }
                                  }
                              });
                         }, 1000);
                      `;
                  } else if (localScriptType === 'douyin') {
                      scriptContent = `
                          console.log('Douyin local monitor started');
                          const { ipcRenderer } = require('electron');
                          
                          let isHistoryPeriod = true;
                          setTimeout(() => { isHistoryPeriod = false; }, 3000);
 
                          setInterval(() => {
                              // 获取弹幕
                              const chatItems = document.querySelectorAll('.webcast-chatroom___item');
                              chatItems.forEach(item => {
                                  if (!item.dataset.processed) {
                                      item.dataset.processed = 'true';
                                      
                                      if (!isHistoryPeriod) {
                                          const userNode = item.querySelector('.webcast-chatroom___name');
                                          const contentNode = item.querySelector('.webcast-chatroom___content-with-emoji-text');
                                          if (userNode && contentNode) {
                                              const username = userNode.innerText;
                                              const content = contentNode.innerText;
                                              
                                              // 检查是否是自己发出的（自己发送或房管/主播标签）
                                              const isSelfOrAdmin = !!(item.querySelector('.webcast-chatroom___self') || 
                                                                       item.classList.contains('is-self') || 
                                                                       item.querySelector('.webcast-chatroom___admin-icon') || 
                                                                       username.includes('主播'));

                                              ipcRenderer.sendToHost('data', {
                                                  type: 'event',
                                                  data: {
                                                      type: 'Comment',
                                                      data: { source: 'douyin', username, content, isSelf: isSelfOrAdmin }
                                                  }
                                              });
                                          }
                                      }
                                  }
                              });

                              // 获取礼物和点赞 (抖音通常在不同区域或类名，这里做基础兼容)
                              const giftItems = document.querySelectorAll('.webcast-chatroom___bottom-message');
                              giftItems.forEach(item => {
                                  if (!item.dataset.processed) {
                                      item.dataset.processed = 'true';
                                      if (!isHistoryPeriod) {
                                          const text = item.innerText;
                                          if (text.includes('送出了')) {
                                              const parts = text.split('送出了');
                                              ipcRenderer.sendToHost('data', {
                                                  type: 'event',
                                                  data: {
                                                      type: 'Gift',
                                                      data: { source: 'douyin', username: parts[0].trim(), content: parts[1].trim() }
                                                  }
                                              });
                                          } else if (text.includes('点赞了')) {
                                              const parts = text.split('点赞了');
                                              ipcRenderer.sendToHost('data', {
                                                  type: 'event',
                                                  data: {
                                                      type: 'Like',
                                                      data: { source: 'douyin', username: parts[0].trim(), content: '点赞' }
                                                  }
                                              });
                                          }
                                      }
                                  }
                              });
                         }, 1000);
                      `;
                  } else if (localScriptType === 'kuaishou') {
                      scriptContent = `
                          console.log('Kuaishou local monitor started');
                          const { ipcRenderer } = require('electron');
                          
                          let isHistoryPeriod = true;
                          setTimeout(() => { isHistoryPeriod = false; }, 3000);
 
                          setInterval(() => {
                              const chatItems = document.querySelectorAll('.chat-item');
                              chatItems.forEach(item => {
                                  if (!item.dataset.processed) {
                                      item.dataset.processed = 'true';
                                      
                                      if (!isHistoryPeriod) {
                                          const userNode = item.querySelector('.name');
                                          const contentNode = item.querySelector('.comment');
                                          if (userNode && contentNode) {
                                              const username = userNode.innerText;
                                              const content = contentNode.innerText;
                                              
                                              // 检查快手的身份标签
                                              const isSelfOrAdmin = !!(item.querySelector('.host-badge') || item.classList.contains('self'));

                                              ipcRenderer.sendToHost('data', {
                                                  type: 'event',
                                                  data: {
                                                      type: 'Comment',
                                                      data: { source: 'kuaishou', username, content, isSelf: isSelfOrAdmin }
                                                  }
                                              });
                                          }
                                      }
                                  }
                              });
                         }, 1000);
                      `;
                  } else {
                      scriptContent = `console.log('Unknown local script type');`;
                  }
                  web.value.executeJavaScript("console.log('local monitor script run');\n" + scriptContent);
            } else {
                window.$mapi.user.apiPost(pageScript.value, {}, {throwException: false}).then(res => {
                    if (res.code) {
                        pageStatusMsg.value = `ERROR: ${res.msg}`;
                    } else {
                        if (res.data.script) {
                            web.value.executeJavaScript("console.log('monitor script run');\n" + res.data.script);
                        }
                    }
                }).catch(err => {
                    console.error("API Error in monitor:", err);
                });
            }
        }
        } catch (err) {
            console.error("Error in dom-ready event:", err);
        } finally {
            status.value?.setStatus("success");
        }
    });
    web.value.addEventListener("ipc-message", event => {
        if ("data" === event.channel) {
            const {type, data} = event.args[0];
            console.log("[Monitor IPC Message]", type, data); // 增加调试日志
            
            if ("status" === type) {
                pageStatusType.value = data.type;
                pageStatusMsg.value = data.msg;
            } else if ("event" === type) {
                pageStatusType.value = "success"; // 收到数据，状态变绿
                // {"type":"Enter","data":{"source":"douyin","username":"啊龟 ","content":"来了"}}
                // Enter ( source: douyin, username: 啊龟 , content: 来了 )
                const format = (data: any) => {
                    const dataList: string[] = [];
                    for (const key in data.data) {
                        dataList.push(`${key}:${data.data[key]}`);
                    }
                    return `<span class="bg-gray-200 leading-6 px-2 rounded">${
                        data.type
                    }</span> <span class="text-gray-600">( ${dataList.join(", ")} )</span>`;
                };
                pageStatusMsg.value = format(data);
                window.__page.ipcSend("MonitorEvent", data.type, data.data);
            }
        }
    });
});

onMounted(async () => {
    webPreload.value = await window.$mapi.app.getPreload();
});
</script>

<template>
    <div class="pb-monitor-container relative">
        <div class="p-2 flex h-12 items-center overflow-hidden">
            <a-button
                shape="round"
                type="primary"
                status="danger"
                class="mr-1"
                v-if="pageDebugToolsShow"
                @click="doOpenWebDevTools"
            >
                {{ $t("monitor.debug") }}
            </a-button>
            <a-button shape="round" type="primary" @click="doRefresh"> {{ $t("monitor.refresh") }} </a-button>
            <div class="ml-2 select-none">
                <div :style="{color: pageStatusColor}" v-html="pageStatusMsg"></div>
            </div>
        </div>
        <div>
            <webview
                ref="web"
                :src="webUrl"
                nodeintegration
                webpreferences="contextIsolation=false,sandbox=false"
                partition="persist:monitor"
                :useragent="webUserAgent"
                :preload="webPreload"
                class="pb-monitor-web"
            ></webview>
        </div>
        <PageWebviewStatus ref="status" />
    </div>
</template>

<style lang="less" scoped>
.pb-monitor-container,
.pb-monitor-web {
    width: 100%;
    height: calc(100vh - 2.5rem - 3rem);
}
</style>
