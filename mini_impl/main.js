
let ws;
let isGroupMode = false;
let currentSelectedAgent = "Claude Code"; // 默认单聊选中 Claude Code
let currentAgentMessageElement = null;
let accumulatedCode = "";
let isCodeBlock = false;

// 初始化 WebSocket 连接
function initWebSocket() {

    

    
    const statusDiv = document.getElementById("conn-status");
    if (!statusDiv) {
        console.error("❌ 未在页面上找到 id='conn-status' 的元素，请检查 index.html");
        return;
    }

    // 动态识别当前是 http 还是 https，自动切换 ws 或 wss 协议
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    // 动态获取当前访问的域名和端口（由 NPM 转发后，外网就不需要带 9005 端口号了）
    const wsUrl = protocol + "//" + window.location.host + "/ws/chat";

    console.log("🔗 动态自适应连接目标地址:", wsUrl);

    try {
        ws = new WebSocket(wsUrl);
    } catch (e) {
        console.error("❌ 创建 WebSocket 对象失败:", e);
    }

    ws.onopen = () => {
        console.log("✅ WebSocket 连接成功建立！");
        statusDiv.className = "text-xs bg-green-100 text-green-600 px-2 py-1 rounded-full flex items-center";
        statusDiv.innerHTML = '<span class="w-2 h-2 bg-green-500 rounded-full inline-block mr-1"></span>已连接';
    };

    ws.onerror = (error) => {
        console.error("❌ WebSocket 发生错误（可能是跨域、端口被占用或握手失败）:", error);
    };

    ws.onclose = (event) => {
        console.warn(`⚠️ WebSocket 连接关闭。代码: ${event.code}, 原因: ${event.reason}`);
        statusDiv.className = "text-xs bg-red-100 text-red-600 px-2 py-1 rounded-full flex items-center";
        statusDiv.innerHTML = '<span class="w-2 h-2 bg-red-500 rounded-full inline-block mr-1"></span>连接断开，3秒后自动重连...';
        setTimeout(initWebSocket, 3000);
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        const chatStream = document.getElementById("chat-stream");

        if (data.type === "status") {
            const statusCard = document.createElement("div");
            statusCard.className = "text-center text-xs text-gray-500 my-2 bg-gray-200/60 py-1 rounded-md max-w-md mx-auto italic";
            statusCard.innerText = data.content;
            chatStream.appendChild(statusCard);
            chatStream.scrollTop = chatStream.scrollHeight;
            currentAgentMessageElement = null; 
        } 
        else if (data.type === "chunk") {
            if (!currentAgentMessageElement) {
                createAgentMessageBubble(data.agent);
                accumulatedCode = "";
                isCodeBlock = false;
            }
            
            const textSpan = currentAgentMessageElement.querySelector(".message-text");
            textSpan.innerText += data.content;
            
            const fullText = textSpan.innerText;

            // 🔥 【核心增强】：利用正则表达式，同时兼容英文反引号、中文单/双引号的代码块标记
            const codeBlockRegex = /(```|‘’’|“““|”””)html/i;
            const hasHTMLTags = fullText.includes("<!DOCTYPE html>") || fullText.includes("<html");

            if ((codeBlockRegex.test(fullText) || hasHTMLTags) && !isCodeBlock) {
                isCodeBlock = true;
                console.log("📥 [沙箱状态] 触发全兼容网页捕获引擎...");
            }

            if (isCodeBlock) {
                let cleanCode = "";

                // 统一寻找代码主体的起点
                let htmlStartIndex = -1;
                
                // 优先寻找 HTML 标签起点
                if (fullText.includes("<!DOCTYPE")) htmlStartIndex = fullText.indexOf("<!DOCTYPE");
                else if (fullText.includes("<html")) htmlStartIndex = fullText.indexOf("<html");
                else {
                    // 如果大模型还没吐出标签，则寻找任意中英文代码标记的终点
                    const match = fullText.match(codeBlockRegex);
                    if (match) {
                        htmlStartIndex = fullText.indexOf(match[0]) + match[0].length;
                    }
                }
                
                if (htmlStartIndex !== -1) {
                    let currentCodeSegment = fullText.substring(htmlStartIndex);
                    
                    // 统一清洗可能残留在尾部的结束符号（英文或中文符号）
                    cleanCode = currentCodeSegment
                        .replace(/```/g, "")
                        .replace(/‘’’/g, "")
                        .replace(/“““/g, "")
                        .replace(/”””/g, "")
                        .trim();
                }

                // 实时推送到右侧沙箱进行流式渲染
                if (cleanCode) {
                    renderToSandbox(cleanCode);
                }
            }

            chatStream.scrollTop = chatStream.scrollHeight;
        }
    };
}

// 创建智能体聊天气泡
function createAgentMessageBubble(agentName) {
    const chatStream = document.getElementById("chat-stream");
    const bubble = document.createElement("div");
    bubble.className = "flex items-start space-x-3";
    
    const colors = { "Claude Code": "bg-orange-500", "Codex": "bg-purple-600", "Orchestrator": "bg-blue-600" };
    const avatarColor = colors[agentName] || "bg-green-600";

    bubble.innerHTML = `
        <div class="w-8 h-8 ${avatarColor} text-white rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0">${agentName[0]}</div>
        <div class="bg-white p-3 rounded-xl shadow-sm border text-sm max-w-[85%]">
            <p class="text-xs font-bold text-gray-400 mb-1">${agentName}</p>
            <span class="message-text whitespace-pre-wrap"></span>
        </div>
    `;
    chatStream.appendChild(bubble);
    currentAgentMessageElement = bubble;
}

function selectAgent(agentName) {
    if (isGroupMode) {
        alert("当前处于智能体群聊模式，Orchestrator 将自动协调全场。如需体验单聊，请先点击上方按钮切回单聊。");
        return;
    }
    currentSelectedAgent = agentName;
    
    // 刷洗 UI 选中高亮状态
    document.querySelectorAll(".agent-item").forEach(el => {
        el.classList.remove("bg-blue-50", "border-blue-600");
        el.classList.add("hover:bg-gray-50", "border-transparent");
        el.querySelector("p").classList.remove("text-gray-800");
        el.querySelector("p").classList.add("text-gray-700");
    });
    
    const targetId = agentName === "Claude Code" ? "item-Claude" : "item-Codex";
    const activeEl = document.getElementById(targetId);
    activeEl.classList.remove("hover:bg-gray-50", "border-transparent");
    activeEl.classList.add("bg-blue-50", "border-blue-600");
    
    // 更新中间聊天流的顶部 Header 指示标签
    document.getElementById("current-agent-label").innerText = `${agentName} (单聊)`;
    console.log(`🎯 当前单聊目标已切换至: ${agentName}`);
}

// 切换聊天模式
function toggleChatMode() {
    isGroupMode = !isGroupMode;
    const btn = document.getElementById("mode-btn");
    const label = document.getElementById("current-agent-label");
    const agentList = document.getElementById("agent-list");
    
    if (isGroupMode) {
        if (btn) {
            btn.className = "w-full bg-orange-500 hover:bg-orange-600 text-white text-sm py-2 px-4 rounded-lg font-medium transition-colors shadow-sm";
            btn.innerText = "当前：群聊协作模式";
        }
        // 🔥 加强防御：只有抓到 label 时才赋值，找不到不强行报错
        if (label) label.innerText = "智能体协作群聊 (Orchestrator 调度中)";
        if (agentList) agentList.style.opacity = "0.5"; 
    } else {
        if (btn) {
            btn.className = "w-full bg-blue-600 hover:bg-blue-700 text-white text-sm py-2 px-4 rounded-lg font-medium transition-colors shadow-sm";
            btn.innerText = "切换至群聊模式 (@多Agent)";
        }
        // 🔥 加强防御
        if (label) label.innerText = `${currentSelectedAgent} (单聊)`;
        if (agentList) agentList.style.opacity = "1";
    }
}

// 修改发送消息函数：将选中的智能体一并发送给后端
function sendMessage() {
    const input = document.getElementById("user-input");
    const text = input.value.trim();
    if (!text) return;

    const chatStream = document.getElementById("chat-stream");
    const userBubble = document.createElement("div");
    userBubble.className = "flex items-start space-x-3 justify-end";
    userBubble.innerHTML = `<div class="bg-blue-600 text-white p-3 rounded-xl shadow-sm text-sm max-w-[85%]">${text}</div>`;
    chatStream.appendChild(userBubble);
    
    // 🔥 【核心增强】：将选择的 agent 平台参数打包发送
    ws.send(JSON.stringify({ 
        text: text, 
        type: isGroupMode ? "group" : "single",
        agent: currentSelectedAgent
    }));
    
    input.value = "";
    currentAgentMessageElement = null; 
    chatStream.scrollTop = chatStream.scrollHeight;
    isCodeBlock = false;
    accumulatedCode = "";
}

// 渲染到右侧沙箱组件
function renderToSandbox(rawCode) {
    let cleanCode = rawCode.replace("```html", "").replace("```", "").trim();
    const container = document.getElementById("sandbox-container");
    
    container.innerHTML = `
        <div class="bg-white rounded-lg shadow-md p-2 h-full flex flex-col">
            <div class="text-xs text-gray-400 border-b pb-1 mb-2 flex justify-between">
                <span>📄 Rendered_Artifact.html</span>
            </div>
            <iframe id="preview-iframe" class="w-full flex-1 border-0 rounded"></iframe>
        </div>
    `;
    
    document.getElementById('preview-iframe').srcdoc = cleanCode;
}

// 🔥 【确保万无一失的强制激活】
// 如果 window.onload 没触发，双重保障激活连接
if (document.readyState === "complete" || document.readyState === "interactive") {
    initWebSocket();
} else {
    window.addEventListener("DOMContentLoaded", initWebSocket);
}

// 绑定键盘事件
document.addEventListener("DOMContentLoaded", () => {
    const inputEl = document.getElementById("user-input");
    if (inputEl) {
        inputEl.addEventListener("keypress", (e) => { 
            if(e.key === 'Enter') sendMessage(); 
        });
    }
});