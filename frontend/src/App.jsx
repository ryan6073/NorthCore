import React, { useEffect, useRef } from 'react';
import { create } from 'zustand';

// =====================================================================
// 1. 全局状态管理中枢 (Zustand Store) - 支撑多会话状态与流式清洗
// =====================================================================
const useChatStore = create((set, get) => ({
  isGroupMode: false,
  currentSelectedAgent: 'Claude Code',
  connectionStatus: 'connecting', // connecting | connected | disconnected
  messages: [], // { id, role, agent, content, type }
  currentStreamingText: '', 
  currentStreamingAgent: '',
  cleanHtmlCode: '', // 右侧沙箱消费的核心数据

  toggleChatMode: () => set((state) => {
    const nextMode = !state.isGroupMode;
    return {
      isGroupMode: nextMode,
      currentStreamingAgent: nextMode ? 'Orchestrator' : state.currentSelectedAgent
    };
  }),

  setAgent: (agentName) => {
    if (get().isGroupMode) return;
    set({ currentSelectedAgent: agentName });
  },

  setConnectionStatus: (status) => set({ connectionStatus: status }),

  // 核心控制：解析大模型高频流式吐出的 Token 并实时抓取 HTML 代码块
  appendChunk: (agentName, token) => set((state) => {
    const updatedText = state.currentStreamingText + token;
    
    let extractedHtml = state.cleanHtmlCode;
    const codeBlockRegex = /(```|‘’’|“““|”””)html/i;
    const hasHTMLTags = updatedText.includes('<!DOCTYPE html>') || updatedText.includes('<html');

    // 工业级高宽容度 HMR 网页捕获引擎 (防止大模型吐出不标准或中文反引号标记)
    if (codeBlockRegex.test(updatedText) || hasHTMLTags) {
      let htmlStartIndex = -1;
      if (updatedText.includes('<!DOCTYPE')) htmlStartIndex = updatedText.indexOf('<!DOCTYPE');
      else if (updatedText.includes('<html')) htmlStartIndex = updatedText.indexOf('<html');
      else {
        const match = updatedText.match(codeBlockRegex);
        if (match) htmlStartIndex = updatedText.indexOf(match[0]) + match[0].length;
      }

      if (htmlStartIndex !== -1) {
        // 彻底洗掉残留尾部的各语种代码块闭合标签，推送到右侧沙箱进行流式渲染
        extractedHtml = updatedText.substring(htmlStartIndex).replace(/```|‘’’|“““|”””/g, '').trim();
      }
    }

    return {
      currentStreamingAgent: agentName,
      currentStreamingText: updatedText,
      cleanHtmlCode: extractedHtml
    };
  }),

  // 流状态截断：将当前流式文本打包沉淀进历史消息队列
  flushStreamingToMessages: () => set((state) => {
    if (!state.currentStreamingText) return {};
    const newMessage = {
      id: Date.now().toString(),
      role: 'assistant',
      agent: state.currentStreamingAgent,
      content: state.currentStreamingText,
      type: state.cleanHtmlCode ? 'code' : 'text'
    };
    return {
      messages: [...state.messages, newMessage],
      currentStreamingText: '',
      currentStreamingAgent: ''
    };
  }),

  addStatusCard: (content) => set((state) => ({
    messages: [...state.messages, { id: Date.now().toString(), role: 'system', agent: 'System', content, type: 'status' }]
  })),

  addUserMessage: (text) => set((state) => ({
    messages: [...state.messages, { id: Date.now().toString(), role: 'user', agent: 'User', content: text, type: 'text' }]
  }))
}));

// =====================================================================
// 2. 主页面渲染入口 (App Component) - 字节跳动飞书风格三栏式画布
// =====================================================================
export default function App() {
  const store = useChatStore();
  const ws = useRef(null);
  const streamRef = useRef(null);
  const inputRef = useRef(null);

  // 建立 WebSocket 长连接副作用与自动重连机制
  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    // 自动适配本地 9006 端口或线上的网关反向代理
    const wsUrl = `${protocol}//${window.location.hostname}:9006/ws/chat`;
    
    const connect = () => {
      store.setConnectionStatus('connecting');
      ws.current = new WebSocket(wsUrl);

      ws.current.onopen = () => store.setConnectionStatus('connected');
      ws.current.onclose = () => {
        store.setConnectionStatus('disconnected');
        setTimeout(connect, 3000); // 3秒无痛重连安全门
      };

      ws.current.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.type === 'status') {
          // 在编排产生新阶段前，先把上一阶段的流沉淀下来
          store.flushStreamingToMessages();
          store.addStatusCard(data.content);
        } else if (data.type === 'chunk') {
          store.appendChunk(data.agent, data.content);
        }
      };
    };

    connect();
    return () => ws.current?.close();
  }, []);

  // 保持消息流自动滚动体验
  useEffect(() => {
    if (streamRef.current) {
      streamRef.current.scrollTop = streamRef.current.scrollHeight;
    }
  }, [store.messages, store.currentStreamingText]);

  // 消息发射机
  const handleSend = () => {
    const text = inputRef.current?.value.trim();
    if (!text || !ws.current) return;

    store.flushStreamingToMessages();
    store.addUserMessage(text);

    // 大厂上报 Spec：上报载荷中携带 session_id，使后端保持上下文连续
    ws.current.send(JSON.stringify({
      text: text,
      type: store.isGroupMode ? 'group' : 'single',
      agent: store.currentSelectedAgent,
      session_id: 'session_react_omega_2026'
    }));

    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="bg-gray-50 h-screen flex flex-col overflow-hidden text-gray-800 font-sans">
      
      
      <header className="bg-white border-b border-gray-100 px-6 py-3 flex justify-between items-center z-10 shadow-sm flex-shrink-0">
        <div className="flex items-center space-x-3">
          <span className="text-2xl animate-bounce">🚀</span>
          <div>
            <h1 className="text-base font-bold tracking-tight text-gray-900 flex items-center">
              AgentHub <span className="text-xs bg-blue-100 text-blue-700 font-semibold px-2 py-0.5 rounded ml-2">v1.0 React Engine</span>
            </h1>
            <p className="text-[10px] text-gray-400">多智能体协同流式画布平台</p>
          </div>
        </div>
        <div className={`text-xs px-3 py-1 rounded-full font-medium shadow-sm transition-all duration-300 ${
          store.connectionStatus === 'connected' ? 'bg-green-50 text-green-600' : 'bg-amber-50 text-amber-600'
        }`}>
          <span className={`w-1.5 h-1.5 rounded-full inline-block mr-2 ${store.connectionStatus === 'connected' ? 'bg-green-500 shadow-sm' : 'bg-amber-500 animate-pulse'}`}></span>
          {store.connectionStatus === 'connected' ? '核心引擎已就绪' : '正在初始化长连接...'}
        </div>
      </header>

      
      <div className="flex-1 flex overflow-hidden relative">
        
        
        <aside className="hidden md:flex flex-col w-64 bg-white border-r border-gray-100 flex-shrink-0 shadow-xs">
          <div className="p-4 border-b border-gray-100">
            <button 
              onClick={store.toggleChatMode}
              className={`w-full text-white text-sm py-2.5 px-4 rounded-xl font-medium transition-all shadow-sm active:scale-95 ${
                store.isGroupMode ? 'bg-orange-500 hover:bg-orange-600 shadow-orange-100' : 'bg-blue-600 hover:bg-blue-700 shadow-blue-100'
              }`}
            >
              {store.isGroupMode ? '当前：群聊协作模式' : '切换至群聊模式 (@多Agent)'}
            </button>
          </div>
          <div className="p-3">
            <p className="text-xs font-bold text-gray-400 px-2 mb-2 tracking-wider">在线智能体 (AGENTS)</p>
            <div className="flex flex-col space-y-1.5 transition-opacity duration-300" style={{ opacity: store.isGroupMode ? 0.4 : 1 }}>
              {[
                { name: 'Claude Code', desc: '全栈敏捷实时工程专家', from: 'from-orange-500 to-amber-400' },
                { name: 'Codex', desc: '架构设计与深度代码审查', from: 'from-purple-600 to-indigo-500' }
              ].map((agent) => (
                <div 
                  key={agent.name}
                  onClick={() => store.setAgent(agent.name)}
                  className={`flex items-center p-3 rounded-xl cursor-pointer transition-all duration-200 ${
                    store.currentSelectedAgent === agent.name && !store.isGroupMode ? 'bg-blue-50/80 border-l-4 border-blue-600' : 'border-l-4 border-transparent hover:bg-gray-50'
                  }`}
                >
                  <div className={`w-9 h-9 text-white rounded-xl flex items-center justify-center font-bold shadow-sm bg-gradient-to-tr ${agent.from}`}>{agent.name[0]}</div>
                  <div className="ml-3 overflow-hidden">
                    <p className="text-sm font-bold text-gray-900">{agent.name}</p>
                    <p className="text-xs text-gray-400 truncate">{agent.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </aside>

        
        <main className="flex-1 flex flex-col bg-gray-50/50">
          <div className="bg-white border-b border-gray-100 px-6 py-3.5 flex justify-between items-center shadow-xs flex-shrink-0">
            <span className="text-sm font-bold text-gray-800 tracking-wide flex items-center">
              {store.isGroupMode ? '👥 智能体协作群聊 (Orchestrator 调度中)' : `${store.currentSelectedAgent} (单聊)`}
            </span>
          </div>

          
          <div ref={streamRef} className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
            {store.messages.map((msg) => {
              if (msg.type === 'status') {
                return (
                  <div key={msg.id} className="text-center text-xs text-gray-400 my-3 bg-gray-200/50 backdrop-blur-sm py-1.5 px-4 rounded-xl max-w-sm mx-auto italic border border-gray-100 shadow-xs animate-fade-in">
                    {msg.content}
                  </div>
                );
              }
              return (
                <div key={msg.id} className={`flex items-start space-x-3 my-2 ${msg.role === 'user' ? 'justify-end' : ''}`}>
                  {msg.role !== 'user' && <div className="w-8 h-8 bg-gray-400 text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">{msg.agent ? msg.agent[0] : 'A'}</div>}
                  <div className={`p-3.5 rounded-2xl shadow-xs text-sm max-w-[85%] leading-relaxed ${
                    msg.role === 'user' ? 'bg-gradient-to-r from-blue-600 to-blue-500 text-white' : 'bg-white border border-gray-100 text-gray-800'
                  }`}>
                    {msg.role !== 'user' && <p className="text-[10px] font-bold text-gray-400 mb-1 tracking-wide uppercase">{msg.agent}</p>}
                    <span className="whitespace-pre-wrap font-sans">{msg.content}</span>
                  </div>
                </div>
              );
            })}

            
            {store.currentStreamingText && (
              <div className="flex items-start space-x-3 my-2 animate-fade-in">
                <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-cyan-500 text-white rounded-xl flex items-center justify-center text-xs font-bold flex-shrink-0">
                  {store.currentStreamingAgent ? store.currentStreamingAgent[0] : 'A'}
                </div>
                <div className="bg-white p-3.5 rounded-2xl shadow-sm border border-gray-100 text-sm max-w-[85%] leading-relaxed">
                  <p className="text-[10px] font-bold text-gray-400 mb-1 tracking-wide uppercase">{store.currentStreamingAgent}</p>
                  <span className="text-gray-800 whitespace-pre-wrap font-sans">{store.currentStreamingText}</span>
                </div>
              </div>
            )}
          </div>

          
          <div className="p-4 bg-white border-t border-gray-100 shadow-[0_-4px_12px_rgba(0,0,0,0.01)]">
            <div className="flex items-center space-x-3 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5 focus-within:ring-2 focus-within:ring-blue-500 focus-within:bg-white focus-within:border-transparent transition-all">
              <input 
                type="text" 
                ref={inputRef}
                onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                placeholder="键入交互诉求... (提示：群聊模式会自动生成网页产物)" 
                className="flex-1 bg-transparent border-0 text-sm focus:outline-none text-gray-900 placeholder-gray-400"
              />
              <button onClick={handleSend} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded-lg text-sm font-semibold transition-all shadow-sm active:scale-95">
                发送
              </button>
            </div>
          </div>
        </main>

        
        <section className="hidden lg:flex flex-col w-[450px] bg-white border-l border-gray-100 shadow-xs flex-shrink-0">
          <div className="p-4 border-b bg-gray-50/50 flex items-center justify-between">
            <span className="text-sm font-bold text-gray-800 flex items-center">
              <span className="mr-2">👁️</span>实时产物渲染画布
            </span>
            {store.cleanHtmlCode && (
              <span className="text-[10px] text-green-600 bg-green-50 px-2 py-0.5 rounded-md font-bold tracking-wider animate-pulse">
                HMR ACTIVE
              </span>
            )}
          </div>
          <div className="flex-1 p-5 bg-gray-100/60 overflow-y-auto">
            {store.cleanHtmlCode ? (
              <div className="bg-white rounded-2xl shadow-md p-3 h-full flex flex-col border border-gray-100 animate-fade-in">
                <div className="text-xs text-gray-400 border-b border-gray-100 pb-2.5 mb-2 flex justify-between items-center px-1 font-mono">
                  <span className="flex items-center text-gray-500">
                    <span className="text-blue-500 mr-1.5">●</span>artifact_render.html
                  </span>
                </div>
                <iframe title="Sandbox Canvas" srcDoc={store.cleanHtmlCode} className="w-full flex-1 border-0 rounded-xl bg-white" sandbox="allow-scripts" />
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-2xl flex flex-col items-center justify-center p-6 text-center text-gray-400 h-full">
                <span className="text-4xl mb-3">📦</span>
                <h3 className="text-sm font-semibold text-gray-700 mb-1">暂无待执行产物</h3>
                <p className="text-xs max-w-[200px] leading-relaxed">触发单聊或群聊协作生成代码后，此沙箱将全自动流式热重载运行。</p>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}