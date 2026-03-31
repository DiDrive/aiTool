import uvicorn
from fastapi import FastAPI, Request
from pydantic import BaseModel
import threading
import time

app = FastAPI()

# 存储当前直播的全局状态
live_state = {
    "is_running": False,
    "current_status": "idle", # idle (闲时发呆) 或 talking (正在说话)
    "video_actions": [],      # 前端传过来的动作库
    "config": {}
}

@app.post("/api/scene/start")
async def start_live(request: Request):
    """
    接收前端点击【开始直播】时的配置数据
    """
    data = await request.json()
    scene_data = data.get("scene", {})
    
    # 提取前端传过来的配置和切片动作库
    live_state["config"] = scene_data.get("config", {})
    live_state["video_actions"] = scene_data.get("data", {}).get("videoActions", [])
    live_state["is_running"] = True
    live_state["current_status"] = "idle"
    
    print(f"✅ [后端] 收到开播请求！推流模式: {live_state['config'].get('streamMode')}")
    print(f"📦 [后端] 收到动作库资产共 {len(live_state['video_actions'])} 个")
    
    # TODO: 在这里启动 FFmpeg 或底层的 Wav2Lip 循环渲染线程
    # threading.Thread(target=render_loop).start()
    
    return {"code": 0, "msg": "ok", "data": {}}

@app.post("/api/scene/talk")
async def talk(request: Request):
    """
    接收前端弹幕触发的【说话打断】指令
    """
    data = await request.json()
    text = data.get("data", {}).get("text", "")
    
    print(f"💬 [后端] 收到弹幕打断任务，需要让数字人说: {text}")
    live_state["current_status"] = "talking"
    
    # TODO: 
    # 1. 调用本地 TTS 把 text 变成 .wav
    # 2. 调度 Wav2Lip 模型，用当前动作视频 + wav 生成口型视频
    # 3. 将生成的视频流插入到 FFmpeg 推流队列中
    
    # 模拟说话时长后恢复闲时状态
    def mock_talk_finish():
        time.sleep(3) # 假装说了3秒
        live_state["current_status"] = "idle"
        print("✅ [后端] 说话完毕，切回发呆循环。")
        
    threading.Thread(target=mock_talk_finish).start()
    
    return {"code": 0, "msg": "ok", "data": {}}

@app.post("/api/scene/stop")
async def stop_live():
    live_state["is_running"] = False
    print("🛑 [后端] 收到停播请求。")
    return {"code": 0, "msg": "ok", "data": {}}

@app.post("/api/config")
async def post_config():
    """
    前端用来检测服务是否存活以及获取能力的 POST 接口
    （前端添加远端模型时会调用这个）
    """
    return {
        "code": 0,
        "msg": "ok",
        "data": {
            "name": "my_local_live_engine",
            "version": "1.0.0",
            "title": "我的本地数字人引擎",
            "functions": ["scene/start", "scene/talk", "scene/stop"]
        }
    }

@app.get("/api/config")
async def get_config():
    """
    前端用来检测服务是否存活以及能力列表的接口
    """
    return {
        "code": 0,
        "msg": "ok",
        "data": {
            "functions": {
                "scene/start": {},
                "scene/talk": {},
                "scene/stop": {}
            }
        }
    }

if __name__ == "__main__":
    print("🚀 [数字人渲染引擎] 正在启动，监听端口 8000...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
