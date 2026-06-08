import { create } from 'zustand';
import { Conversation, Message, Agent, Artifact, ArtifactVersion, CreateConversationPayload, ArtifactReference, MessageAttachment, AgentMentionItem, PinItem, MemoryItem, MemoryCategory, SendMessageRequest, ContextUsage, AgentChat, AgentChatMessage, Workspace, WorkspaceTreeNode, AgentRunDetail, SandboxFile, ModelProvider, ModelCredential, ModelConfig, AgentToolCatalogItem } from '@/types';
import { getAgentList, updateAgentDetail, createAgent as createAgentApi, deleteAgent as deleteAgentApi, getAgentContact, getAgentToolCatalog } from '@/services/http/agentService';
import { getConversationList, createConversation as createConversationApi, updateConversation, compressContext, pinMessage, unpinMessage, getPins, getMemories, deleteMemory, updateMemory, deleteConversation, getContextUsage as getContextUsageApi, pinConversation, archiveConversation, getConversationAgentConfig, updateConversationAgentConfig, addAgentToConversation, removeAgentFromConversation } from '@/services/http/conversationService';
import { getMessageList, sendMessageNonStreaming } from '@/services/http/messageService';
import { getArtifactMetaList, getArtifactDetail, getArtifactVersions, updateArtifactContent, getWorkspaceArtifacts } from '@/services/http/artifactService';
import wsClient from '@/services/ws/wsClient';
import { mockConversations, mockMessages, mockAgents as initialAgents, mockArtifacts, mockArtifactVersions, mockSandboxNormalScenarios } from '@/mock';
import { createId } from '@/utils/id';
import { getCurrentFullTime } from '@/utils/time';
import { generateMockReply } from '@/utils/mockReply';
import { USE_MOCK, registerHttpLogger } from '@/services';
import { healthCheck } from '@/services/http/healthService';
import { registerApi, loginApi, loginAsGuestApi, getMeApi, logoutApi, updateProfileApi } from '@/services/http/authService';
import sandboxService from '@/services/http/sandboxService';
import { platform, FileNode, WorkspaceInfo, AgentProcessInfo } from '@/utils/platform';
import modelService from '@/services/http/modelService';
import workspaceService, { WorkspaceItem, WorkspaceTreeNode as ServerWorkspaceTreeNode, FileContentData } from '@/services/http/workspaceService';

const generateMockDocContent = (fileName: string, fileSize: number) => {
  const formattedSize = fileSize > 1024 * 1024 
    ? `${(fileSize / (1024 * 1024)).toFixed(2)} MB` 
    : `${(fileSize / 1024).toFixed(2)} KB`;
  return `# NorthCore 文档解析器: ${fileName}

本文档是通过 NorthCore 安全沙箱的本地文档解析服务自动转换生成的预览版本。

## 1. 文件元数据 (File Metadata)
- **文件名 (File Name)**: ${fileName}
- **文件大小 (File Size)**: ${formattedSize}
- **转换时间 (Conversion Time)**: ${new Date().toLocaleString()}
- **安全检查 (Security Scan)**: 通行 (PASS)

## 2. 自动转换预览说明
NorthCore 自动检测并提取了该文档中的段落、标题与列表，并以 Markdown 结构呈现，以提供最流畅的在线渲染。由于该文件为二进制 Word 文档格式，我们已提取核心文本段落并重构了格式。

## 3. 提取出的主要内容概要 (Document Content Overview)
- **文档核心议题**: 本文件包含关于项目实施或设计文档的纲要。
- **系统接口适配**: 
  - 前端支持对同一条用户消息返回多个 Agent 回复；
  - 聊天流实时渲染 \`role="agent" + type="status"\` 系统状态气泡；
  - 接入沙箱部署卡片并实现 40002 错误码拦截回滚。
- **流程控制规范**:
  - 所有子智能体协作流程遵循 Orchestrator 制定的 Task Plan 树状拓扑图。
  - 用户消息乐观插入后在 WS 确认事件到达时自动更正 ID 以去重。

## 4. 结论与下一步行动
文档分析完毕，未发现敏感信息泄露，已成功将文档注册进当前会话的产物文件树，您可以在左侧或右侧的“生成产物树”中随时查看它。
`;
};

const generateMockPptContent = (fileName: string, fileSize: number) => {
  const formattedSize = fileSize > 1024 * 1024 
    ? `${(fileSize / (1024 * 1024)).toFixed(2)} MB` 
    : `${(fileSize / 1024).toFixed(2)} KB`;
  return `# NorthCore 演示文稿解析: ${fileName}
- **文件名**: ${fileName}
- **文件大小**: ${formattedSize}
- **解析引擎**: NorthCore PPTX Parser v1.0
- **安全沙箱状态**: 绿色安全通过 (PASS)

---

# 第一页：文稿转换概要
- 本演示文稿是从上传的本地二进制 PPT/PPTX 文件自动转换而成的预览版。
- 检测到该 PPT 包含页面框架、文本框与多媒体组件。
- 已自动提取主要标题及幻灯片正文，转化为自适应的 Markdown 幻灯片。

---

# 第二页：智能协同与前端适配
- **协同架构**：支持 Group Chat Collaboration 工作流。
- **消息适配**：支持一问多答、status 状态气泡、以及 Orchestrator 总结卡片的富文本渲染。
- **部署配置**：支持 \`executionMode: "deployment"\` 及部署配置表单实时显示。

---

# 第三页：转换完成提示
- 文件转换百分百成功，沙箱状态安全无虞。
- 您可以通过点击左右控制按钮进行幻灯片翻页导航。
- 您也可以随时点击“全屏预览”放大在此页面中进行演示展示。
`;
};

const handleMockFileAttachments = async (
  activeConversationId: string,
  attachments: MessageAttachment[] | undefined,
  set: any,
  get: any
): Promise<boolean> => {
  if (!attachments || attachments.length === 0) return false;
  
  const docPptAttachments = attachments.filter(a => 
    a.type === 'ppt' || 
    a.name.endsWith('.ppt') || 
    a.name.endsWith('.pptx') || 
    a.name.endsWith('.doc') || 
    a.name.endsWith('.docx')
  );

  if (docPptAttachments.length === 0) return false;

  const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
  
  for (const attach of docPptAttachments) {
    const isPpt = attach.type === 'ppt' || attach.name.endsWith('.ppt') || attach.name.endsWith('.pptx');
    const typeLabel = isPpt ? 'PPT演示文稿' : 'Word文档';
    
    // 1. Send status message indicating conversion starting
    const statusMsg1: Message = {
      id: createId('msg'),
      conversationId: activeConversationId,
      senderId: 'system',
      senderName: '系统',
      role: 'system',
      type: 'status',
      content: `检测到本地上传文件 ${attach.name}，正在启动安全沙箱文档解析器并将其转换为预览产物...`,
      createdAt: getCurrentFullTime()
    };
    
    set((state: any) => {
      const currentMsgs = state.conversationMessages[activeConversationId] || state.messages || [];
      const newMsgs = [...currentMsgs, statusMsg1];
      const isSyncActive = state.activeConversationId === activeConversationId;
      return {
        messages: isSyncActive ? newMsgs : state.messages,
        conversationMessages: {
          ...state.conversationMessages,
          [activeConversationId]: newMsgs
        },
        isProcessing: true
      };
    });
    
    await delay(1200);

    let contentStr = '';
    if (attach.file) {
      try {
        const text = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve((e.target?.result as string) || '');
          reader.onerror = () => resolve('');
          reader.readAsText(attach.file);
        });
        
        if (text && !text.startsWith('PK') && !text.includes('\x00')) {
          contentStr = text;
        }
      } catch (e) {
        console.error('Error reading uploaded file as text', e);
      }
    }

    if (!contentStr) {
      contentStr = isPpt 
        ? generateMockPptContent(attach.name, attach.size || 10240)
        : generateMockDocContent(attach.name, attach.size || 10240);
    }

    const newArtId = `art-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newVerId = `ver-upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const newArtifact: Artifact = {
      id: newArtId,
      conversationId: activeConversationId,
      title: attach.name,
      type: isPpt ? 'ppt' : 'document',
      description: `从上传 of 本地文件 ${attach.name} 转换生成的预览产物`,
      currentVersionId: newVerId,
      latestVersion: 1,
      createdAt: getCurrentFullTime(),
      updatedAt: getCurrentFullTime()
    };

    const newVersion: ArtifactVersion = {
      id: newVerId,
      artifactId: newArtId,
      version: 1,
      content: contentStr,
      size: contentStr.length,
      createdBy: 'system',
      createdByType: 'orchestrator',
      createdAt: getCurrentFullTime()
    };

    set((state: any) => {
      const updatedVersions = { ...state.artifactVersions };
      updatedVersions[newArtId] = [newVersion];
      return {
        artifacts: [...state.artifacts, newArtifact],
        artifactVersions: updatedVersions,
        selectedArtifactId: newArtId,
        conversationSelectedArtifactId: {
          ...state.conversationSelectedArtifactId,
          [activeConversationId]: newArtId
        }
      };
    });

    // 3. Send final message from Agent indicating success
    const successMsg: Message = {
      id: createId('msg'),
      conversationId: activeConversationId,
      senderId: 'agent-doc',
      senderName: 'DocAgent',
      role: 'agent',
      type: 'artifact',
      artifactId: newArtId,
      content: `已成功将上传的 ${typeLabel} 转换为预览产物: ${attach.name}`,
      createdAt: getCurrentFullTime()
    };

    set((state: any) => {
      const currentMsgs = state.conversationMessages[activeConversationId] || state.messages || [];
      const newMsgs = [...currentMsgs, successMsg];
      const isSyncActive = state.activeConversationId === activeConversationId;
      return {
        messages: isSyncActive ? newMsgs : state.messages,
        conversationMessages: {
          ...state.conversationMessages,
          [activeConversationId]: newMsgs
        },
        isProcessing: false
      };
    });

    await delay(500);
  }
  
  return true;
};

export interface FloatingConversation {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isMinimized: boolean;
  isMaximized: boolean;
}


// Mock model data for offline/mock mode
const mockModelProviders: ModelProvider[] = [
  { id: 'openai', name: 'OpenAI (GPT)', protocol: 'openai_chat_completions', requiresBaseUrl: false, supportedRuntimes: ['codex', 'opencode'] },
  { id: 'anthropic', name: 'Anthropic (Claude)', protocol: 'anthropic_messages', requiresBaseUrl: false, supportedRuntimes: ['claude_code', 'opencode'] },
  { id: 'openai_compatible', name: 'OpenAI Compatible', protocol: 'openai_chat_completions', requiresBaseUrl: true, defaultBaseUrl: 'https://api.deepseek.com/v1', supportedRuntimes: ['opencode'] },
  { id: 'anthropic_compatible', name: 'Anthropic-compatible / Claude Code Router', protocol: 'anthropic_messages', requiresBaseUrl: true, defaultBaseUrl: 'http://localhost:3000', supportedRuntimes: ['claude_code', 'opencode'] },
  {
    id: "chatanywhere_codex",
    name: "ChatAnywhere / Codex",
    protocol: "openai_responses",
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.chatanywhere.tech/v1",
    supportedRuntimes: ["codex"]
  },
  {
    id: "chatanywhere_claude_code",
    name: "ChatAnywhere / Claude Code",
    protocol: "anthropic_messages",
    requiresBaseUrl: false,
    defaultBaseUrl: "https://api.chatanywhere.tech",
    supportedRuntimes: ["claude_code"]
  }
];

const initialMockModelCredentials: ModelCredential[] = [
  { id: 'cred-1', ownerUserId: '1', name: 'DeepSeek API Key', provider: 'openai_compatible', credentialType: 'api_key', configured: true, createdAt: '2026-06-02 00:00:00', updatedAt: '2026-06-02 00:00:00' },
  { id: 'cred-2', ownerUserId: '1', name: 'OpenAI Global Key', provider: 'openai', credentialType: 'api_key', configured: true, createdAt: '2026-06-02 00:00:00', updatedAt: '2026-06-02 00:00:00' }
];

const initialMockModelConfigs: ModelConfig[] = [
  { id: 'config-1', ownerUserId: '1', name: 'DeepSeek V3 (Chat)', provider: 'openai_compatible', protocol: 'openai_chat_completions', modelName: 'deepseek-chat', baseUrl: 'https://api.deepseek.com/v1', credentialRef: 'cred-1', extraConfig: {}, createdAt: '2026-06-02 00:00:00', updatedAt: '2026-06-02 00:00:00' },
  { id: 'config-2', ownerUserId: '1', name: 'GPT-4o Standard', provider: 'openai', protocol: 'openai_chat_completions', modelName: 'gpt-4o', baseUrl: null, credentialRef: 'cred-2', extraConfig: {}, createdAt: '2026-06-02 00:00:00', updatedAt: '2026-06-02 00:00:00' }
];

// Helper functions to cache message-specific artifact references locally
const saveArtifactRefToLocal = (messageId: string, ref: ArtifactReference): void => {
  try {
    const cached = JSON.parse(localStorage.getItem('ag_message_artifact_refs') || '{}');
    cached[messageId] = ref;
    localStorage.setItem('ag_message_artifact_refs', JSON.stringify(cached));
  } catch (e) {
    console.error('Failed to save artifactRef to localStorage', e);
  }
};

const getArtifactRefFromLocal = (messageId: string): ArtifactReference | undefined => {
  try {
    const cached = JSON.parse(localStorage.getItem('ag_message_artifact_refs') || '{}');
    return cached[messageId];
  } catch (e) {
    console.error('Failed to get artifactRef from localStorage', e);
    return undefined;
  }
};

// Map backend metadata fields back to message root properties
const mapMessageMetadata = (m: Message): Message => {
  const metadata = (m as any).metadata;
  let artifactRef = m.artifactRef || metadata?.artifactRef;
  if (!artifactRef && m.id) {
    artifactRef = getArtifactRefFromLocal(m.id);
  }
  return {
    ...m,
    quotedMessage: m.quotedMessage || metadata?.quotedMessage || undefined,
    artifactRef: artifactRef || undefined,
  };
};

const updateTaskPlanStepStatus = (
  messages: Message[],
  taskPlanStep: any,
  newStatus: 'pending' | 'running' | 'completed'
): Message[] => {
  if (!taskPlanStep || !taskPlanStep.agentId) return messages;

  const taskPlanMsgIndex = [...messages]
    .reverse()
    .findIndex(
      m => m.type === 'task-plan' && m.metadata?.source === 'groupChatCollaboration'
    );
  if (taskPlanMsgIndex === -1) return messages;

  const actualIndex = messages.length - 1 - taskPlanMsgIndex;
  const taskPlanMsg = messages[actualIndex];
  const steps = taskPlanMsg.metadata?.taskPlan || [];

  let updated = false;
  const updatedSteps = steps.map((step: any) => {
    if (updated || step.agentId !== taskPlanStep.agentId) {
      return step;
    }
    if (step.status === 'completed' && newStatus !== 'completed') {
      return step;
    }
    updated = true;
    return { ...step, status: newStatus };
  });

  if (!updated) {
    let fallbackUpdated = false;
    const finalSteps = steps.map((step: any) => {
      if (!fallbackUpdated && step.agentId === taskPlanStep.agentId) {
        fallbackUpdated = true;
        return { ...step, status: newStatus };
      }
      return step;
    });
    return messages.map((m, idx) =>
      idx === actualIndex
        ? {
            ...m,
            metadata: {
              ...m.metadata,
              taskPlan: finalSteps,
            },
          }
        : m
    );
  }

  return messages.map((m, idx) =>
    idx === actualIndex
      ? {
          ...m,
          metadata: {
            ...m.metadata,
            taskPlan: updatedSteps,
          },
        }
      : m
  );
};

const completeAllTaskPlanSteps = (messages: Message[]): Message[] => {
  const taskPlanMsgIndex = [...messages]
    .reverse()
    .findIndex(
      m => m.type === 'task-plan' && m.metadata?.source === 'groupChatCollaboration'
    );
  if (taskPlanMsgIndex === -1) return messages;

  const actualIndex = messages.length - 1 - taskPlanMsgIndex;
  const taskPlanMsg = messages[actualIndex];
  const steps = taskPlanMsg.metadata?.taskPlan || [];

  const updatedSteps = steps.map((step: any) => ({
    ...step,
    status: 'completed' as const,
  }));

  return messages.map((m, idx) =>
    idx === actualIndex
      ? {
          ...m,
          metadata: {
            ...m.metadata,
            taskPlan: updatedSteps,
          },
        }
      : m
  );
};

const mergeRunSteps = (
  existingSteps: any[] | undefined,
  incomingSteps: any[] | undefined,
  freshStepId?: string,
  freshStep?: any
): any[] => {
  const stepsToProcess = incomingSteps || existingSteps || [];
  return stepsToProcess.map((s: any) => {
    const existing = existingSteps?.find(x => x.id === s.id);

    // 1. Determine the log: use the longer one
    const incomingLog = s.log || s.logs || '';
    const existingLog = existing?.log || existing?.logs || '';
    let finalLog = incomingLog.length >= existingLog.length ? incomingLog : existingLog;

    // 2. Determine the status:
    let finalStatus = s.status;

    // If this is the fresh step passed from the event
    if (freshStepId && s.id === freshStepId) {
      if (freshStep) {
        finalStatus = freshStep.status || finalStatus;
        const freshLog = freshStep.log || freshStep.logs || '';
        if (freshLog.length > finalLog.length) {
          finalLog = freshLog;
        }
      }
    }

    // If the existing status is more advanced and incoming is 'pending', keep existing to avoid rollback
    if (existing && existing.status !== 'pending' && finalStatus === 'pending') {
      finalStatus = existing.status;
    }

    return {
      ...s,
      ...((freshStepId && s.id === freshStepId && freshStep) ? freshStep : {}),
      status: finalStatus,
      log: finalLog,
      logs: finalLog,
      description: s.description || s.task || existing?.description || existing?.task || ''
    };
  });
};
const updateSandboxStatusMessage = (state: any, conversationId: string, runId: string): any => {
  const run = state.runDetailsById[runId];
  if (!run) return state;

  const msgId = `sandbox-status-${runId}`;
  const targetMessages = state.conversationMessages[conversationId] || (state.activeConversationId === conversationId ? state.messages : []);
  const existingMsgIndex = targetMessages.findIndex((m: any) => m.id === msgId);

  // Format steps status list
  const stepsMarkdown = (run.steps || []).map((step: any, idx: number) => {
    let statusEmoji = '⏳';
    let statusText = '等待中';
    if (step.status === 'running') {
      statusEmoji = '🚀';
      statusText = '进行中';
    } else if (step.status === 'completed') {
      statusEmoji = '✅';
      statusText = '已完成';
    } else if (step.status === 'failed') {
      statusEmoji = '❌';
      statusText = '失败';
    } else if (step.status === 'conflict') {
      statusEmoji = '⚠️';
      statusText = '检测到冲突';
    } else if (step.status === 'blocked') {
      statusEmoji = '🚫';
      statusText = '已阻止';
    }

    const detail = step.description ? ` - *${step.description}*` : '';
    return `${idx + 1}. ${statusEmoji} **${step.agentName}**: ${statusText}${detail}`;
  }).join('\n');

  let titleEmoji = '⚙️';
  let runStatusText = '任务进行中';
  let runModeLabel = '';
  if (run.runMode === 'write') {
    runModeLabel = ' (写入任务)';
  } else if (run.runMode === 'deploy') {
    runModeLabel = ' (部署任务)';
  } else if (run.runMode === 'read') {
    runModeLabel = ' (只读任务)';
  }

  let subtext = '';
  if (run.status === 'queued') {
    titleEmoji = '⏳';
    runStatusText = `任务排队中${run.queuePosition ? ` (队列位置: 第 ${run.queuePosition} 位)` : ''}`;
    subtext = '\n\n> ⚠️ **同一工作区已有写入/部署任务正在执行，本任务将在前一个任务完成后自动开始。**';
  } else if (run.status === 'completed') {
    titleEmoji = '✅';
    runStatusText = '任务已完成';
  } else if (run.status === 'failed') {
    titleEmoji = '❌';
    runStatusText = '任务失败';
  } else if (run.status === 'conflict') {
    titleEmoji = '⚠️';
    runStatusText = '检测到代码冲突';
  } else if (run.status === 'cancelled') {
    titleEmoji = '🚫';
    runStatusText = '任务已取消';
  }

  const defaultPlaceholder = run.status === 'queued'
    ? '*排队等待锁定工作区 (沙箱启动后将生成执行计划)*'
    : '*暂无规划步骤*';

  const content = `### ${titleEmoji} 沙箱运行: ${runStatusText}${runModeLabel}\n\n**任务**: ${run.prompt}${subtext}\n\n**子 Agent 执行过程**:\n${stepsMarkdown || defaultPlaceholder}\n\n${run.summary ? `**结果总结**: ${run.summary}` : ''}`;

  const message: Message = {
    id: msgId,
    conversationId,
    senderId: 'system',
    senderName: '沙箱系统',
    role: 'system',
    type: 'status',
    content,
    createdAt: run.createdAt || getCurrentFullTime()
  };

  if (existingMsgIndex === -1 && ['completed', 'failed', 'cancelled'].includes(run.status)) {
    return state;
  }

  const updatedMessages = [...targetMessages];
  if (existingMsgIndex > -1) {
    updatedMessages[existingMsgIndex] = message;
  } else {
    updatedMessages.push(message);
    updatedMessages.sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt).getTime() || 0;
      const timeB = new Date(b.createdAt).getTime() || 0;
      return timeA - timeB;
    });
  }


  const nextState = {
    ...state,
    conversationMessages: {
      ...(state.conversationMessages || {}),
      [conversationId]: updatedMessages
    }
  };

  if (state.activeConversationId === conversationId) {
    nextState.messages = updatedMessages;
  }

  return nextState;
};

const updateArtifactsInState = (state: any, conversationId: string, artifactsList: Artifact[], runId?: string) => {
  const activeConv = state.conversations.find((c: any) => c.id === conversationId);
  const workspaceId = activeConv?.workspaceId;

  // 1. Update conversation level
  const updatedConversationArtifacts = { ...state.conversationArtifacts };
  const convList = [...(updatedConversationArtifacts[conversationId] || [])];
  artifactsList.forEach((art: any) => {
    const artWithRunId = { ...art, runId: runId || art.runId, workspaceId };
    const idx = convList.findIndex(a => a.id === artWithRunId.id && a.runId === artWithRunId.runId);
    if (idx > -1) {
      convList[idx] = { ...convList[idx], ...artWithRunId };
    } else {
      convList.push(artWithRunId);
    }
  });
  updatedConversationArtifacts[conversationId] = convList;

  // 2. Update workspace level
  const updatedWorkspaceArtifacts = { ...state.workspaceArtifacts };
  if (workspaceId) {
    const wsList = [...(updatedWorkspaceArtifacts[workspaceId] || [])];
    artifactsList.forEach((art: any) => {
      const artWithRunId = { ...art, runId: runId || art.runId, workspaceId };
      const idx = wsList.findIndex(a => a.id === artWithRunId.id && a.runId === artWithRunId.runId);
      if (idx > -1) {
        wsList[idx] = { ...wsList[idx], ...artWithRunId };
      } else {
        wsList.push(artWithRunId);
      }
    });
    updatedWorkspaceArtifacts[workspaceId] = wsList;
  }

  // 3. Compute active artifacts (for the CURRENTLY ACTIVE conversation)
  const currentActiveConvId = state.activeConversationId;
  const currentActiveConv = state.conversations.find((c: any) => c.id === currentActiveConvId);
  const currentWorkspaceId = currentActiveConv?.workspaceId;
  const updatedArtifacts = currentWorkspaceId 
    ? (updatedWorkspaceArtifacts[currentWorkspaceId] || []) 
    : (updatedConversationArtifacts[currentActiveConvId || ''] || []);

  const updatedVersions = { ...state.artifactVersions };
  artifactsList.forEach((art: any) => {
    delete updatedVersions[art.id];
  });

  return {
    artifacts: updatedArtifacts,
    conversationArtifacts: updatedConversationArtifacts,
    workspaceArtifacts: updatedWorkspaceArtifacts,
    artifactVersions: updatedVersions
  };
};




interface AgentHubStore {
  conversations: Conversation[];
  /** 可用 Agent 列表（enabled=true && status!="disabled"），用于联系人列表/群聊选择等普通场景 */
  agents: Agent[];
  /** 管理用全量 Agent 列表（enabled=true，含 status="disabled"），用于管理/配置弹窗 */
  allAgents: Agent[];
  modelProviders: ModelProvider[];
  modelCredentials: ModelCredential[];
  modelConfigs: ModelConfig[];
  toolCatalog: AgentToolCatalogItem[];
  messages: Message[];
  artifacts: Artifact[];
  artifactVersions: Record<string, ArtifactVersion[]>;
  pins: PinItem[];
  memories: MemoryItem[];
  activeConversationId: string | null;
  selectedArtifactId: string | null;
  selectedArtifactVersion: number | null;
  isNewConversationOpen: boolean;
  preselectedAgentId: string | null;
  isProcessing: boolean;
  isFullScreenOpen: boolean;
  selectedAgentId: string | null;
  configuringAgentId: string | null;
  configuringAgentIsSessionLevel: boolean;
  leftSidebarViewMode: 'conversations' | 'agents' | 'agent-detail' | 'files' | 'workspace' | 'notifications' | 'settings';
  useMockMode: boolean;
  wsStatus: 'connecting' | 'connected' | 'disconnected';

  // Server-side Workspaces
  serverWorkspaces: WorkspaceItem[];
  serverDeletedWorkspaces: WorkspaceItem[];
  serverCurrentWorkspace: WorkspaceItem | null;
  serverWorkspaceTree: ServerWorkspaceTreeNode | null;
  serverSelectedFileContent: FileContentData | null;
  serverWorkspaceTotal: number;
  serverWorkspacePage: number;
  serverWorkspacePageSize: number;

  fetchServerWorkspaces: (status?: 'active' | 'deleted' | 'all', page?: number) => Promise<void>;
  createServerWorkspace: (name: string) => Promise<WorkspaceItem | null>;
  renameServerWorkspace: (id: string, name: string) => Promise<void>;
  deleteServerWorkspace: (id: string) => Promise<void>;
  restoreServerWorkspace: (id: string) => Promise<void>;
  purgeServerWorkspace: (id: string) => Promise<void>;
  loadServerWorkspaceTree: (id: string) => Promise<void>;
  loadServerFileContent: (id: string, path: string) => Promise<string>;
  saveServerFileContent: (id: string, path: string, content: string) => Promise<boolean>;
  uploadServerFile: (id: string, dir: string, file: File) => Promise<void>;

  // Desktop specific states
  currentWorkspace: WorkspaceInfo | null;
  workspaceStatus: 'none' | 'loading' | 'active' | 'unavailable' | 'error';
  recentWorkspaces: WorkspaceInfo[];
  workspaceFiles: FileNode[];
  workspaceSearchKeyword: string;
  workspaceContextFiles: string[];
  selectedWorkspaceFilePath: string | null;
  selectedWorkspaceFileContent: string | null;
  localAgentProcesses: AgentProcessInfo[];
  localAgentLogs: Record<string, string[]>;
  localAgentLoading: Record<string, boolean>;
  desktopNotifications: { id: string; title: string; body: string; timestamp: string; type: string; isRead: boolean }[];
  isDesktop: boolean;

  // Phase 3 states
  replyContext: { id: string; senderName: string; content: string } | null;
  quoteArtifactRef: ArtifactReference | null;
  webSearchMode: 'auto' | 'force' | 'off';

  // ============ v4 新增：Agent 一对一专属对话系统 ============
  showAgentProfile: boolean;
  viewingAgentId: string | null;
  showAgentChatView: boolean;
  agentChats: AgentChat[];
  currentAgentChatId: string | null;
  agentChatMessages: Record<string, AgentChatMessage[]>;

  setShowAgentChatView: (show: boolean) => void;

  openAgentProfile: (agentId: string, isSessionLevel?: boolean) => void;
  closeAgentProfile: () => void;
  getOrCreateAgentChat: (agentId: string) => Promise<Conversation>;
  sendAgentChatMessage: (agentChatId: string, content: string) => Promise<void>;

  // Actions
  initStore: () => Promise<void>;
  setUseMockMode: (mode: boolean) => Promise<void>;
  setActiveConversationId: (id: string | null) => Promise<void>;
  setSelectedArtifactId: (id: string | null) => void;
  setSelectedArtifactVersion: (version: number | null) => void;
  setIsNewConversationOpen: (open: boolean) => void;
  setPreselectedAgentId: (id: string | null) => void;
  setIsFullScreenOpen: (open: boolean) => void;
  setSelectedAgentId: (id: string | null) => void;
  setConfiguringAgentId: (id: string | null, isSessionLevel?: boolean) => void;
  setLeftSidebarViewMode: (mode: 'conversations' | 'agents' | 'agent-detail' | 'files' | 'workspace' | 'notifications' | 'settings') => void;
  
  // Phase 3 Actions
  setReplyContext: (reply: { id: string; senderName: string; content: string } | null) => void;
  setQuoteArtifactRef: (ref: ArtifactReference | null) => void;
  setWebSearchMode: (mode: 'auto' | 'force' | 'off') => void;

  // User and Settings state
  currentUser: { id?: string; name: string; email: string; avatar: string; isLoggedIn: boolean } | null;
  settings: {
    theme: 'light' | 'dark';
    apiKey: string;
    activeProvider: string;
    modelName: string;
    temperature: number;
    maxTokens: number;
    // Desktop Settings
    allowRead: boolean;
    allowWrite: boolean;
    confirmBeforeWrite: boolean;
    defaultSaveDir: string;
    autoOverwrite: boolean;
    enableNotifications: boolean;
    notifyOnTaskCompleted: boolean;
    notifyOnArtifactCreated: boolean;
    notifyOnAgentError: boolean;
  };
  isSettingsOpen: boolean;
  conversationAgentConfigs: Record<string, Record<string, Agent>>;
  saveConversationAgentConfig: (conversationId: string, agentId: string, updatedAgent: Agent) => Promise<void>;

  login: (email: string, password?: string) => Promise<{ success: boolean; message: string }>;
  register: (name: string, email: string, password: string, avatar: string) => Promise<{ success: boolean; message: string }>;
  loginAsGuest: (name: string, email: string, avatar: string) => Promise<void>;
  logout: () => void;
  loadBusinessData: () => Promise<void>;
  updateProfile: (name: string, email: string, avatar: string) => Promise<void>;
  updateSettings: (settings: Partial<AgentHubStore['settings']>) => Promise<void>;
  setIsSettingsOpen: (open: boolean) => void;
  
  loadModelProviders: () => Promise<void>;
  loadModelCredentials: () => Promise<void>;
  loadModelConfigs: () => Promise<void>;
  loadToolCatalog: () => Promise<void>;
  createModelCredential: (payload: { name: string; provider: string; credentialType: string; secret: string }) => Promise<void>;
  updateModelCredential: (id: string, payload: { name?: string; provider?: string; credentialType?: string; secret?: string }) => Promise<void>;
  deleteModelCredential: (id: string) => Promise<void>;
  createModelConfig: (payload: { name: string; provider: string; protocol: string; modelName: string; baseUrl?: string | null; credentialRef?: string | null; extraConfig: Record<string, any> }) => Promise<void>;
  updateModelConfig: (id: string, payload: { name?: string; provider?: string; protocol?: string; modelName?: string; baseUrl?: string | null; credentialRef?: string | null; extraConfig?: Record<string, any> }) => Promise<void>;
  deleteModelConfig: (id: string) => Promise<void>;

  loadConversationData: (convId: string) => Promise<void>;
  createConversation: (payload: CreateConversationPayload) => Promise<void>;
  getMentionAgents: (keyword?: string) => Promise<AgentMentionItem[]>;
  compressContext: () => Promise<void>;
  togglePinMessage: (messageId: string) => Promise<void>;
  deleteMemory: (memoryId: string) => Promise<void>;
  updateMemory: (memoryId: string, content: string, category?: MemoryCategory) => Promise<void>;
  saveEditedArtifact: (artifactId: string, newContent: string) => Promise<void>;
  
  sendMessage: (content: string, attachments?: MessageAttachment[], targetAgentId?: string, useSandbox?: boolean, webSearchMode?: 'auto' | 'force' | 'off') => Promise<void>;
  saveAgent: (agent: Agent) => Promise<void>;
  createAgent: (agent: Omit<Agent, 'id' | 'lastUsedAt'>) => Promise<string>;
  deleteAgent: (agentId: string) => Promise<void>;
  /** 隐藏/停用 Agent（PUT status: "disabled"），从普通列表移除但管理弹窗仍可见 */
  disableAgent: (agentId: string) => Promise<void>;
  /** 恢复已隐藏 Agent（PUT status: "online"），加回普通列表 */
  restoreAgent: (agentId: string) => Promise<void>;
  /** 加载管理用全量列表（含 status="disabled" 的 Agent） */
  loadAllAgents: () => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  renameConversation: (id: string, newTitle: string) => Promise<void>;
  togglePinConversation: (id: string) => Promise<void>;
  toggleArchiveConversation: (id: string) => Promise<void>;
  loadArtifactContent: (artifactId: string) => Promise<void>;
  getContextUsage: () => Promise<void>;
  setContextUsage: (usage: ContextUsage) => void;
  
  connectWS: () => Promise<void>;
  disconnectWS: () => void;
  addAgentToConversation: (conversationId: string, agentId: string) => Promise<void>;
  removeAgentFromConversation: (conversationId: string, agentId: string) => Promise<void>;

  // Sandbox V1 States - 按会话和 runId 分离状态模型
  runsByConversationId: Record<string, string[]>;
  activeRunIdByConversationId: Record<string, string | null>;
  runDetailsById: Record<string, any>; // AgentRunDetail
  runFilesByRunId: Record<string, any[]>; // SandboxFile[]
  runConflictsByRunId: Record<string, any[]>; // SandboxConflict[]
  runFileContentsByRunId: Record<string, Record<string, string>>;
  selectedSandboxFilePathByRunId: Record<string, string | null>;
  rightPanelTab: 'artifacts' | 'sandbox' | 'file-preview';
  workspaces: Workspace[];
  fileTreeByRunId: Record<string, WorkspaceTreeNode>;
  /** Orchestrator 规划阶段追踪，key=runId，value=已到达的 phase 列表（按时序） */
  planningPhaseByRunId: Record<string, string[]>;
  runRetryProgress: Record<string, { attempt: number; maxAttempts: number; message: string }>;
  sandboxDebugLogs: {
    id: string;
    timestamp: string;
    type: 'ws_in' | 'ws_out' | 'http_req' | 'http_res' | 'http_err';
    name: string;
    payload: any;
    method?: string;
  }[];
  
  // Sandbox V1 Actions
  addSandboxDebugLog: (
    type: 'ws_in' | 'ws_out' | 'http_req' | 'http_res' | 'http_err',
    name: string,
    payload: any,
    method?: string
  ) => void;
  clearSandboxDebugLogs: () => void;
  setRightPanelTab: (tab: 'artifacts' | 'sandbox' | 'file-preview') => void;
  getActiveRunId: (conversationId: string | null) => string | null;
  getActiveRun: (conversationId: string | null) => any | null;
  setSelectedSandboxFilePath: (runId: string | null, path: string | null) => void;
  getSelectedSandboxFilePath: (runId: string | null) => string | null;
  createSandboxRun: (prompt: string, environmentProfile?: any) => Promise<void>;
  loadSandboxRunList: (conversationId: string) => Promise<void>;
  loadSandboxRunDetail: (runId: string) => Promise<void>;
  loadSandboxFiles: (runId: string) => Promise<void>;
  loadSandboxFileContent: (runId: string, path: string) => Promise<string>;
  loadSandboxConflicts: (runId: string) => Promise<void>;
  resolveSandboxConflict: (runId: string, conflictId: string, resolution: 'current' | 'incoming' | 'manual', content?: string) => Promise<void>;
  cancelSandboxRun: (runId: string) => Promise<void>;
  rollbackSandboxRun: (runId: string) => Promise<void>;
  retrySandboxRun: (runId: string) => Promise<void>;
  loadWorkspaces: () => Promise<void>;
  createWorkspace: (name: string) => Promise<Workspace | null>;
  loadSandboxFileTree: (runId: string) => Promise<WorkspaceTreeNode | null>;
  bindConversationWorkspace: (conversationId: string, workspaceId: string | null) => Promise<void>;
  
  // Desktop Actions
  setWorkspaceSearchKeyword: (keyword: string) => void;
  selectWorkspace: () => Promise<void>;
  scanWorkspace: () => Promise<void>;
  clearWorkspace: () => Promise<void>;
  removeRecentWorkspace: (workspacePath: string) => Promise<void>;
  setSelectedWorkspaceFilePath: (path: string | null) => void;
  loadWorkspaceFileContent: (path: string) => Promise<string>;
  saveWorkspaceFileContent: (path: string, content: string) => Promise<boolean>;
  addFileToContext: (path: string) => void;
  removeFileFromContext: (path: string) => void;
  clearFileContext: () => void;
  loadLocalAgents: () => Promise<void>;
  startLocalAgent: (id: string) => Promise<void>;
  stopLocalAgent: (id: string) => Promise<void>;
  restartLocalAgent: (id: string) => Promise<void>;
  loadLocalAgentLogs: (id: string) => Promise<void>;
  applyArtifactToLocal: (artifactId: string, versionId: string, targetPath: string, autoOverwrite?: boolean) => Promise<{ success: boolean; error?: string; conflict?: boolean }>;
  addDesktopNotification: (title: string, body: string, type: string, eventType?: 'task' | 'artifact' | 'error' | 'step') => void;
  markNotificationAsRead: (id: string) => void;
  clearNotifications: () => void;

  // Floating Chat Specific properties
  floatingConversations: FloatingConversation[];
  conversationMessages: Record<string, Message[]>;
  conversationHasMore: Record<string, boolean>;
  isLoadingMoreMessages: boolean;
  conversationArtifacts: Record<string, Artifact[]>;
  workspaceArtifacts: Record<string, Artifact[]>;
  conversationSelectedArtifactId: Record<string, string | null>;
  conversationPins: Record<string, PinItem[]>;
  conversationMemories: Record<string, MemoryItem[]>;
  addFloatingConversation: (id: string, x?: number, y?: number) => void;
  removeFloatingConversation: (id: string) => void;
  updateFloatingConversation: (id: string, updates: Partial<FloatingConversation>) => void;
  sendMessageToConversation: (convId: string, content: string, attachments?: any[], targetAgentId?: string, useSandbox?: boolean, webSearchMode?: 'auto' | 'force' | 'off') => Promise<void>;
  loadMoreMessages: (convId: string) => Promise<void>;
}

const mergeLocalFlags = (list: Conversation[]): Conversation[] => {
  try {
    const pinned = JSON.parse(localStorage.getItem('ag_pinned_conversations') || '[]');
    const archived = JSON.parse(localStorage.getItem('ag_archived_conversations') || '[]');
    return list.map(c => ({
      ...c,
      isPinned: pinned.includes(c.id),
      isArchived: archived.includes(c.id)
    }));
  } catch (e) {
    console.error('Error loading pinned/archived lists from localStorage', e);
    return list;
  }
};

export const useAgentHubStore = create<AgentHubStore>()((set, get) => ({
  conversations: [],
  agents: [],
  allAgents: [],
  modelProviders: [],
  modelCredentials: [],
  modelConfigs: [],
  toolCatalog: [],
  messages: [],
  floatingConversations: [],
  conversationMessages: {},
  conversationHasMore: {},
  isLoadingMoreMessages: false,
  conversationArtifacts: {},
  workspaceArtifacts: {},
  conversationSelectedArtifactId: {},
  conversationPins: {},
  conversationMemories: {},
  artifacts: [],
  artifactVersions: {},
  pins: [],
  memories: [],
  activeConversationId: null,
  selectedArtifactId: null,
  selectedArtifactVersion: null,
  isNewConversationOpen: false,
  preselectedAgentId: null,
  isProcessing: false,
  isFullScreenOpen: false,
  selectedAgentId: null,
  configuringAgentId: null,
  configuringAgentIsSessionLevel: false,
  leftSidebarViewMode: 'conversations',
  useMockMode: USE_MOCK,
  wsStatus: 'disconnected',

  // Server-side Workspaces
  serverWorkspaces: [],
  serverDeletedWorkspaces: [],
  serverCurrentWorkspace: null,
  serverWorkspaceTree: null,
  serverSelectedFileContent: null,
  serverWorkspaceTotal: 0,
  serverWorkspacePage: 1,
  serverWorkspacePageSize: 20,

  // Desktop specific states
  currentWorkspace: null,
  workspaceStatus: 'none',
  recentWorkspaces: [],
  workspaceFiles: [],
  workspaceSearchKeyword: '',
  workspaceContextFiles: [],
  selectedWorkspaceFilePath: null,
  selectedWorkspaceFileContent: null,
  localAgentProcesses: [],
  localAgentLogs: {},
  localAgentLoading: {},
  desktopNotifications: [],
  isDesktop: platform.isDesktop(),

  // Phase 3 states
  replyContext: null,
  quoteArtifactRef: null,
  webSearchMode: 'auto',

  // v4 新增初始状态
  showAgentProfile: false,
  viewingAgentId: null,
  showAgentChatView: false,
  agentChats: [],
  currentAgentChatId: null,
  agentChatMessages: {},

  // User and Settings initial state
  currentUser: null,
  settings: {
    theme: 'light',
    apiKey: '',
    activeProvider: 'custom',
    modelName: 'gpt-4o',
    temperature: 0.7,
    maxTokens: 4096,
    // Desktop initial settings
    allowRead: true,
    allowWrite: true,
    confirmBeforeWrite: true,
    defaultSaveDir: '',
    autoOverwrite: false,
    enableNotifications: true,
    notifyOnTaskCompleted: true,
    notifyOnArtifactCreated: true,
    notifyOnAgentError: true,
  },
  isSettingsOpen: false,
  conversationAgentConfigs: {},

  // Sandbox V1 States - 按会话和 runId 分离状态模型
  runsByConversationId: {},
  activeRunIdByConversationId: {},
  runDetailsById: {},
  runFilesByRunId: {},
  runConflictsByRunId: {},
  runFileContentsByRunId: {},
  selectedSandboxFilePathByRunId: {},
  rightPanelTab: 'artifacts',
  workspaces: [],
  fileTreeByRunId: {},
  planningPhaseByRunId: {},
  runRetryProgress: {},
  sandboxDebugLogs: [],

  loadBusinessData: async () => {
    try {
      const agentRes = await getAgentList({ includeDisabled: true });
      if (agentRes.code === 0) {
        set({ agents: agentRes.data.list as Agent[] });
      }
      const convRes = await getConversationList();
      if (convRes.code === 0) {
        const list = convRes.data.list;
        set({ conversations: mergeLocalFlags(list) });
        await get().fetchServerWorkspaces('active');
        await get().fetchServerWorkspaces('deleted');
        if (list.length > 0) {
          set({ activeConversationId: list[0].id });
          await get().loadConversationData(list[0].id);
        } else {
          set({ activeConversationId: null, messages: [], pins: [], memories: [] });
        }
      }
      
      // Load new model-related items
      await get().loadModelProviders();
      await get().loadModelCredentials();
      await get().loadModelConfigs();
      await get().loadToolCatalog();
      
      await get().connectWS();
    } catch (e) {
      console.error('Failed to load business data', e);
    }
  },

  initStore: async () => {
    // Register HTTP logger for debugging sandbox
    registerHttpLogger(get().addSandboxDebugLog);

    // Initialize registered users database if not present
    try {
      if (!localStorage.getItem('ag_registered_users')) {
        const defaultUsers = [
          {
            name: '比特骑士',
            email: 'admin@northcore.ai',
            password: 'admin123',
            avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=150&h=150&q=80'
          }
        ];
        localStorage.setItem('ag_registered_users', JSON.stringify(defaultUsers));
      }
    } catch (e) {
      console.warn('Failed to initialize registered users', e);
    }

    // Load mock mode preference from localStorage
    try {
      const storedMockMode = localStorage.getItem('ag_use_mock_mode');
      if (storedMockMode !== null) {
        set({ useMockMode: storedMockMode === 'true' });
      }
    } catch (e) {
      console.warn('Failed to load mock mode from localStorage', e);
    }

    // Load from LocalStorage
    try {
      const storedConfigs = localStorage.getItem('ag_conversation_agent_configs');
      if (storedConfigs) {
        set({ conversationAgentConfigs: JSON.parse(storedConfigs) });
      }
    } catch (e) {
      console.warn('Failed to load conversation agent configs', e);
    }

    try {
      const storedSettings = localStorage.getItem('ag_settings');
      if (storedSettings) {
        const parsedSettings = JSON.parse(storedSettings);
        set({ settings: { ...get().settings, ...parsedSettings } });
        
        // Apply theme
        if (parsedSettings.theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      }
    } catch (e) {
      console.warn('Failed to load settings from localStorage', e);
    }

    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const healthRes = await healthCheck();
        if (healthRes.code === 0) {
          console.log('[Store] 后端服务健康检查通过，启用真实 API 模式');
          
          // Verify authentication session
          const token = localStorage.getItem('auth_token');
          if (token) {
            try {
              const meRes = await getMeApi();
              const userData = meRes.code === 0 && meRes.data ? ((meRes.data as any).user || meRes.data) : null;
              if (userData && (userData.name || userData.email)) {
                const user = { ...userData, isLoggedIn: true };
                set({ currentUser: user as any });
                localStorage.setItem('ag_user', JSON.stringify(user));
              } else {
                localStorage.removeItem('auth_token');
                localStorage.removeItem('ag_user');
                set({ currentUser: null });
              }
            } catch (e) {
              localStorage.removeItem('auth_token');
              localStorage.removeItem('ag_user');
              set({ currentUser: null });
            }
          } else {
            const storedUser = localStorage.getItem('ag_user');
            if (storedUser) {
              set({ currentUser: JSON.parse(storedUser) });
            } else {
              set({ currentUser: null });
            }
          }

          // Load data (due to grace period backend fallback)
          await get().loadBusinessData();
        }
      } catch (e) {
        console.warn('[Store] 真实 API 连接失败，自动切换到 Mock 演示模式', e);
        set({ useMockMode: true });
        set({
          conversations: mergeLocalFlags(mockConversations),
          agents: initialAgents,
          messages: mockMessages,
          artifacts: mockArtifacts,
          artifactVersions: mockArtifactVersions.reduce((acc, v) => {
            if (!acc[v.artifactId]) acc[v.artifactId] = [];
            acc[v.artifactId].push(v);
            return acc;
          }, {} as Record<string, ArtifactVersion[]>),
          activeConversationId: mockConversations[0]?.id || null,
        });
        await get().loadModelProviders();
        await get().loadModelCredentials();
        await get().loadModelConfigs();
        await get().loadToolCatalog();
        if (mockConversations[0]?.id) {
          await get().loadConversationData(mockConversations[0].id);
        }
      }
    } else {
      console.log('[Store] 配置为 Mock 模式，使用本地模拟数据');
      
      // Mock mode user restore
      const storedUser = localStorage.getItem('ag_user');
      if (storedUser) {
        set({ currentUser: JSON.parse(storedUser) });
      }

      set({
        conversations: mergeLocalFlags(mockConversations),
        agents: initialAgents,
        messages: mockMessages,
        artifacts: mockArtifacts,
        artifactVersions: mockArtifactVersions.reduce((acc, v) => {
          if (!acc[v.artifactId]) acc[v.artifactId] = [];
          acc[v.artifactId].push(v);
          return acc;
        }, {} as Record<string, ArtifactVersion[]>),
        activeConversationId: mockConversations[0]?.id || null,
      });
      await get().loadModelProviders();
      await get().loadModelCredentials();
      await get().loadModelConfigs();
      await get().loadToolCatalog();
      if (mockConversations[0]?.id) {
        await get().loadConversationData(mockConversations[0].id);
      }
    }

    // Load workspace settings and state
    try {
      const settingsRes = await platform.settings.get();
      if (settingsRes.success && settingsRes.settings) {
        set(state => ({
          settings: { ...state.settings, ...settingsRes.settings }
        }));
      }

      const workspaceRes = await platform.workspace.getCurrent();
      if (workspaceRes.success && workspaceRes.workspace) {
        set({
          currentWorkspace: workspaceRes.workspace,
          workspaceStatus: (workspaceRes as any).status || 'active'
        });
        await get().scanWorkspace();
      }

      const recentRes = await platform.workspace.getRecent();
      if (recentRes.success && recentRes.workspaces) {
        set({ recentWorkspaces: recentRes.workspaces });
      }

      await get().loadLocalAgents();
    } catch (e) {
      console.warn('Failed to load platform capabilities/workspace in initStore:', e);
    }
  },

  setUseMockMode: async (mode) => {
    set({ useMockMode: mode });
    localStorage.setItem('ag_use_mock_mode', String(mode));
    
    if (mode) {
      console.log('[Store] 切换到 Mock 演示模式');
      set({
        conversations: mergeLocalFlags(mockConversations),
        agents: initialAgents,
        messages: mockMessages,
        artifacts: mockArtifacts,
        artifactVersions: mockArtifactVersions.reduce((acc, v) => {
          if (!acc[v.artifactId]) acc[v.artifactId] = [];
          acc[v.artifactId].push(v);
          return acc;
        }, {} as Record<string, ArtifactVersion[]>),
        activeConversationId: mockConversations[0]?.id || null,
      });
      if (mockConversations[0]?.id) {
        await get().loadConversationData(mockConversations[0].id);
      }
    } else {
      console.log('[Store] 切换到真实 API 模式');
      try {
        set({
          conversations: [],
          agents: [],
          messages: [],
          artifacts: [],
          artifactVersions: {},
          pins: [],
          memories: [],
          activeConversationId: null,
        });
        await get().loadBusinessData();
      } catch (e) {
        console.warn('[Store] 真实 API 模式加载失败，自动回退到 Mock 模式', e);
        set({ useMockMode: true });
        localStorage.setItem('ag_use_mock_mode', 'true');
      }
    }
  },

  setActiveConversationId: async (id) => {
    const state = get();
    const activeConv = id ? state.conversations.find(c => c.id === id) : null;
    const workspaceId = activeConv?.workspaceId;
    const cachedMessages = id ? (state.conversationMessages[id] || []) : [];
    const cachedArtifacts = id 
      ? (workspaceId ? (state.workspaceArtifacts[workspaceId] || []) : (state.conversationArtifacts[id] || []))
      : [];
    const cachedSelectedArtifactId = id ? (state.conversationSelectedArtifactId[id] || (cachedArtifacts[0]?.id || null)) : null;
    const cachedPins = id ? (state.conversationPins[id] || []) : [];
    const cachedMemories = id ? (state.conversationMemories[id] || []) : [];

    set({ 
      activeConversationId: id,
      selectedArtifactId: cachedSelectedArtifactId,
      selectedArtifactVersion: null,
      isProcessing: false,
      replyContext: null,
      quoteArtifactRef: null,
      messages: cachedMessages,
      artifacts: cachedArtifacts,
      pins: cachedPins,
      memories: cachedMemories,
      artifactVersions: {},
    });
    if (id) {
      await get().loadConversationData(id);
      if (wsClient.isConnected() && !get().useMockMode) {
        wsClient.send('conversation.subscribe', { conversationId: id });
      }
    }
  },

  loadModelProviders: async () => {
    const { useMockMode } = get();
    if (useMockMode) {
      set({ modelProviders: mockModelProviders });
      return;
    }
    try {
      const res = await modelService.getModelProviders();
      if (res.code === 0 && res.data) {
        set({ modelProviders: res.data });
      }
    } catch (e) {
      console.error('Failed to load model providers', e);
    }
  },

  loadModelCredentials: async () => {
    const { useMockMode } = get();
    if (useMockMode) {
      const cached = localStorage.getItem('mock_model_credentials');
      if (cached) {
        set({ modelCredentials: JSON.parse(cached) });
      } else {
        localStorage.setItem('mock_model_credentials', JSON.stringify(initialMockModelCredentials));
        set({ modelCredentials: initialMockModelCredentials });
      }
      return;
    }
    try {
      const res = await modelService.getModelCredentials();
      if (res.code === 0 && res.data) {
        set({ modelCredentials: res.data });
      }
    } catch (e) {
      console.error('Failed to load model credentials', e);
    }
  },

  loadModelConfigs: async () => {
    const { useMockMode } = get();
    if (useMockMode) {
      const cached = localStorage.getItem('mock_model_configs');
      if (cached) {
        set({ modelConfigs: JSON.parse(cached) });
      } else {
        localStorage.setItem('mock_model_configs', JSON.stringify(initialMockModelConfigs));
        set({ modelConfigs: initialMockModelConfigs });
      }
      return;
    }
    try {
      const res = await modelService.getModelConfigs();
      if (res.code === 0 && res.data) {
        set({ modelConfigs: res.data });
      }
    } catch (e) {
      console.error('Failed to load model configs', e);
    }
  },

  loadToolCatalog: async () => {
    const { useMockMode } = get();
    if (useMockMode) {
      const mockCatalog: AgentToolCatalogItem[] = [
        {
          id: 'workspace.read',
          name: '读取工作区',
          description: '读取工作区文件树、文件内容及扫描元数据',
          displayGroup: 'context',
          riskGroup: 'context_read',
          riskLevel: 'low',
          runtimes: ['native', 'claude_code', 'codex', 'opencode'],
          permissionKeys: ['canReadFiles'],
          requiresWorkspace: true,
          mutatesWorkspace: false
        },
        {
          id: 'memory.use',
          name: '长期记忆',
          description: '读取及更新与用户的长期记忆库',
          displayGroup: 'context',
          riskGroup: 'memory',
          riskLevel: 'low',
          runtimes: ['native'],
          permissionKeys: [],
          requiresWorkspace: false,
          mutatesWorkspace: false
        },
        {
          id: 'web.search',
          name: '联网搜索',
          description: '允许智能体通过搜索引擎获取最新外部资讯',
          displayGroup: 'context',
          riskGroup: 'external',
          riskLevel: 'medium',
          runtimes: ['native', 'opencode'],
          permissionKeys: [],
          requiresWorkspace: false,
          mutatesWorkspace: false
        },
        {
          id: 'workspace.write',
          name: '修改工作区',
          description: '在工作区直接创建或重写修改源代码文件',
          displayGroup: 'workspace',
          riskGroup: 'workspace_write',
          riskLevel: 'medium',
          runtimes: ['native', 'claude_code', 'codex', 'opencode'],
          permissionKeys: ['canReadFiles', 'canWriteFiles'],
          requiresWorkspace: true,
          mutatesWorkspace: true
        },
        {
          id: 'platform.runtime_write',
          name: '平台运行期写入',
          description: '允许运行期框架（Codex/Claude Code等）自由修改工作区文件',
          displayGroup: 'workspace',
          riskGroup: 'platform_write',
          riskLevel: 'medium',
          runtimes: ['claude_code', 'codex', 'opencode'],
          permissionKeys: ['canReadFiles', 'canWriteFiles'],
          requiresWorkspace: true,
          mutatesWorkspace: true
        },
        {
          id: 'environment.setup',
          name: '配置运行环境',
          description: '安装软件包及配置Python虚拟环境等环境变更操作',
          displayGroup: 'sandbox',
          riskGroup: 'command',
          riskLevel: 'high',
          runtimes: ['claude_code', 'codex', 'opencode'],
          permissionKeys: ['canRunCommands'],
          requiresWorkspace: true,
          mutatesWorkspace: true
        },
        {
          id: 'command.run',
          name: '执行系统命令',
          description: '在安全沙箱的本地终端内执行任意 Shell 命令行指令',
          displayGroup: 'sandbox',
          riskGroup: 'command',
          riskLevel: 'critical',
          runtimes: ['claude_code', 'opencode'],
          permissionKeys: ['canRunCommands'],
          requiresWorkspace: true,
          mutatesWorkspace: true
        },
        {
          id: 'artifact.generate',
          name: '生成交互产物',
          description: '生成独立前端交互产物（Artifact）并在右侧面板实时渲染预览',
          displayGroup: 'artifact',
          riskGroup: 'platform_write',
          riskLevel: 'low',
          runtimes: ['native', 'claude_code', 'codex', 'opencode'],
          permissionKeys: ['canGenerateArtifacts'],
          requiresWorkspace: false,
          mutatesWorkspace: false
        },
        {
          id: 'deploy.run',
          name: '发布部署应用',
          description: '将当前项目编译并一键发布部署为独立容器，可供公网访问',
          displayGroup: 'artifact',
          riskGroup: 'deploy',
          riskLevel: 'critical',
          runtimes: ['native', 'claude_code', 'codex', 'opencode'],
          permissionKeys: ['canDeploy'],
          requiresWorkspace: true,
          mutatesWorkspace: false
        }
      ];
      set({ toolCatalog: mockCatalog });
      return;
    }
    try {
      const res = await getAgentToolCatalog();
      if (res.code === 0 && res.data) {
        const catalogList = Array.isArray(res.data) 
          ? res.data 
          : (res.data && Array.isArray((res.data as any).list)) 
            ? (res.data as any).list 
            : [];
        set({ toolCatalog: catalogList });
      }
    } catch (e) {
      console.error('Failed to load agent tool catalog', e);
    }
  },

  createModelCredential: async (payload) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const newCred: ModelCredential = {
        id: 'cred-' + Date.now(),
        ownerUserId: '1',
        name: payload.name,
        provider: payload.provider,
        credentialType: payload.credentialType,
        configured: true,
        createdAt: getCurrentFullTime(),
        updatedAt: getCurrentFullTime()
      };
      const list = [...get().modelCredentials, newCred];
      set({ modelCredentials: list });
      localStorage.setItem('mock_model_credentials', JSON.stringify(list));
      return;
    }
    try {
      const res = await modelService.createModelCredential(payload);
      if (res.code === 0) {
        await get().loadModelCredentials();
      }
    } catch (e) {
      console.error('Failed to create model credential', e);
    }
  },

  updateModelCredential: async (id, payload) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const list = get().modelCredentials.map(c => c.id === id ? { ...c, ...payload, updatedAt: getCurrentFullTime() } : c);
      set({ modelCredentials: list });
      localStorage.setItem('mock_model_credentials', JSON.stringify(list));
      return;
    }
    try {
      const res = await modelService.updateModelCredential(id, payload);
      if (res.code === 0) {
        await get().loadModelCredentials();
      }
    } catch (e) {
      console.error('Failed to update model credential', e);
    }
  },

  deleteModelCredential: async (id) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const list = get().modelCredentials.filter(c => c.id !== id);
      set({ modelCredentials: list });
      localStorage.setItem('mock_model_credentials', JSON.stringify(list));
      return;
    }
    try {
      const res = await modelService.deleteModelCredential(id);
      if (res.code === 0) {
        await get().loadModelCredentials();
      }
    } catch (e) {
      console.error('Failed to delete model credential', e);
    }
  },

  createModelConfig: async (payload) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const newConfig: ModelConfig = {
        id: 'config-' + Date.now(),
        ownerUserId: '1',
        name: payload.name,
        provider: payload.provider,
        protocol: payload.protocol,
        modelName: payload.modelName,
        baseUrl: payload.baseUrl,
        credentialRef: payload.credentialRef,
        extraConfig: payload.extraConfig,
        createdAt: getCurrentFullTime(),
        updatedAt: getCurrentFullTime()
      };
      const list = [...get().modelConfigs, newConfig];
      set({ modelConfigs: list });
      localStorage.setItem('mock_model_configs', JSON.stringify(list));
      return;
    }
    try {
      const res = await modelService.createModelConfig(payload);
      if (res.code === 0) {
        await get().loadModelConfigs();
      }
    } catch (e) {
      console.error('Failed to create model config', e);
    }
  },

  updateModelConfig: async (id, payload) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const list = get().modelConfigs.map(c => c.id === id ? { ...c, ...payload, updatedAt: getCurrentFullTime() } : c);
      set({ modelConfigs: list });
      localStorage.setItem('mock_model_configs', JSON.stringify(list));
      return;
    }
    try {
      const res = await modelService.updateModelConfig(id, payload);
      if (res.code === 0) {
        await get().loadModelConfigs();
      }
    } catch (e) {
      console.error('Failed to update model config', e);
    }
  },

  deleteModelConfig: async (id) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const list = get().modelConfigs.filter(c => c.id !== id);
      set({ modelConfigs: list });
      localStorage.setItem('mock_model_configs', JSON.stringify(list));
      return;
    }
    try {
      const res = await modelService.deleteModelConfig(id);
      if (res.code === 0) {
        await get().loadModelConfigs();
      }
    } catch (e) {
      console.error('Failed to delete model config', e);
    }
  },

  setSelectedArtifactId: (id) => {
    set({ selectedArtifactId: id, selectedArtifactVersion: null });
    if (id) {
      get().loadArtifactContent(id);
    }
  },

  setSelectedArtifactVersion: (version) => set({ selectedArtifactVersion: version }),
  setIsNewConversationOpen: (open) => set({
    isNewConversationOpen: open,
    ...(open ? { configuringAgentId: null, configuringAgentIsSessionLevel: false } : {})
  }),
  setPreselectedAgentId: (id) => set({ preselectedAgentId: id }),
  setIsFullScreenOpen: (open) => set({ isFullScreenOpen: open }),
  setSelectedAgentId: (id) => set({ selectedAgentId: id }),
  setConfiguringAgentId: (id, isSessionLevel = false) => set({
    configuringAgentId: id,
    configuringAgentIsSessionLevel: id ? isSessionLevel : false
  }),
  setLeftSidebarViewMode: (mode) => set({ leftSidebarViewMode: mode }),

  loadConversationData: async (convId) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const activeMsgs = mockMessages.filter(m => m.conversationId === convId);
      const activeConv = get().conversations.find(c => c.id === convId);
      const workspaceId = activeConv?.workspaceId;

      // 1. Get conversation level artifacts
      const activeConvArts = mockArtifacts.filter(a => a.conversationId === convId);
      
      // 2. Get workspace level artifacts
      let activeWorkspaceArts: Artifact[] = [];
      if (workspaceId) {
        const siblingConvIds = get().conversations
          .filter(c => c.workspaceId === workspaceId)
          .map(c => c.id);
        activeWorkspaceArts = mockArtifacts.filter(
          a => a.workspaceId === workspaceId || siblingConvIds.includes(a.conversationId) || a.conversationId === convId
        ).map(a => ({ ...a, workspaceId }));
      }

      const activePins = activeMsgs.filter(m => m.isPinned).map(m => ({
        id: `pin-${m.id}`,
        conversationId: convId,
        messageId: m.id,
        createdAt: m.createdAt,
        message: m
      }));
      const mockMemories = [
        {
          id: `mem-${convId}-1`,
          conversationId: convId,
          category: 'constraint' as const,
          content: '用户偏好使用 TypeScript + TailwindCSS 进行前端组件化设计',
          confidence: 0.95,
          sourceMessageId: activeMsgs[0]?.id || 'msg-1',
          active: true,
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        },
        {
          id: `mem-${convId}-2`,
          conversationId: convId,
          category: 'project' as const,
          content: '当前项目为 AgentHub 多智能体协作平台，支持双向分栏与实时产物预览',
          confidence: 0.9,
          sourceMessageId: activeMsgs[0]?.id || 'msg-1',
          active: true,
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        },
        {
          id: `mem-${convId}-3`,
          conversationId: convId,
          category: 'preference' as const,
          content: '聊天信息交互需保持响应迅速，动画过渡流畅，并支持代码级划词引用',
          confidence: 0.88,
          sourceMessageId: activeMsgs[0]?.id || 'msg-1',
          active: true,
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime()
        }
      ];
      const currentMessages = get().messages;
      const currentArtifacts = get().artifacts;
      const currentPins = get().pins;
      const currentMemories = get().memories;

      const mergedMessages = activeMsgs.map(newMsg => {
        const existing = currentMessages.find(m => m.id === newMsg.id);
        if (existing) {
          const hasChanged = existing.content !== newMsg.content || 
                             existing.type !== newMsg.type ||
                             existing.isPinned !== newMsg.isPinned ||
                             JSON.stringify(existing.metadata) !== JSON.stringify(newMsg.metadata);
          return hasChanged ? { ...existing, ...newMsg } : existing;
        }
        return newMsg;
      });

      const mergedConvArtifacts = activeConvArts.map(newArt => {
        const existing = currentArtifacts.find(a => a.id === newArt.id);
        if (existing) {
          const hasChanged = existing.latestVersion !== newArt.latestVersion || 
                             existing.title !== newArt.title ||
                             existing.currentVersionId !== newArt.currentVersionId;
          return hasChanged ? { ...existing, ...newArt } : existing;
        }
        return newArt;
      });

      const mergedWorkspaceArtifacts = activeWorkspaceArts.map(newArt => {
        const existing = currentArtifacts.find(a => a.id === newArt.id);
        if (existing) {
          const hasChanged = existing.latestVersion !== newArt.latestVersion || 
                             existing.title !== newArt.title ||
                             existing.currentVersionId !== newArt.currentVersionId;
          return hasChanged ? { ...existing, ...newArt } : existing;
        }
        return newArt;
      });

      const mergedPins = activePins.map(newPin => {
        const existing = currentPins.find(p => p.id === newPin.id);
        if (existing) {
          const hasChanged = JSON.stringify(existing.message) !== JSON.stringify(newPin.message);
          return hasChanged ? { ...existing, ...newPin } : existing;
        }
        return newPin;
      });

      const mergedMemories = mockMemories.map(newMem => {
        const existing = currentMemories.find(m => m.id === newMem.id);
        if (existing) {
          const hasChanged = existing.content !== newMem.content || existing.category !== newMem.category;
          return hasChanged ? { ...existing, ...newMem } : existing;
        }
        return newMem;
      });

      const isActive = get().activeConversationId === convId;
      
      const nextState: any = {
        conversationMessages: {
          ...get().conversationMessages,
          [convId]: mergedMessages
        },
        conversationHasMore: {
          ...get().conversationHasMore,
          [convId]: false
        },
        conversationArtifacts: {
          ...get().conversationArtifacts,
          [convId]: mergedConvArtifacts
        },
        workspaceArtifacts: {
          ...get().workspaceArtifacts,
          ...(workspaceId ? { [workspaceId]: mergedWorkspaceArtifacts } : {})
        },
        conversationPins: {
          ...get().conversationPins,
          [convId]: mergedPins
        },
        conversationMemories: {
          ...get().conversationMemories,
          [convId]: mergedMemories
        }
      };

      const finalArtifacts = workspaceId ? mergedWorkspaceArtifacts : mergedConvArtifacts;

      if (isActive) {
        nextState.messages = mergedMessages;
        nextState.artifacts = finalArtifacts;
        nextState.pins = mergedPins;
        nextState.memories = mergedMemories;
      }

      set(nextState);

      if (finalArtifacts.length > 0) {
        const cachedSelected = get().conversationSelectedArtifactId[convId] || finalArtifacts[0].id;
        const currentSelected = isActive ? get().selectedArtifactId : cachedSelected;
        const stillExists = finalArtifacts.some(a => a.id === currentSelected);
        const nextSelectedId = stillExists ? currentSelected : finalArtifacts[0].id;

        set({
          conversationSelectedArtifactId: {
            ...get().conversationSelectedArtifactId,
            [convId]: nextSelectedId
          },
          ...(isActive ? { selectedArtifactId: nextSelectedId } : {})
        });
      }
      return;
    }

    try {
      const activeConv = get().conversations.find(c => c.id === convId);
      const workspaceId = activeConv?.workspaceId;

      if (workspaceId) {
        let wsItem = get().serverWorkspaces.find(w => w.id === workspaceId);
        if (!wsItem) {
          await get().fetchServerWorkspaces('active');
          wsItem = get().serverWorkspaces.find(w => w.id === workspaceId);
        }
        if (wsItem) {
          set({ serverCurrentWorkspace: wsItem });
          get().loadServerWorkspaceTree(workspaceId).catch(() => {});
        } else {
          set({ serverCurrentWorkspace: null, serverWorkspaceTree: null });
        }
      } else {
        set({ serverCurrentWorkspace: null, serverWorkspaceTree: null });
      }

      const [msgRes, pinsRes, memoriesRes, artifactRes, wsArtifactRes] = await Promise.all([
        getMessageList(convId, { limit: 20 }),
        getPins(convId),
        getMemories(convId),
        getArtifactMetaList(convId),
        workspaceId ? getWorkspaceArtifacts(workspaceId) : Promise.resolve(null)
      ]);

      if (msgRes && msgRes.code === 40002) {
        set({
          messages: [],
          pins: [],
          memories: []
        });
        return;
      }

      // Load conversation-level agent configurations in parallel
      if (activeConv && activeConv.mode !== 'agent') {
        const agentIds = activeConv.agentIds || [];
        const configPromises = agentIds.map(async (agentId) => {
          try {
            const res = await getConversationAgentConfig(convId, agentId);
            if (res.code === 0 && res.data) {
              return { agentId, config: res.data };
            }
          } catch (e) {
            // fail-safe ignore
          }
          return null;
        });
        const configs = await Promise.all(configPromises);
        const newConfigs: Record<string, Agent> = {};
        configs.forEach(c => {
          if (c) {
            newConfigs[c.agentId] = c.config;
          }
        });
        if (Object.keys(newConfigs).length > 0) {
          set(state => ({
            conversationAgentConfigs: {
              ...state.conversationAgentConfigs,
              [convId]: {
                ...(state.conversationAgentConfigs[convId] || {}),
                ...newConfigs
              }
            }
          }));
        }
      }

      let pinsData: PinItem[] = [];
      if (pinsRes.code === 0 && pinsRes.data) {
        pinsData = pinsRes.data.map((p: PinItem) => ({
          ...p,
          message: p.message ? mapMessageMetadata(p.message) : p.message
        }));
      }

      let memoriesData: MemoryItem[] = [];
      if (memoriesRes.code === 0 && memoriesRes.data) {
        memoriesData = memoriesRes.data;
      }

      let messagesData: Message[] = [];
      let hasMore = false;
      if (msgRes.code === 0 && msgRes.data && msgRes.data.list) {
        const reversedList = [...msgRes.data.list].reverse();
        messagesData = reversedList.map((m: Message) => {
          const mapped = mapMessageMetadata(m);
          return {
            ...mapped,
            isPinned: pinsData.some(p => p.messageId === m.id)
          };
        });
        hasMore = msgRes.data.hasMore ?? false;
      }

      const currentMessages = get().messages;
      const currentArtifacts = get().artifacts;
      const currentPins = get().pins;
      const currentMemories = get().memories;

      const mergedMessages = messagesData.map(newMsg => {
        const existing = currentMessages.find(m => m.id === newMsg.id);
        if (existing) {
          const hasChanged = existing.content !== newMsg.content || 
                             existing.type !== newMsg.type ||
                             existing.isPinned !== newMsg.isPinned ||
                             JSON.stringify(existing.metadata) !== JSON.stringify(newMsg.metadata);
          return hasChanged ? { ...existing, ...newMsg } : existing;
        }
        return newMsg;
      });

      const mergedPins = pinsData.map(newPin => {
        const existing = currentPins.find(p => p.id === newPin.id);
        if (existing) {
          const hasChanged = JSON.stringify(existing.message) !== JSON.stringify(newPin.message);
          return hasChanged ? { ...existing, ...newPin } : existing;
        }
        return newPin;
      });

      const mergedMemories = memoriesData.map(newMem => {
        const existing = currentMemories.find(m => m.id === newMem.id);
        if (existing) {
          const hasChanged = existing.content !== newMem.content || existing.category !== newMem.category;
          return hasChanged ? { ...existing, ...newMem } : existing;
        }
        return newMem;
      });

      let mergedArtifacts: Artifact[] = [];
      if (artifactRes.code === 0 && artifactRes.data) {
        const arts: Artifact[] = artifactRes.data;
        mergedArtifacts = arts.map(newArt => {
          // Use composite unique key: artifact id + runId
          const existing = currentArtifacts.find(
            a => a.id === newArt.id && a.runId === newArt.runId
          );
          if (existing) {
            const hasChanged = existing.latestVersion !== newArt.latestVersion || 
                               existing.title !== newArt.title ||
                               existing.currentVersionId !== newArt.currentVersionId;
            return hasChanged ? { ...existing, ...newArt } : existing;
          }
          return newArt;
        });
      }

      let mergedWorkspaceArtifacts: Artifact[] = [];
      if (wsArtifactRes && wsArtifactRes.code === 0 && wsArtifactRes.data) {
        const arts: Artifact[] = wsArtifactRes.data;
        mergedWorkspaceArtifacts = arts.map(newArt => {
          const existing = currentArtifacts.find(
            a => a.id === newArt.id && a.runId === newArt.runId
          );
          if (existing) {
            const hasChanged = existing.latestVersion !== newArt.latestVersion || 
                               existing.title !== newArt.title ||
                               existing.currentVersionId !== newArt.currentVersionId;
            return hasChanged ? { ...existing, ...newArt } : existing;
          }
          return newArt;
        });
      }

      const isActive = get().activeConversationId === convId;

      const nextState: any = {
        conversationMessages: {
          ...get().conversationMessages,
          [convId]: mergedMessages
        },
        conversationHasMore: {
          ...get().conversationHasMore,
          [convId]: hasMore
        },
        conversationPins: {
          ...get().conversationPins,
          [convId]: mergedPins
        },
        conversationMemories: {
          ...get().conversationMemories,
          [convId]: mergedMemories
        },
        conversationArtifacts: {
          ...get().conversationArtifacts,
          [convId]: mergedArtifacts
        },
        workspaceArtifacts: {
          ...get().workspaceArtifacts,
          ...(workspaceId ? { [workspaceId]: mergedWorkspaceArtifacts } : {})
        }
      };

      const finalArtifacts = workspaceId ? mergedWorkspaceArtifacts : mergedArtifacts;

      if (isActive) {
        nextState.artifacts = finalArtifacts;
        nextState.messages = mergedMessages;
        nextState.pins = mergedPins;
        nextState.memories = mergedMemories;
      }

      set(nextState);

      if (finalArtifacts.length > 0) {
        const cachedSelected = get().conversationSelectedArtifactId[convId] || finalArtifacts[0].id;
        const currentSelected = isActive ? get().selectedArtifactId : cachedSelected;
        const stillExists = finalArtifacts.some(a => a.id === currentSelected);
        const nextSelectedId = stillExists ? currentSelected : finalArtifacts[0].id;

        set({
          conversationSelectedArtifactId: {
            ...get().conversationSelectedArtifactId,
            [convId]: nextSelectedId
          },
          ...(isActive ? { selectedArtifactId: nextSelectedId } : {})
        });

        if (nextSelectedId && isActive) {
          await get().loadArtifactContent(nextSelectedId);
        }
      }

      if (isActive) {
        await get().getContextUsage();
        await get().loadSandboxRunList(convId);
      }
    } catch (e: any) {
      console.error('[Store] 加载会话数据失败', e);
      const errCode = e?.response?.data?.code || e?.code;
      const errMsg = e?.response?.data?.message || e?.message || '';
      if (errCode === 40002 || errMsg.includes('40002') || (e?.response?.status === 400 && errCode === 40002)) {
        set({
          messages: [],
          pins: [],
          memories: []
        });
      }
    }
  },

  loadMoreMessages: async (convId) => {
    const { useMockMode, conversationHasMore, isLoadingMoreMessages, conversationMessages } = get();
    const hasMore = conversationHasMore[convId] ?? false;
    
    if (useMockMode || !hasMore || isLoadingMoreMessages) {
      return;
    }

    const currentMsgs = conversationMessages[convId] || [];
    if (currentMsgs.length === 0) {
      return;
    }

    set({ isLoadingMoreMessages: true });
    try {
      const oldestMsgId = currentMsgs[0].id;
      const res = await getMessageList(convId, { limit: 20, beforeId: oldestMsgId });
      
      if (res && res.code === 0 && res.data) {
        const list = res.data.list || [];
        const nextHasMore = res.data.hasMore ?? false;
        
        // Reverse list to match oldest-first ascending order
        const reversedList = [...list].reverse();
        const mappedList = reversedList.map((m: Message) => mapMessageMetadata(m));
        
        const updatedMsgs = [...mappedList, ...currentMsgs];
        const isActive = get().activeConversationId === convId;
        
        set((state: any) => ({
          conversationMessages: {
            ...state.conversationMessages,
            [convId]: updatedMsgs
          },
          conversationHasMore: {
            ...state.conversationHasMore,
            [convId]: nextHasMore
          },
          ...(isActive ? { messages: updatedMsgs } : {}),
        }));
      }
    } catch (e) {
      console.error('[Store] 加载更多历史消息失败', e);
    } finally {
      set({ isLoadingMoreMessages: false });
    }
  },

  createConversation: async (payload) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await createConversationApi(payload);
        if (res.code === 0) {
          set(state => ({ conversations: mergeLocalFlags([...state.conversations, res.data]) }));
          await get().setActiveConversationId(res.data.id);
        }
      } catch (e) {
        console.error('[Store] 创建会话 API 失败', e);
      }
    } else {
      const newConv: Conversation = {
        id: createId('conv'),
        title: payload.title,
        mode: payload.mode,
        agentIds: payload.agentIds,
        lastMessage: '',
        updatedAt: getCurrentFullTime(),
      };
      set(state => ({
        conversations: mergeLocalFlags([...state.conversations, newConv]),
      }));
      await get().setActiveConversationId(newConv.id);
    }
  },

  getMentionAgents: async (keyword) => {
    const { activeConversationId, conversations, agents } = get();
    if (!activeConversationId) return [];

    const activeConv = conversations.find(c => c.id === activeConversationId);
    const conversationAgentIds = activeConv ? activeConv.agentIds : [];

    const candidateAgents = agents.filter(a =>
      (conversationAgentIds.length > 0 ? conversationAgentIds.includes(a.id) : true) &&
      !a.category.includes('orchestrator') &&
      a.enabled === true &&
      a.status !== 'disabled'
    );

    const items: AgentMentionItem[] = candidateAgents
      .filter(a => !keyword || a.name.toLowerCase().includes(keyword.toLowerCase()))
      .map(a => ({
        id: a.id,
        name: a.name,
        avatar: a.avatar,
        description: a.description,
        tags: a.tags,
        status: a.status === 'online' ? 'online' : 'offline',
      }));
    return items;
  },

  compressContext: async () => {
    const { activeConversationId, useMockMode, messages } = get();
    if (!activeConversationId) return;

    const tempId = `temp-compress-${Date.now()}`;
    const tempMsg: Message = {
      id: tempId,
      conversationId: activeConversationId,
      senderId: 'system',
      senderName: '系统',
      role: 'system',
      type: 'status',
      content: '压缩上下文中...',
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      messages: [...state.messages, tempMsg],
    }));

    let result;
    let errorMessage = '';
    let apiMessage = '';

    if (!useMockMode) {
      try {
        const res = await compressContext(activeConversationId);
        if (res.code === 0) {
          result = res.data;
          apiMessage = res.message;
          if (result && result.contextUsage) {
            get().setContextUsage(result.contextUsage);
          }
        } else {
          errorMessage = res.message || '压缩接口返回失败';
        }
      } catch (e: any) {
        console.warn('[Store] compressContext API 调用失败', e);
        errorMessage = e.response?.data?.message || e.message || '压缩请求失败';
      }
    } else {
      const originalMessageCount = messages.length;
      result = {
        summary: {
          id: 'summary-mock',
          conversationId: activeConversationId,
          summary: `系统已智能压缩 ${originalMessageCount} 条历史消息，Token 占用大幅降低。`,
          coveredUntilMessageId: messages[messages.length - 1]?.id || '',
          coveredMessageCount: Math.max(1, Math.floor(originalMessageCount / 4)),
          version: 1,
          createdAt: getCurrentFullTime(),
          updatedAt: getCurrentFullTime(),
        },
        compressed: true,
        contextUsage: {
          contextUsagePercent: 5,
          contextUsageChars: 10000,
          contextLimitChars: 200000,
        },
      };
      apiMessage = '上下文已压缩';
    }

    if (result && result.contextUsage) {
      get().setContextUsage(result.contextUsage);
    }

    if (errorMessage) {
      const failMsg: Message = {
        id: createId('msg'),
        conversationId: activeConversationId,
        senderId: 'system',
        senderName: '系统',
        role: 'system',
        type: 'status',
        content: `❌ 压缩失败\n\n原因：${errorMessage}`,
        createdAt: getCurrentFullTime(),
      };
      set(state => ({
        messages: state.messages.map(m => m.id === tempId ? failMsg : m),
      }));

      if (!useMockMode) {
        try {
          await sendMessageNonStreaming(activeConversationId, {
            content: failMsg.content,
            role: 'system',
            senderId: 'system',
            senderName: '系统',
            type: 'status',
          } as any);
        } catch (e) {
          console.warn('Failed to save compress fail system message to backend', e);
        }
      }
    } else if (result) {
      let finalContent = apiMessage;
      if (result.summary && result.summary.summary) {
        finalContent = `${apiMessage}\n\n📝 摘要：${result.summary.summary}`;
      }

      const systemMsg: Message = {
        id: (result.summary && result.summary.id) || createId('msg'),
        conversationId: activeConversationId,
        senderId: 'system',
        senderName: '系统',
        role: 'system',
        type: 'status',
        content: finalContent,
        createdAt: getCurrentFullTime(),
      };
      set(state => ({
        messages: state.messages.map(m => m.id === tempId ? systemMsg : m),
      }));

      if (!useMockMode) {
        try {
          await sendMessageNonStreaming(activeConversationId, {
            content: systemMsg.content,
            role: 'system',
            senderId: 'system',
            senderName: '系统',
            type: 'status',
          } as any);
        } catch (e) {
          console.warn('Failed to save compress system message to backend', e);
        }
      }
    } else {
      set(state => ({
        messages: state.messages.filter(m => m.id !== tempId),
      }));
    }

    console.log('[Store] 上下文压缩处理完成');
  },

  sendMessage: async (content, attachments, targetAgentId, useSandbox, webSearchMode) => {
    const { activeConversationId, useMockMode, conversations, agents, replyContext, quoteArtifactRef, workspaceContextFiles, webSearchMode: storeWebSearchMode } = get();
    const finalWebSearchMode = webSearchMode !== undefined ? webSearchMode : storeWebSearchMode;
    if (!activeConversationId) return;

    const activeConv = conversations.find(c => c.id === activeConversationId);
    if (!activeConv) return;

    // Append workspace files context if any
    let finalContent = content;
    if (workspaceContextFiles && workspaceContextFiles.length > 0) {
      let contextBlock = '\n\n---\n### [Workspace File Context]\n';
      for (const filePath of workspaceContextFiles) {
        const fileContent = await get().loadWorkspaceFileContent(filePath);
        if (fileContent) {
          contextBlock += `\nFile: \`${filePath}\`\n\`\`\`\n${fileContent}\n\`\`\`\n`;
        }
      }
      finalContent += contextBlock;
    }

    const newUserMessage: Message = {
      id: createId('msg'),
      conversationId: activeConversationId,
      senderId: 'user',
      senderName: '用户',
      role: 'user',
      type: 'text',
      content, // Keep original content for UI
      createdAt: getCurrentFullTime(),
      quotedMessage: replyContext || undefined,
      artifactRef: quoteArtifactRef || undefined,
      attachments,
    };

    set(state => ({
      messages: [...state.messages, newUserMessage],
      conversations: state.conversations.map(c =>
        c.id === activeConversationId
          ? { ...c, lastMessage: content || (attachments && attachments.length > 0 ? '[文件/图片附件]' : ''), updatedAt: getCurrentFullTime() }
          : c
      ),
      isProcessing: true,
      replyContext: null,
      quoteArtifactRef: null,
    }));

    get().clearFileContext();

    let finalAttachments = attachments || [];
    const filesToUpload = finalAttachments.filter(a => a.file).map(a => a.file) as File[];

    if (filesToUpload.length > 0) {
      if (!useMockMode) {
        try {
          const { uploadAttachmentBatch } = await import('@/services/http/attachmentService');
          const res = await uploadAttachmentBatch(activeConversationId, filesToUpload);
          if (res.code === 0 && res.data && res.data.results) {
            const uploadedAttachments: MessageAttachment[] = [];
            res.data.results.forEach((result) => {
              if (result && result.ok && result.attachment) {
                uploadedAttachments.push(result.attachment);
              }
            });
            finalAttachments = uploadedAttachments;
            set(state => ({
              messages: state.messages.map(m => m.id === newUserMessage.id ? { ...m, attachments: uploadedAttachments } : m)
            }));
          } else {
            console.error("Batch upload failed in store:", res.message);
            set(state => ({
              messages: state.messages.map(m => m.id === newUserMessage.id ? { ...m, attachments: m.attachments?.map(a => ({ ...a, uploadError: '上传失败' })) } : m)
            }));
            return;
          }
        } catch (err: any) {
          console.error("Batch upload failed in store:", err);
          set(state => ({
            messages: state.messages.map(m => m.id === newUserMessage.id ? { ...m, attachments: m.attachments?.map(a => ({ ...a, uploadError: '上传网络错误' })) } : m)
          }));
          return;
        }
      } else {
        // Mock mode upload simulation
        await new Promise(resolve => setTimeout(resolve, 1000));
        finalAttachments = finalAttachments.map(item => ({
          ...item,
          parseStatus: 'parsed' as const,
          summary: `[Mock 摘要] 这是关于 ${item.name} 的模型提取摘要分析。`,
          meta: item.name.endsWith('.zip') ? { entryCount: 5, parsedEntryCount: 4, skipped: true } : item.meta,
          createdAt: new Date().toISOString()
        }));
        set(state => ({
          messages: state.messages.map(m => m.id === newUserMessage.id ? { ...m, attachments: finalAttachments } : m)
        }));
      }
    }

    if (useMockMode) {
      const handled = await handleMockFileAttachments(activeConversationId, finalAttachments, set, get);
      if (handled) return;

      const isSandboxRequest = content.includes('登录') || content.includes('注册') || content.includes('页面') || content.includes('sandbox') || useSandbox;

      if (isSandboxRequest) {
        (async () => {
          const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

          // 1. Show system status message
          const statusMsg: Message = {
            id: createId('msg'),
            conversationId: activeConversationId,
            senderId: 'system',
            senderName: '系统',
            role: 'system',
            type: 'status',
            content: '已识别为产物型任务，正在创建沙箱运行...',
            createdAt: getCurrentFullTime()
          };
          
          set(state => ({
            messages: [...state.messages, statusMsg]
          }));

          await delay(1200);

          // 2. Open the right panel and focus on sandbox tab
          const mockRunId = `run-mock-${Date.now()}`;
          const mockWorkspaceId = activeConv.workspaceId || `ws-mock-${Date.now()}`;
          
          set(state => ({
            rightPanelTab: 'sandbox',
            runsByConversationId: {
              ...state.runsByConversationId,
              [activeConversationId]: [mockRunId, ...(state.runsByConversationId[activeConversationId] || [])]
            },
            activeRunIdByConversationId: {
              ...state.activeRunIdByConversationId,
              [activeConversationId]: mockRunId
            },
            conversations: state.conversations.map(c =>
              c.id === activeConversationId
                ? { ...c, workspaceId: mockWorkspaceId }
                : c
            )
          }));

          // 3. Setup running states for steps
          const steps = [
            {
              id: 'step-1',
              runId: mockRunId,
              agentId: 'agent-orchestrator',
              agentName: 'Orchestrator',
              status: 'running' as const,
              description: '分析生成登录页面的需求与步骤...',
              log: '>>> Starting sandbox execution task...\n>>> Analyzing requirements: Login page with username, password, login/register buttons.\n',
              createdAt: getCurrentFullTime(),
              updatedAt: getCurrentFullTime()
            },
            {
              id: 'step-2',
              runId: mockRunId,
              agentId: 'agent-design',
              agentName: 'DesignAgent',
              status: 'pending' as const,
              description: '设计页面布局与UI规范...',
              createdAt: getCurrentFullTime(),
              updatedAt: getCurrentFullTime()
            },
            {
              id: 'step-3',
              runId: mockRunId,
              agentId: 'agent-codex',
              agentName: 'CodeAgent',
              status: 'pending' as const,
              description: '生成前端页面及相关的CSS样式...',
              createdAt: getCurrentFullTime(),
              updatedAt: getCurrentFullTime()
            }
          ];

          const mockRunDetail: AgentRunDetail = {
            id: mockRunId,
            sandboxId: `sb-mock-${Date.now()}`,
            conversationId: activeConversationId,
            ownerUserId: 'user',
            status: 'running',
            prompt: content,
            dag: {
              nodes: [
                { id: 'step-1', label: '分析需求', agentId: 'agent-orchestrator', status: 'running', dependencies: [] },
                { id: 'step-2', label: 'UI设计', agentId: 'agent-design', status: 'pending', dependencies: ['step-1'] },
                { id: 'step-3', label: '生成代码', agentId: 'agent-codex', status: 'pending', dependencies: ['step-2'] }
              ]
            },
            summary: '正在生成登录页面...',
            createdAt: getCurrentFullTime(),
            updatedAt: getCurrentFullTime(),
            steps,
            files: [],
            conflicts: [],
            workspaceId: mockWorkspaceId
          };

          set(state => ({
            runDetailsById: {
              ...state.runDetailsById,
              [mockRunId]: mockRunDetail
            }
          }));

          await delay(2000);

          // 4. Progress step-1 to completed, step-2 to running
          set(state => {
            const currentRun = state.runDetailsById[mockRunId];
            if (!currentRun) return {};
            const updatedSteps = currentRun.steps.map((s: any) => {
              if (s.id === 'step-1') return { ...s, status: 'completed' as const, log: s.log + '>>> Requirements analyzed successfully.\n', finishedAt: getCurrentFullTime() };
              if (s.id === 'step-2') return { ...s, status: 'running' as const, log: '>>> Initializing UI specifications...\n>>> Selected Theme: Modern Lark Indigo & Emerald harmonized palette.\n>>> Creating layouts...\n', startedAt: getCurrentFullTime() };
              return s;
            });
            const updatedDag = {
              nodes: currentRun.dag.nodes.map((n: any) => {
                if (n.id === 'step-1') return { ...n, status: 'completed' as const };
                if (n.id === 'step-2') return { ...n, status: 'running' as const };
                return n;
              })
            };
            return {
              runDetailsById: {
                ...state.runDetailsById,
                [mockRunId]: {
                  ...currentRun,
                  steps: updatedSteps,
                  dag: updatedDag
                }
              }
            };
          });

          await delay(2000);

          // 5. Progress step-2 to completed, step-3 to running
          set(state => {
            const currentRun = state.runDetailsById[mockRunId];
            if (!currentRun) return {};
            const updatedSteps = currentRun.steps.map((s: any) => {
              if (s.id === 'step-2') return { ...s, status: 'completed' as const, log: s.log + '>>> UI Design specifications generated successfully.\n', finishedAt: getCurrentFullTime() };
              if (s.id === 'step-3') return { ...s, status: 'running' as const, log: '>>> Generating code and styling...\n>>> Writing component `Login.tsx`...\n>>> Writing styles `Login.css`...\n', startedAt: getCurrentFullTime() };
              return s;
            });
            const updatedDag = {
              nodes: currentRun.dag.nodes.map((n: any) => {
                if (n.id === 'step-2') return { ...n, status: 'completed' as const };
                if (n.id === 'step-3') return { ...n, status: 'running' as const };
                return n;
              })
            };
            return {
              runDetailsById: {
                ...state.runDetailsById,
                [mockRunId]: {
                  ...currentRun,
                  steps: updatedSteps,
                  dag: updatedDag
                }
              }
            };
          });

          await delay(2000);

          // 6. Complete step-3 and output mock files!
          const mockFiles: SandboxFile[] = [
            {
              id: 'file-1',
              sandboxId: mockRunDetail.sandboxId || '',
              runId: mockRunId,
              path: 'src/components/Login.tsx',
              contentHash: 'hash1',
              currentVersion: 1,
              createdAt: getCurrentFullTime(),
              updatedAt: getCurrentFullTime()
            },
            {
              id: 'file-2',
              sandboxId: mockRunDetail.sandboxId || '',
              runId: mockRunId,
              path: 'src/styles/Login.css',
              contentHash: 'hash2',
              currentVersion: 1,
              createdAt: getCurrentFullTime(),
              updatedAt: getCurrentFullTime()
            }
          ];

          const mockFileContents = {
            'src/components/Login.tsx': `import React from 'react';\nimport '../styles/Login.css';\n\nexport default function Login() {\n  return (\n    <div className="login-container">\n      <form className="login-form">\n        <h2>Welcome Back</h2>\n        <input type="text" placeholder="Username" required />\n        <input type="password" placeholder="Password" required />\n        <button type="submit">Sign In</button>\n      </form>\n    </div>\n  );\n}`,
            'src/styles/Login.css': `.login-container {\n  display: flex;\n  justify-content: center;\n  align-items: center;\n  height: 100vh;\n  background: linear-gradient(135deg, #6366f1 0%, #a855f7 100%);\n}`
          };

          const fileTree: WorkspaceTreeNode = {
            path: 'src',
            name: 'src',
            type: 'directory',
            children: [
              {
                path: 'src/components',
                name: 'components',
                type: 'directory',
                children: [
                  {
                    path: 'src/components/Login.tsx',
                    name: 'Login.tsx',
                    type: 'file'
                  }
                ]
              },
              {
                path: 'src/styles',
                name: 'styles',
                type: 'directory',
                children: [
                  {
                    path: 'src/styles/Login.css',
                    name: 'Login.css',
                    type: 'file'
                  }
                ]
              }
            ]
          };

          set(state => {
            const currentRun = state.runDetailsById[mockRunId];
            if (!currentRun) return {};
            const updatedSteps = currentRun.steps.map((s: any) => {
              if (s.id === 'step-3') return { ...s, status: 'completed' as const, log: s.log + '>>> Code and styling generated and written to files successfully.\n>>> Sandbox run finished.\n', finishedAt: getCurrentFullTime() };
              return s;
            });
            const updatedDag = {
              nodes: currentRun.dag.nodes.map((n: any) => {
                if (n.id === 'step-3') return { ...n, status: 'completed' as const };
                return n;
              })
            };
            return {
              runDetailsById: {
                ...state.runDetailsById,
                [mockRunId]: {
                  ...currentRun,
                  status: 'completed' as const,
                  steps: updatedSteps,
                  dag: updatedDag,
                  files: mockFiles
                }
              },
              runFilesByRunId: {
                ...state.runFilesByRunId,
                [mockRunId]: mockFiles
              },
              runFileContentsByRunId: {
                ...state.runFileContentsByRunId,
                [mockRunId]: mockFileContents
              },
              fileTreeByRunId: {
                ...state.fileTreeByRunId,
                [mockRunId]: fileTree
              },
              isProcessing: false
            };
          });

        })();
        return;
      }

      const replyResult = generateMockReply({
        conversation: activeConv,
        agents,
        userContent: finalContent,
      });

      const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

      let messagesToStream = replyResult.messages;
      let artifactsToStream = replyResult.artifacts;

      const finalTargetAgentId = targetAgentId || agents.find(a => content.includes(`@${a.name}`) && a.enabled === true && a.status !== 'disabled')?.id;
      if (finalTargetAgentId && activeConv.mode === 'group') {
        const targetAgent = agents.find(a => a.id === finalTargetAgentId);
        if (targetAgent) {
          messagesToStream = replyResult.messages.filter(msg =>
            msg.senderId === targetAgent.id
          );
          if (targetAgent.id.includes('code') || targetAgent.id.includes('claude')) {
            artifactsToStream = replyResult.artifacts.filter(a => a.type === 'code');
          } else if (targetAgent.id.includes('doc')) {
            artifactsToStream = replyResult.artifacts.filter(a => a.type === 'markdown');
          } else {
            artifactsToStream = [];
          }
        }
      }

      const versionsToStream = replyResult.artifactVersions;
      (async () => {
        for (const msg of messagesToStream) {
          if (msg.type === 'text' || msg.type === 'code') {
            set(state => ({
              agents: state.agents.map(a => a.id === msg.senderId ? { ...a, status: 'thinking' as const } : a),
              messages: [...state.messages, {
                id: `thinking-${msg.senderId}`,
                conversationId: msg.conversationId,
                senderId: msg.senderId,
                senderName: msg.senderName,
                role: msg.role,
                type: 'status',
                content: '正在思考...',
                createdAt: getCurrentFullTime(),
              }]
            }));

            await delay(800);

            const streamMessageId = msg.id;
            set(state => ({
              messages: state.messages.filter(m => m.id !== `thinking-${msg.senderId}`).concat({
                ...msg,
                content: '',
              })
            }));

            const textToStream = msg.content;
            let currentText = '';
            const stepSize = msg.type === 'code' ? 12 : 3;

            for (let i = 0; i < textToStream.length; i += stepSize) {
              currentText = textToStream.slice(0, i + stepSize);
              set(state => ({
                messages: state.messages.map(m => m.id === streamMessageId ? { ...m, content: currentText } : m)
              }));
              await delay(30);
            }

            set(state => ({
              messages: state.messages.map(m => m.id === streamMessageId ? { ...m, content: textToStream } : m)
            }));

            set(state => ({
              agents: state.agents.map(a => a.id === msg.senderId ? { ...a, status: 'online' as const } : a),
            }));

            await delay(400);
          } else {
            set(state => ({
              messages: [...state.messages, msg],
            }));
            await delay(600);
          }
        }

        if (artifactsToStream.length > 0) {
          set(state => {
            const updatedVersions = { ...state.artifactVersions };
            versionsToStream.forEach(v => {
              if (!updatedVersions[v.artifactId]) updatedVersions[v.artifactId] = [];
              if (!updatedVersions[v.artifactId].some(x => x.id === v.id)) {
                updatedVersions[v.artifactId].push(v);
              }
            });

            const workspaceId = activeConv?.workspaceId;
            const updatedArtsToStream = artifactsToStream.map(art => ({ ...art, workspaceId }));

            const updatedWorkspaceArtifacts = { ...state.workspaceArtifacts };
            if (workspaceId) {
              updatedWorkspaceArtifacts[workspaceId] = [
                ...(updatedWorkspaceArtifacts[workspaceId] || []),
                ...updatedArtsToStream
              ];
            }

            const updatedConversationArtifacts = { ...state.conversationArtifacts };
            updatedConversationArtifacts[activeConversationId] = [
              ...(updatedConversationArtifacts[activeConversationId] || []),
              ...updatedArtsToStream
            ];

            return {
              artifacts: workspaceId
                ? [...(state.workspaceArtifacts[workspaceId] || []), ...updatedArtsToStream]
                : [...(state.conversationArtifacts[activeConversationId] || []), ...updatedArtsToStream],
              workspaceArtifacts: updatedWorkspaceArtifacts,
              conversationArtifacts: updatedConversationArtifacts,
              artifactVersions: updatedVersions,
              selectedArtifactId: artifactsToStream[0].id,
            };
          });
        }

        set({ isProcessing: false });
      })();
    } else {
      try {
        const payload: SendMessageRequest = {
          content: finalContent,
          targetAgentId,
          quotedMessageId: replyContext?.id || undefined,
          artifactRef: quoteArtifactRef || undefined,
          attachments: finalAttachments?.map(a => ({
            id: a.id,
            attachmentId: a.id,
            name: a.name,
            url: a.url,
            type: a.type || a.kind || 'file',
            kind: a.type || a.kind || 'file',
            size: a.size || 0,
            mimeType: a.mimeType || ''
          })),
          useSandbox: useSandbox ? true : undefined,
          executionMode: useSandbox ? 'sandbox' : undefined,
          webSearchMode: finalWebSearchMode,
        };
        const res = await sendMessageNonStreaming(activeConversationId, payload);
        if (res.code === 0) {
          const { userMessage, agentMessages, artifacts, contextUsage, executionMode, run, workspaceId } = res.data;

          if (executionMode === 'sandbox' && run) {
            const runDetail = run;
            set(state => ({
              runsByConversationId: {
                ...state.runsByConversationId,
                [activeConversationId]: state.runsByConversationId[activeConversationId]?.includes(runDetail.id)
                  ? state.runsByConversationId[activeConversationId]
                  : [runDetail.id, ...(state.runsByConversationId[activeConversationId] || [])]
              },
              activeRunIdByConversationId: {
                ...state.activeRunIdByConversationId,
                [activeConversationId]: runDetail.id
              },
              runDetailsById: {
                ...state.runDetailsById,
                [runDetail.id]: runDetail
              },
              runFilesByRunId: {
                ...state.runFilesByRunId,
                [runDetail.id]: runDetail.files || []
              },
              runConflictsByRunId: {
                ...state.runConflictsByRunId,
                [runDetail.id]: runDetail.conflicts || []
              },
              runFileContentsByRunId: {
                ...state.runFileContentsByRunId,
                [runDetail.id]: {}
              },
              selectedSandboxFilePathByRunId: {
                ...state.selectedSandboxFilePathByRunId,
                [runDetail.id]: null
              },
              rightPanelTab: 'sandbox',
              conversations: state.conversations.map(c =>
                c.id === activeConversationId && workspaceId
                  ? { ...c, workspaceId }
                  : c
              )
            }));
            get().loadSandboxFileTree(runDetail.id);

            // 处理 planningMessages：HTTP response 里可能已包含规划消息，dedup 插入消息流并同步 planningPhaseByRunId
            if (runDetail.planningMessages && runDetail.planningMessages.length > 0) {
              set(state => {
                let httpMessages = [...state.messages];
                const planningPhases: string[] = [];
                runDetail.planningMessages!.forEach((pm: any) => {
                  if (!httpMessages.some((m: any) => m.id === pm.id)) {
                    httpMessages.push(mapMessageMetadata(pm));
                  }
                  if (pm.metadata?.phase && !planningPhases.includes(pm.metadata.phase)) {
                    planningPhases.push(pm.metadata.phase);
                  }
                });
                const phaseUpdates: any = { messages: httpMessages };
                if (planningPhases.length > 0) {
                  phaseUpdates.planningPhaseByRunId = {
                    ...state.planningPhaseByRunId,
                    [runDetail.id]: planningPhases,
                  };
                }
                return phaseUpdates;
              });
            }
          }
          
          // Cache the artifactRef with the server-side message ID if present
          const mappedUserMessage = userMessage ? mapMessageMetadata(userMessage) : null;
          const finalArtifactRef = (mappedUserMessage && mappedUserMessage.artifactRef) || newUserMessage.artifactRef;
          if (finalArtifactRef && userMessage && userMessage.id) {
            saveArtifactRefToLocal(userMessage.id, finalArtifactRef);
          }

          set(state => {
            // Replace the optimistic message with the actual user message, preserving local reply/citation fields
            let updatedMessages = state.messages;
            if (userMessage && state.messages.some(m => m.id === userMessage.id)) {
              updatedMessages = state.messages.filter(m => m.id !== newUserMessage.id);
            } else {
              updatedMessages = state.messages.map(m => {
                if (m.id === newUserMessage.id) {
                  return mappedUserMessage ? {
                    ...mappedUserMessage,
                    attachments: mappedUserMessage.attachments || m.attachments,
                    quotedMessage: mappedUserMessage.quotedMessage || m.quotedMessage,
                    artifactRef: finalArtifactRef,
                  } : m;
                }
                return m;
              });
            }

            // Filter out thinking indicators and append new agent messages
            let finalMessages = [...updatedMessages];
            agentMessages.forEach(msg => {
              finalMessages = finalMessages.filter(m => m.id !== `thinking-${msg.senderId}`);
              if (!finalMessages.some(m => m.id === msg.id)) {
                finalMessages.push(mapMessageMetadata(msg));
              }
            });

            // Mark collaboration task plan steps as completed since REST response signifies completed round
            finalMessages = completeAllTaskPlanSteps(finalMessages);

            // Merge new artifacts
            const activeConv = state.conversations.find((c: any) => c.id === activeConversationId);
            const wId = workspaceId || activeConv?.workspaceId;

            const updatedWorkspaceArtifacts = { ...state.workspaceArtifacts };
            if (wId) {
              const wsList = [...(updatedWorkspaceArtifacts[wId] || [])];
              artifacts.forEach((art: any) => {
                const item = { ...art, workspaceId: wId };
                if (!wsList.some(a => a.id === item.id)) {
                  wsList.push(item);
                }
              });
              updatedWorkspaceArtifacts[wId] = wsList;
            }

            const updatedConversationArtifacts = { ...state.conversationArtifacts };
            const convList = [...(updatedConversationArtifacts[activeConversationId] || [])];
            artifacts.forEach((art: any) => {
              const item = { ...art, workspaceId: wId };
              if (!convList.some(a => a.id === item.id)) {
                convList.push(item);
              }
            });
            updatedConversationArtifacts[activeConversationId] = convList;

            const currentArtifacts = wId ? (updatedWorkspaceArtifacts[wId] || []) : convList;

            // Update active conversation usage if returned
            const updatedConversations = state.conversations.map(c =>
              c.id === activeConversationId && contextUsage
                ? { ...c, contextUsage }
                : c
            );

            return {
              messages: finalMessages,
              artifacts: currentArtifacts,
              workspaceArtifacts: updatedWorkspaceArtifacts,
              conversationArtifacts: updatedConversationArtifacts,
              conversations: updatedConversations,
              isProcessing: false,
            };
          });
        } else if (res.code === 40002) {
          alert(`❌ 发送失败：${res.message || '客户端不允许创建 system/status 消息'}`);
          get().addDesktopNotification('发送失败', res.message || '客户端不允许创建 system/status 消息', 'error', 'error');
          set(state => ({
            messages: state.messages.filter(m => m.id !== newUserMessage.id),
            isProcessing: false,
          }));
        } else {
          const errorMsg: Message = {
            id: createId('msg'),
            conversationId: activeConversationId,
            senderId: 'system',
            senderName: '系统',
            role: 'system',
            type: 'status',
            content: `❌ 发送失败：${res.message || '未知错误'}`,
            createdAt: getCurrentFullTime(),
          };
          set(state => ({
            messages: [...state.messages, errorMsg],
            isProcessing: false,
          }));
        }
      } catch (e: any) {
        console.error('[Store] 发送消息 HTTP 失败', e);
        const errCode = e.response?.data?.code;
        const errMsg = e.response?.data?.message || e.message || '网络请求失败';
        if (errCode === 40002) {
          alert(`❌ 发送失败：${errMsg}`);
          get().addDesktopNotification('发送失败', errMsg, 'error', 'error');
          set(state => ({
            messages: state.messages.filter(m => m.id !== newUserMessage.id),
            isProcessing: false,
          }));
        } else {
          const errorMsg: Message = {
            id: createId('msg'),
            conversationId: activeConversationId,
            senderId: 'system',
            senderName: '系统',
            role: 'system',
            type: 'status',
            content: `❌ 发送失败：${errMsg}`,
            createdAt: getCurrentFullTime(),
          };
          set(state => ({
            messages: [...state.messages, errorMsg],
            isProcessing: false,
          }));
        }
      }
    }
  },

  saveConversationAgentConfig: async (conversationId, agentId, updatedAgent) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await updateConversationAgentConfig(conversationId, agentId, updatedAgent);
        if (res.code === 0) {
          updatedAgent = res.data;
        }
      } catch (e) {
        console.error('[Store] 接口更新会话 Agent 配置失败', e);
      }
    }
    const nextConfigs = {
      ...get().conversationAgentConfigs,
      [conversationId]: {
        ...(get().conversationAgentConfigs[conversationId] || {}),
        [agentId]: updatedAgent
      }
    };
    set({ conversationAgentConfigs: nextConfigs });
    try {
      localStorage.setItem('ag_conversation_agent_configs', JSON.stringify(nextConfigs));
    } catch (e) {
      console.error('Failed to save conversation agent configs to localStorage', e);
    }
  },

  saveAgent: async (updatedAgent) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        // 注意：不 strip status，以允许通过 saveAgent 更新 status 字段
        const { id, ownerUserId, owner_user_id, conversationId, lastUsedAt, ...updatePayload } = updatedAgent as any;
        const res = await updateAgentDetail(updatedAgent.id, updatePayload);
        if (res.code === 0) {
          const updated = res.data;
          const callable = updated.enabled === true && updated.status !== 'disabled';
          set(state => ({
            // 若 callable，更新 agents；若已不再 callable（如变 disabled），从 agents 移除
            agents: callable
              ? state.agents.map(a => a.id === updated.id ? updated : a)
              : state.agents.filter(a => a.id !== updated.id),
            // allAgents 同步更新
            allAgents: state.allAgents.map(a => a.id === updated.id ? updated : a),
          }));
        }
      } catch (e) {
        console.error('[Store] 更新 Agent 失败', e);
      }
    } else {
      const callable = updatedAgent.enabled === true && updatedAgent.status !== 'disabled';
      set(state => ({
        agents: callable
          ? state.agents.map(a => a.id === updatedAgent.id ? updatedAgent : a)
          : state.agents.filter(a => a.id !== updatedAgent.id),
        allAgents: state.allAgents.map(a => a.id === updatedAgent.id ? updatedAgent : a),
      }));
    }
  },

  createAgent: async (agentData) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await createAgentApi(agentData);
        if (res.code === 0) {
          set(state => ({
            agents: [...state.agents, res.data]
          }));
          return res.data.id;
        } else {
          alert(`创建 Agent 失败: ${res.message || '未知错误'}`);
          throw new Error(res.message || '创建 Agent 失败');
        }
      } catch (e: any) {
        console.error('[Store] 创建 Agent 失败', e);
        if (e.message) throw e;
        alert('网络错误，创建 Agent 失败');
        throw e;
      }
    }

    // Mock Mode fallback
    const newId = createId('agent');
    const newAgent: Agent = {
      ...agentData,
      id: newId,
      lastUsedAt: getCurrentFullTime()
    } as Agent;

    set(state => ({
      agents: [...state.agents, newAgent]
    }));
    return newId;
  },

  deleteAgent: async (agentId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await deleteAgentApi(agentId);
        if (res.code === 0) {
          set(state => ({
            agents: state.agents.filter(a => a.id !== agentId),
            allAgents: state.allAgents.filter(a => a.id !== agentId),
          }));
        }
      } catch (e) {
        console.error('[Store] 删除 Agent 失败，降级至 Mock 模式处理', e);
      }
    } else {
      set(state => ({
        agents: state.agents.filter(a => a.id !== agentId),
        allAgents: state.allAgents.filter(a => a.id !== agentId),
      }));
    }
  },

  disableAgent: async (agentId) => {
    const { useMockMode } = get();
    try {
      if (!useMockMode) {
        const res = await updateAgentDetail(agentId, { status: 'disabled' } as any);
        if (res.code === 0) {
          set(state => ({
            // 从可用列表移除
            agents: state.agents.filter(a => a.id !== agentId),
            // allAgents 保留并更新 status
            allAgents: state.allAgents.map(a => a.id === agentId ? { ...a, status: 'disabled' as const } : a),
          }));
        }
      } else {
        set(state => ({
          agents: state.agents.filter(a => a.id !== agentId),
          allAgents: state.allAgents.map(a => a.id === agentId ? { ...a, status: 'disabled' as const } : a),
        }));
      }
    } catch (e) {
      console.error('[Store] 停用 Agent 失败', e);
    }
  },

  restoreAgent: async (agentId) => {
    const { useMockMode } = get();
    try {
      if (!useMockMode) {
        const res = await updateAgentDetail(agentId, { status: 'online' } as any);
        if (res.code === 0) {
          const restored = res.data;
          set(state => ({
            // 若 callable，加回普通列表
            agents: state.agents.some(a => a.id === agentId)
              ? state.agents.map(a => a.id === agentId ? restored : a)
              : [...state.agents, restored],
            allAgents: state.allAgents.map(a => a.id === agentId ? restored : a),
          }));
        }
      } else {
        set(state => ({
          agents: state.agents.some(a => a.id === agentId)
            ? state.agents.map(a => a.id === agentId ? { ...a, status: 'online' as const } : a)
            : [...state.agents, { ...state.allAgents.find(a => a.id === agentId)!, status: 'online' as const }],
          allAgents: state.allAgents.map(a => a.id === agentId ? { ...a, status: 'online' as const } : a),
        }));
      }
    } catch (e) {
      console.error('[Store] 恢复 Agent 失败', e);
    }
  },

  loadAllAgents: async () => {
    const { useMockMode } = get();
    if (useMockMode) {
      // Mock 模式下从当前 agents 构造（将所有状态的 agent 都展示）
      return;
    }
    try {
      const res = await getAgentList({ includeDisabled: true });
      if (res.code === 0) {
        const list = (res.data.list as Agent[]).filter(a => 
          !(a.id === 'agent-orchestrator' && a.enabled === false)
        );
        set({ allAgents: list });
      }
    } catch (e) {
      console.error('[Store] 加载全量 Agent 列表失败', e);
    }
  },

  deleteConversation: async (id) => {
    const { useMockMode, activeConversationId, conversations } = get();
    if (!useMockMode) {
      try {
        const res = await deleteConversation(id);
        if (res.code === 0) {
          const updatedConversations = conversations.filter(c => c.id !== id);
          set({ conversations: updatedConversations });
          if (activeConversationId === id) {
            const nextActiveId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
            await get().setActiveConversationId(nextActiveId);
          }
        }
      } catch (e) {
        console.error('[Store] 删除会话失败', e);
      }
    } else {
      const updatedConversations = conversations.filter(c => c.id !== id);
      set({ conversations: updatedConversations });
      if (activeConversationId === id) {
        const nextActiveId = updatedConversations.length > 0 ? updatedConversations[0].id : null;
        await get().setActiveConversationId(nextActiveId);
      }
    }
  },

  renameConversation: async (id, newTitle) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await updateConversation(id, { title: newTitle });
        if (res.code === 0) {
          set(state => ({
            conversations: state.conversations.map(c =>
              c.id === id ? { ...c, title: newTitle } : c
            )
          }));
        }
      } catch (e) {
        console.error('[Store] 重命名会话 API 失败', e);
      }
    } else {
      set(state => ({
        conversations: state.conversations.map(c =>
          c.id === id ? { ...c, title: newTitle } : c
        )
      }));
    }
  },

  addAgentToConversation: async (conversationId, agentId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await addAgentToConversation(conversationId, agentId);
        if (res.code === 0 && res.data) {
          set(state => ({
            conversations: state.conversations.map(c =>
              c.id === conversationId ? { ...c, agentIds: res.data.agentIds } : c
            )
          }));
          return;
        }
      } catch (e) {
        console.error('[Store] 添加 Agent 到会话失败', e);
      }
    }
    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id === conversationId) {
          const currentAgentIds = c.agentIds || [];
          if (!currentAgentIds.includes(agentId)) {
            return { ...c, agentIds: [...currentAgentIds, agentId] };
          }
        }
        return c;
      })
    }));
  },

  removeAgentFromConversation: async (conversationId, agentId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await removeAgentFromConversation(conversationId, agentId);
        if (res.code === 0 && res.data) {
          set(state => ({
            conversations: state.conversations.map(c =>
              c.id === conversationId ? { ...c, agentIds: res.data.agentIds } : c
            )
          }));
          return;
        }
      } catch (e) {
        console.error('[Store] 从会话移除 Agent 失败', e);
      }
    }
    set(state => ({
      conversations: state.conversations.map(c => {
        if (c.id === conversationId) {
          return { ...c, agentIds: (c.agentIds || []).filter(id => id !== agentId) };
        }
        return c;
      })
    }));
  },

  togglePinConversation: async (id) => {
    const { useMockMode, conversations } = get();
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const targetPinnedState = !conv.isPinned;

    if (!useMockMode) {
      try {
        const res = await pinConversation(id, targetPinnedState);
        if (res.code !== 0) {
          console.error('[Store] 置顶/取消置顶 API 失败', res.message);
        }
      } catch (e) {
        console.error('[Store] 置顶/取消置顶 API 失败', e);
      }
    }

    try {
      const pinned = JSON.parse(localStorage.getItem('ag_pinned_conversations') || '[]');
      let nextPinned: string[];
      if (pinned.includes(id)) {
        nextPinned = pinned.filter((x: string) => x !== id);
      } else {
        nextPinned = [...pinned, id];
      }
      localStorage.setItem('ag_pinned_conversations', JSON.stringify(nextPinned));
      set(state => ({
        conversations: state.conversations.map(c => 
          c.id === id ? { ...c, isPinned: nextPinned.includes(id) } : c
        )
      }));
    } catch (e) {
      console.error('Failed to toggle pin conversation', e);
    }
  },

  toggleArchiveConversation: async (id) => {
    const { useMockMode, conversations } = get();
    const conv = conversations.find(c => c.id === id);
    if (!conv) return;
    const targetArchivedState = !conv.isArchived;

    if (!useMockMode) {
      try {
        const res = await archiveConversation(id, targetArchivedState);
        if (res.code !== 0) {
          console.error('[Store] 归档/激活 API 失败', res.message);
        }
      } catch (e) {
        console.error('[Store] 归档/激活 API 失败', e);
      }
    }

    try {
      const archived = JSON.parse(localStorage.getItem('ag_archived_conversations') || '[]');
      let nextArchived: string[];
      if (archived.includes(id)) {
        nextArchived = archived.filter((x: string) => x !== id);
      } else {
        nextArchived = [...archived, id];
      }
      localStorage.setItem('ag_archived_conversations', JSON.stringify(nextArchived));
      set(state => ({
        conversations: state.conversations.map(c => 
          c.id === id ? { ...c, isArchived: nextArchived.includes(id) } : c
        )
      }));
    } catch (e) {
      console.error('Failed to toggle archive conversation', e);
    }
  },

  loadArtifactContent: async (artifactId) => {
    const { useMockMode, artifactVersions } = get();
    if (artifactVersions[artifactId]?.length > 0) return;

    if (useMockMode) {
      const versions = mockArtifactVersions.filter(v => v.artifactId === artifactId);
      if (versions.length > 0) {
        set(state => ({
          artifactVersions: {
            ...state.artifactVersions,
            [artifactId]: versions
          }
        }));
      }
      return;
    }

    try {
      const detailRes = await getArtifactDetail(artifactId);
      const versionsRes = await getArtifactVersions(artifactId);
      if (detailRes.code === 0 && versionsRes.code === 0) {
        set(state => ({
          artifacts: state.artifacts.map(a =>
            a.id === artifactId ? detailRes.data : a
          ),
          artifactVersions: {
            ...state.artifactVersions,
            [artifactId]: versionsRes.data
          }
        }));
      }
    } catch (e) {
      console.error('[Store] 获取 Artifact 详情失败', e);
    }
  },

  connectWS: async () => {
    const { wsStatus } = get();
    if (wsStatus === 'connected') return;

    set({ wsStatus: 'connecting' });

    get().disconnectWS();

    try {
      await wsClient.connect();
      set({ wsStatus: 'connected' });

      // Bind global message interceptor
      wsClient.messageInterceptor = (event: any) => {
        if (event && event.type && (event.type.startsWith('run.') || event.type.startsWith('orchestrator.planning.'))) {
          get().addSandboxDebugLog('ws_in', event.type, event);
        }
      };

      const activeConvId = get().activeConversationId;
      if (activeConvId && !get().useMockMode) {
        wsClient.send('conversation.subscribe', { conversationId: activeConvId });
      }

      const unsubUserCreated = wsClient.on('conversation.message.user_created', (event: any) => {
        const { message, conversationId } = event.data;
        set(state => {
          if (state.activeConversationId !== conversationId) return {};
          if (state.messages.some(m => m.id === message.id)) return {};
          
          const mappedMessage = mapMessageMetadata(message);
          const optimisticIndex = state.messages.findIndex(m => m.id.startsWith('msg-') && m.role === 'user');
          if (optimisticIndex > -1) {
            const updatedMessages = [...state.messages];
            updatedMessages[optimisticIndex] = {
              ...mappedMessage,
              quotedMessage: state.messages[optimisticIndex].quotedMessage,
              artifactRef: state.messages[optimisticIndex].artifactRef || mappedMessage.artifactRef,
            };
            return {
              messages: updatedMessages,
              isProcessing: true,
            };
          }
          
          return {
            messages: [...state.messages, mappedMessage],
            isProcessing: true,
          };
        });
      });

      const unsubError = wsClient.on('error', (event: any) => {
        const { code, message } = event.data || {};
        if (code === 40002) {
          alert(`❌ 发送失败：${message || '客户端不允许创建 system/status 消息'}`);
          get().addDesktopNotification('发送失败', message || '客户端不允许创建 system/status 消息', 'error', 'error');
          set(state => {
            const updatedMessages = [...state.messages];
            const lastUserMsgIdx = [...updatedMessages].reverse().findIndex(m => m.senderId === 'user' || m.role === 'user');
            if (lastUserMsgIdx > -1) {
              const actualIdx = updatedMessages.length - 1 - lastUserMsgIdx;
              updatedMessages.splice(actualIdx, 1);
            }
            return {
              messages: updatedMessages,
              isProcessing: false
            };
          });
        }
      });

      const unsubThinking = wsClient.on('agent.thinking.started', (event: any) => {
        const { agentId, agentName, conversationId, source, taskPlanStep } = event.data;
        set(state => {
          const targetConvId = conversationId || state.activeConversationId;
          if (!targetConvId) return {};

          const updatedAgents = state.agents.map(a =>
            a.id === agentId ? { ...a, status: 'thinking' as const } : a
          );

          const targetMessages = state.conversationMessages[targetConvId] || (state.activeConversationId === targetConvId ? state.messages : []);
          let updatedMessages = targetMessages;
          if (source === 'groupChatCollaboration') {
            updatedMessages = updateTaskPlanStepStatus(targetMessages, taskPlanStep || { agentId }, 'running');
          }

          const thinkingMsg: Message = {
            id: `thinking-${agentId}`,
            conversationId: targetConvId,
            senderId: agentId,
            senderName: agentName,
            role: 'agent',
            type: 'status',
            content: '正在思考...',
            createdAt: getCurrentFullTime(),
            metadata: source ? { source, readOnly: true } : undefined
          };

          const alreadyHasMsg = updatedMessages.some(
            m => m.id === `thinking-${agentId}` || (m.senderId === agentId && m.createdAt > thinkingMsg.createdAt)
          );

          const finalMessages = alreadyHasMsg ? updatedMessages : [...updatedMessages, thinkingMsg];

          const nextState: any = {
            agents: updatedAgents,
            conversationMessages: {
              ...(state.conversationMessages || {}),
              [targetConvId]: finalMessages
            }
          };

          if (state.activeConversationId === targetConvId) {
            nextState.messages = finalMessages;
          }

          return nextState;
        });
      });

      const unsubChunk = wsClient.on('conversation.message.chunk', (event: any) => {
        const { messageId, conversationId, senderId, senderName, role, messageType, chunk, language, source, readOnly, taskPlanStep } = event.data;
        set(state => {
          const targetConvId = conversationId || state.activeConversationId;
          if (!targetConvId) return {};

          const targetMessages = state.conversationMessages[targetConvId] || (state.activeConversationId === targetConvId ? state.messages : []);
          let updatedMessages = [...targetMessages];
          const existingIndex = targetMessages.findIndex(m => m.id === messageId);
          if (existingIndex > -1) {
            updatedMessages[existingIndex] = {
              ...updatedMessages[existingIndex],
              content: updatedMessages[existingIndex].content + chunk,
            };
          } else {
            const filteredMessages = targetMessages.filter(m => m.id !== `thinking-${senderId}`);
            
            let tmpMessages = filteredMessages;
            if (source === 'groupChatCollaboration' && taskPlanStep) {
              tmpMessages = updateTaskPlanStepStatus(filteredMessages, taskPlanStep, 'running');
            }

            const newMsg: Message = {
              id: messageId,
              conversationId: targetConvId,
              senderId,
              senderName,
              role,
              type: messageType || 'text',
              content: chunk,
              language,
              createdAt: getCurrentFullTime(),
              metadata: source ? {
                source,
                readOnly,
                taskPlanStep
              } : undefined
            };
            updatedMessages = [...tmpMessages, newMsg];
          }

          const nextState: any = {
            conversationMessages: {
              ...(state.conversationMessages || {}),
              [targetConvId]: updatedMessages
            }
          };

          if (state.activeConversationId === targetConvId) {
            nextState.messages = updatedMessages;
          }

          return nextState;
        });
      });

      const unsubCompleted = wsClient.on('conversation.message.completed', (event: any) => {
        const { fullMessage } = event.data;
        set(state => {
          const targetConvId = fullMessage.conversationId || state.activeConversationId;
          if (!targetConvId) return {};

          const targetMessages = state.conversationMessages[targetConvId] || (state.activeConversationId === targetConvId ? state.messages : []);
          const mappedMessage = mapMessageMetadata(fullMessage);
          let updatedMessages = targetMessages.map(m =>
            m.id === fullMessage.id ? mappedMessage : m
          );
          if (!targetMessages.some(m => m.id === fullMessage.id)) {
            updatedMessages.push(mappedMessage);
          }

          updatedMessages = updatedMessages.filter(m => m.id !== `thinking-${fullMessage.senderId}`);

          if (fullMessage.metadata?.source === 'groupChatCollaboration') {
            const step = fullMessage.metadata?.taskPlanStep;
            if (step) {
              updatedMessages = updateTaskPlanStepStatus(updatedMessages, step, 'completed');
            }
          }

          const updatedAgents = state.agents.map(a =>
            a.id === fullMessage.senderId ? { ...a, status: 'online' as const } : a
          );

          const nextState: any = {
            conversationMessages: {
              ...(state.conversationMessages || {}),
              [targetConvId]: updatedMessages
            },
            agents: updatedAgents,
            conversations: state.conversations.map(c =>
              c.id === targetConvId
                ? { ...c, lastMessage: fullMessage.content, updatedAt: getCurrentFullTime() }
                : c
            ),
          };

          if (state.activeConversationId === targetConvId) {
            nextState.messages = updatedMessages;
          }

          return nextState;
        });
      });

      const unsubArtifact = wsClient.on('artifact.created', (event: any) => {
        const { artifact, runId } = event.data;
        const artifactWithRunId = {
          ...artifact,
          runId: runId || artifact.runId
        };
        set(state => {
          if (!state.activeConversationId) return {};

          const activeId = state.activeConversationId;
          const activeConv = state.conversations.find((c: any) => c.id === activeId);
          const workspaceId = activeConv?.workspaceId;

          // If the artifact belongs to neither the current conversation nor the current workspace, ignore
          const belongs = (state.activeConversationId === artifactWithRunId.conversationId) ||
            (workspaceId && artifactWithRunId.workspaceId === workspaceId);
          if (!belongs) return {};

          const artWithWs = { ...artifactWithRunId, workspaceId: artifactWithRunId.workspaceId || workspaceId };

          // Update conversationArtifacts
          const updatedConversationArtifacts = { ...state.conversationArtifacts };
          if (artifactWithRunId.conversationId) {
            const cId = artifactWithRunId.conversationId;
            const convList = [...(updatedConversationArtifacts[cId] || [])];
            const existsConv = convList.findIndex(a => a.id === artWithWs.id && a.runId === artWithWs.runId);
            if (existsConv > -1) {
              convList[existsConv] = { ...convList[existsConv], ...artWithWs };
            } else {
              convList.push(artWithWs);
            }
            updatedConversationArtifacts[cId] = convList;
          }

          // Update workspaceArtifacts
          const updatedWorkspaceArtifacts = { ...state.workspaceArtifacts };
          const artWorkspaceId = artifactWithRunId.workspaceId || workspaceId;
          if (artWorkspaceId) {
            const wsList = [...(updatedWorkspaceArtifacts[artWorkspaceId] || [])];
            const existsWs = wsList.findIndex(a => a.id === artWithWs.id && a.runId === artWithWs.runId);
            if (existsWs > -1) {
              wsList[existsWs] = { ...wsList[existsWs], ...artWithWs };
            } else {
              wsList.push(artWithWs);
            }
            updatedWorkspaceArtifacts[artWorkspaceId] = wsList;
          }

          const updatedArtifacts = workspaceId 
            ? (updatedWorkspaceArtifacts[workspaceId] || []) 
            : (updatedConversationArtifacts[activeId] || []);

          const updatedVersions = { ...state.artifactVersions };
          delete updatedVersions[artifactWithRunId.id];

          return {
            artifacts: updatedArtifacts,
            conversationArtifacts: updatedConversationArtifacts,
            workspaceArtifacts: updatedWorkspaceArtifacts,
            selectedArtifactId: artifactWithRunId.id,
            artifactVersions: updatedVersions
          };
        });
        get().loadArtifactContent(artifactWithRunId.id);
        get().addDesktopNotification(
          '生成了新产物',
          `成功生成了文件: ${artifactWithRunId.title}`,
          'success',
          'artifact'
        );
      });

      const unsubAllCompleted = wsClient.on('conversation.all_tasks.completed', (event: any) => {
        const { conversationId, summary, contextUsage, artifacts, runId } = event.data;

        // Skip historical/replayed completion events pushed during subscription
        const runDetail = get().runDetailsById[runId];
        const isHistorical = runDetail && ['completed', 'failed', 'cancelled'].includes(runDetail.status);
        if (isHistorical) {
          return;
        }

        set(state => {
          if (state.activeConversationId !== conversationId) return {};

          const activeConv = state.conversations.find((c: any) => c.id === conversationId);
          const workspaceId = activeConv?.workspaceId;

          const systemMsg: Message = {
            id: `system-completed-${Date.now()}`,
            conversationId,
            senderId: 'system',
            senderName: '系统',
            role: 'system',
            type: 'status',
            content: summary,
            createdAt: getCurrentFullTime(),
          };

          const updatedAgents = state.agents.map(a =>
            a.status === 'thinking' ? { ...a, status: 'online' as const } : a
          );

          // Update conversationArtifacts
          const updatedConversationArtifacts = { ...state.conversationArtifacts };
          const convList = [...(updatedConversationArtifacts[conversationId] || [])];
          if (artifacts && artifacts.length > 0) {
            artifacts.forEach((art: any) => {
              const artWithRunId = { ...art, runId: runId || art.runId, workspaceId };
              const idx = convList.findIndex(a => a.id === artWithRunId.id && a.runId === artWithRunId.runId);
              if (idx > -1) {
                convList[idx] = { ...convList[idx], ...artWithRunId };
              } else {
                convList.push(artWithRunId);
              }
            });
          }
          updatedConversationArtifacts[conversationId] = convList;

          // Update workspaceArtifacts
          const updatedWorkspaceArtifacts = { ...state.workspaceArtifacts };
          if (workspaceId) {
            const wsList = [...(updatedWorkspaceArtifacts[workspaceId] || [])];
            if (artifacts && artifacts.length > 0) {
              artifacts.forEach((art: any) => {
                const artWithRunId = { ...art, runId: runId || art.runId, workspaceId };
                const idx = wsList.findIndex(a => a.id === artWithRunId.id && a.runId === artWithRunId.runId);
                if (idx > -1) {
                  wsList[idx] = { ...wsList[idx], ...artWithRunId };
                } else {
                  wsList.push(artWithRunId);
                }
              });
            }
            updatedWorkspaceArtifacts[workspaceId] = wsList;
          }

          const updatedArtifacts = workspaceId ? (updatedWorkspaceArtifacts[workspaceId] || []) : convList;

          let updatedMessages = completeAllTaskPlanSteps(state.messages);
          updatedMessages = [...updatedMessages, systemMsg];

          let newState: Partial<AgentHubStore> = {
            messages: updatedMessages,
            agents: updatedAgents,
            artifacts: updatedArtifacts,
            conversationArtifacts: updatedConversationArtifacts,
            workspaceArtifacts: updatedWorkspaceArtifacts,
            isProcessing: false,
          };

          if (contextUsage) {
            newState.conversations = state.conversations.map(c =>
              c.id === conversationId
                ? { ...c, contextUsage }
                : c
            );
          }

          return newState;
        });
        get().addDesktopNotification(
          '工作流任务已全部完成',
          '所有 Agent 的规划任务均已成功执行完成。',
          'success',
          'task'
        );
      });

      const unsubStatusChanged = wsClient.on('agent.status.changed', (event: any) => {
        const { agentId, newStatus } = event.data;
        set(state => {
          const updatedAgents = state.agents.map(a =>
            a.id === agentId ? { ...a, status: newStatus } : a
          );
          return { agents: updatedAgents };
        });
      });

      const unsubExecutionDecided = wsClient.on('execution.mode.decided', (event: any) => {
        const { conversationId, executionMode } = event.data;
        if (executionMode === 'sandbox') {
          set({ rightPanelTab: 'sandbox' });
        }
      });

      const unsubRunQueued = wsClient.on('run.queued', (event: any) => {
        const { runId, conversationId, run } = event.data;
        const targetConvId = conversationId || get().activeConversationId;

        set(state => {
          const runDetail = run ? {
            ...run,
            steps: run.steps?.map((s: any) => ({
              ...s,
              log: s.log || s.logs || '',
              description: s.description || s.task || ''
            })) || []
          } : undefined;

          const baseStateUpdates: any = {
            rightPanelTab: 'sandbox'
          };

          if (targetConvId) {
            baseStateUpdates.runsByConversationId = {
              ...state.runsByConversationId,
              [targetConvId]: state.runsByConversationId[targetConvId]?.includes(runId)
                ? state.runsByConversationId[targetConvId]
                : [runId, ...(state.runsByConversationId[targetConvId] || [])]
            };
            baseStateUpdates.activeRunIdByConversationId = {
              ...state.activeRunIdByConversationId,
              [targetConvId]: runId
            };
          }

          if (runDetail) {
            baseStateUpdates.runDetailsById = {
              ...state.runDetailsById,
              [runId]: runDetail
            };
          }

          return { ...state, ...baseStateUpdates };
        });
      });

      const unsubRunStarted = wsClient.on('run.started', (event: any) => {
        const { runId, conversationId, run } = event.data;
        const targetConvId = conversationId || get().activeConversationId;

        set(state => {
          const runDetail = run ? {
            ...run,
            steps: run.steps?.map((s: any) => ({
              ...s,
              log: s.log || s.logs || '',
              description: s.description || s.task || ''
            })) || []
          } : undefined;

          const baseStateUpdates: any = {};
          if (runDetail) {
            baseStateUpdates.runDetailsById = {
              ...state.runDetailsById,
              [runId]: runDetail
            };
          }
          return { ...state, ...baseStateUpdates };
        });

        if (runId) {
          get().loadSandboxFileTree(runId);
        }
      });

      const unsubLockAcquired = wsClient.on('workspace.mutation_lock.acquired', (event: any) => {
        console.log('[WS] workspace.mutation_lock.acquired', event.data);
      });

      const unsubLockReleased = wsClient.on('workspace.mutation_lock.released', (event: any) => {
        console.log('[WS] workspace.mutation_lock.released', event.data);
      });

      const unsubRunCreated = wsClient.on('run.created', (event: any) => {
        const { runId, conversationId, run } = event.data;
        const targetConvId = conversationId || get().activeConversationId;

        set(state => {
          const runDetail = run ? {
            ...run,
            steps: run.steps?.map((s: any) => ({
              ...s,
              log: s.log || s.logs || '',
              description: s.description || s.task || ''
            })) || []
          } : undefined;

          const updatedAgents = run ? state.agents.map((a: any) =>
            run.dag?.nodes?.some((n: any) => n.agentId === a.id) || run.agentId === a.id
              ? { ...a, status: 'thinking' as const }
              : a
          ) : state.agents;

          const baseStateUpdates: any = {
            agents: updatedAgents,
            rightPanelTab: 'sandbox'
          };

          if (targetConvId) {
            baseStateUpdates.runsByConversationId = {
              ...state.runsByConversationId,
              [targetConvId]: state.runsByConversationId[targetConvId]?.includes(runId)
                ? state.runsByConversationId[targetConvId]
                : [runId, ...(state.runsByConversationId[targetConvId] || [])]
            };
            baseStateUpdates.activeRunIdByConversationId = {
              ...state.activeRunIdByConversationId,
              [targetConvId]: runId
            };
          }

          if (runDetail) {
            baseStateUpdates.runDetailsById = {
              ...state.runDetailsById,
              [runId]: runDetail
            };
            baseStateUpdates.runFilesByRunId = {
              ...state.runFilesByRunId,
              [runId]: runDetail.files || []
            };
            baseStateUpdates.runConflictsByRunId = {
              ...state.runConflictsByRunId,
              [runId]: runDetail.conflicts || []
            };
          }

          const mergedState = { ...state, ...baseStateUpdates };
          return targetConvId ? updateSandboxStatusMessage(mergedState, targetConvId, runId) : mergedState;
        });

        if (run) {
          get().loadSandboxFileTree(runId);
        } else {
          get().loadSandboxRunDetail(runId);
        }
      });

      const unsubRunStepStarted = wsClient.on('run.step.started', (event: any) => {
        const { runId, stepId, status, run, steps, step } = event.data;
        set(state => {
          const existingRun = state.runDetailsById[runId];
          const incomingSteps = run?.steps || steps || existingRun?.steps || [];
          const mergedSteps = mergeRunSteps(
            existingRun?.steps,
            incomingSteps,
            stepId,
            step || { status: status || 'running' }
          );

          const baseRun = run || existingRun;
          if (!baseRun) {
            setTimeout(() => get().loadSandboxRunDetail(runId), 0);
            return {};
          }

          const updatedDag = baseRun.dag ? {
            ...baseRun.dag,
            nodes: baseRun.dag.nodes?.map((n: any) => {
              const isMatch = n.id === stepId || (step && n.id === step.id);
              if (isMatch) {
                return { ...n, status: status || step?.status || 'running' };
              }
              return n;
            }) || []
          } : undefined;

          const runDetail = {
            ...baseRun,
            steps: mergedSteps,
            dag: updatedDag || baseRun.dag
          };

          // Link active step's agent to 'thinking' status
          const agentIdToThink = step?.agentId || baseRun.steps?.find((s: any) => s.id === stepId)?.agentId;
          const updatedAgents = state.agents.map(a =>
            a.id === agentIdToThink ? { ...a, status: 'thinking' as const } : a
          );

          const nextState = {
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: runDetail
            },
            agents: updatedAgents
          };
          const mergedState = { ...state, ...nextState };
          return updateSandboxStatusMessage(mergedState, baseRun.conversationId || state.activeConversationId, runId);
        });
      });

      const unsubRunStepLog = wsClient.on('run.step.log', (event: any) => {
        const { runId, stepId, log } = event.data;
        set(state => {
          const targetRun = state.runDetailsById[runId];
          if (!targetRun) return {};
          const updatedSteps = targetRun.steps?.map((step: any) => {
            if (step.id === stepId) {
              const currentLog = step.log || step.logs || '';
              return { 
                ...step, 
                log: currentLog + log,
                logs: currentLog + log
              };
            }
            return step;
          }) || [];
          const nextState = {
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: {
                ...targetRun,
                steps: updatedSteps
              }
            }
          };
          const mergedState = { ...state, ...nextState };
          return updateSandboxStatusMessage(mergedState, targetRun.conversationId || state.activeConversationId, runId);
        });
      });

      const unsubRunStepCompleted = wsClient.on('run.step.completed', (event: any) => {
        const { runId, stepId, status, run, steps, step } = event.data;
        set(state => {
          const existingRun = state.runDetailsById[runId];
          const incomingSteps = run?.steps || steps || existingRun?.steps || [];
          const mergedSteps = mergeRunSteps(
            existingRun?.steps,
            incomingSteps,
            stepId,
            step || { status: status || 'completed' }
          );

          const baseRun = run || existingRun;
          if (!baseRun) {
            setTimeout(() => get().loadSandboxRunDetail(runId), 0);
            return {};
          }

          const updatedDag = baseRun.dag ? {
            ...baseRun.dag,
            nodes: baseRun.dag.nodes?.map((n: any) => {
              const isMatch = n.id === stepId || (step && n.id === step.id);
              if (isMatch) {
                return { ...n, status: status || step?.status || 'completed' };
              }
              return n;
            }) || []
          } : undefined;

          const runDetail = {
            ...baseRun,
            steps: mergedSteps,
            dag: updatedDag || baseRun.dag
          };

          const nextState = {
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: runDetail
            }
          };
          const mergedState = { ...state, ...nextState };
          return updateSandboxStatusMessage(mergedState, baseRun.conversationId || state.activeConversationId, runId);
        });
        const agentName = step?.agentName || '沙箱步骤';
        get().addDesktopNotification(
          '沙箱步骤执行成功',
          `步骤 "${agentName}" 已执行完成。`,
          'success',
          'step'
        );
      });

      const unsubRunStepFailed = wsClient.on('run.step.failed', (event: any) => {
        const { runId, stepId, status, run, steps, step } = event.data;
        set(state => {
          const existingRun = state.runDetailsById[runId];
          const incomingSteps = run?.steps || steps || existingRun?.steps || [];
          const mergedSteps = mergeRunSteps(
            existingRun?.steps,
            incomingSteps,
            stepId,
            step || { status: status || 'failed' }
          );

          const baseRun = run || existingRun;
          if (!baseRun) {
            setTimeout(() => get().loadSandboxRunDetail(runId), 0);
            return {};
          }

          const updatedDag = baseRun.dag ? {
            ...baseRun.dag,
            nodes: baseRun.dag.nodes?.map((n: any) => {
              const isMatch = n.id === stepId || (step && n.id === step.id);
              if (isMatch) {
                return { ...n, status: status || step?.status || 'failed' };
              }
              return n;
            }) || []
          } : undefined;

          const runDetail = {
            ...baseRun,
            steps: mergedSteps,
            dag: updatedDag || baseRun.dag
          };

          const nextState = {
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: runDetail
            }
          };
          const mergedState = { ...state, ...nextState };
          return updateSandboxStatusMessage(mergedState, baseRun.conversationId || state.activeConversationId, runId);
        });
        const agentName = step?.agentName || '沙箱步骤';
        get().addDesktopNotification(
          '沙箱步骤执行失败',
          `步骤 "${agentName}" 执行失败。`,
          'error',
          'error'
        );
      });

      const unsubRunStepConflict = wsClient.on('run.step.conflict', (event: any) => {
        const { runId, stepId, status, run, steps, conflicts, step } = event.data;
        set(state => {
          const existingRun = state.runDetailsById[runId];
          const incomingSteps = run?.steps || steps || existingRun?.steps || [];
          const mergedSteps = mergeRunSteps(
            existingRun?.steps,
            incomingSteps,
            stepId,
            step || { status: status || 'conflict' }
          );

          const baseRun = run || existingRun;
          if (!baseRun) {
            setTimeout(() => get().loadSandboxRunDetail(runId), 0);
            return {};
          }

          const updatedDag = baseRun.dag ? {
            ...baseRun.dag,
            nodes: baseRun.dag.nodes?.map((n: any) => {
              const isMatch = n.id === stepId || (step && n.id === step.id);
              if (isMatch) {
                return { ...n, status: status || step?.status || 'conflict' };
              }
              return n;
            }) || []
          } : undefined;

          const runDetail = {
            ...baseRun,
            steps: mergedSteps,
            dag: updatedDag || baseRun.dag
          };

          const nextState = {
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: runDetail
            },
            runConflictsByRunId: {
              ...state.runConflictsByRunId,
              [runId]: conflicts || runDetail.conflicts || []
            }
          };
          const mergedState = { ...state, ...nextState };
          return updateSandboxStatusMessage(mergedState, baseRun.conversationId || state.activeConversationId, runId);
        });
        const agentName = step?.agentName || '沙箱步骤';
        get().addDesktopNotification(
          '检测到代码冲突',
          `步骤 "${agentName}" 检测到冲突，需要手动合并。`,
          'warning',
          'error'
        );
      });

      const unsubRunCompleted = wsClient.on('run.completed', (event: any) => {
        const { runId, run, files, artifacts } = event.data;
        const targetConvId = run?.conversationId || get().activeConversationId;

        if (run) {
          set(state => {
            const existingRun = state.runDetailsById[runId];
            const mergedSteps = mergeRunSteps(existingRun?.steps, run.steps);
            const runDetail = {
              ...run,
              steps: mergedSteps
            };
            const updatedAgents = state.agents.map(a =>
              a.status === 'thinking' ? { ...a, status: 'online' as const } : a
            );

            const artifactsState = updateArtifactsInState(state, targetConvId || '', artifacts || [], runId);

            const nextState = {
              ...artifactsState,
              runDetailsById: {
                ...state.runDetailsById,
                [runId]: runDetail
              },
              agents: updatedAgents
            };
            return updateSandboxStatusMessage({ ...state, ...nextState }, runDetail.conversationId || state.activeConversationId, runId);
          });
        } else {
          set(state => {
            const updatedAgents = state.agents.map(a =>
              a.status === 'thinking' ? { ...a, status: 'online' as const } : a
            );
            const targetRun = state.runDetailsById[runId];

            const artifactsState = updateArtifactsInState(state, targetConvId || '', artifacts || [], runId);

            const nextState = {
              ...artifactsState,
              agents: updatedAgents
            };
            if (targetRun) {
              const updatedRun = { ...targetRun, status: 'completed' as const };
              const nextStateWithRun = {
                ...nextState,
                runDetailsById: {
                  ...state.runDetailsById,
                  [runId]: updatedRun
                }
              };
              return updateSandboxStatusMessage({ ...state, ...nextStateWithRun }, updatedRun.conversationId || state.activeConversationId, runId);
            }
            return nextState;
          });
        }

        if (files) {
          set(state => ({
            runFilesByRunId: {
              ...state.runFilesByRunId,
              [runId]: files
            }
          }));
        }
        if (run) {
          get().loadSandboxFileTree(runId);
        } else {
          get().loadSandboxRunDetail(runId);
          get().loadSandboxFiles(runId);
          get().loadSandboxFileTree(runId);
        }
        get().addDesktopNotification(
          '沙箱运行已完成',
          `沙箱任务 (ID: ${runId}) 已成功执行完成。`,
          'success',
          'task'
        );
      });

      const unsubRunFailed = wsClient.on('run.failed', (event: any) => {
        const { runId, run, artifacts } = event.data;
        const targetConvId = run?.conversationId || get().activeConversationId;

        if (run) {
          set(state => {
            const existingRun = state.runDetailsById[runId];
            const mergedSteps = mergeRunSteps(existingRun?.steps, run.steps);
            const runDetail = {
              ...run,
              steps: mergedSteps
            };
            const updatedAgents = state.agents.map(a =>
              a.status === 'thinking' ? { ...a, status: 'online' as const } : a
            );

            const artifactsState = updateArtifactsInState(state, targetConvId || '', artifacts || [], runId);

            const nextState = {
              ...artifactsState,
              runDetailsById: {
                ...state.runDetailsById,
                [runId]: runDetail
              },
              agents: updatedAgents
            };
            return updateSandboxStatusMessage({ ...state, ...nextState }, runDetail.conversationId || state.activeConversationId, runId);
          });
        } else {
          set(state => {
            const updatedAgents = state.agents.map(a =>
              a.status === 'thinking' ? { ...a, status: 'online' as const } : a
            );
            const targetRun = state.runDetailsById[runId];

            const artifactsState = updateArtifactsInState(state, targetConvId || '', artifacts || [], runId);

            const nextState = {
              ...artifactsState,
              agents: updatedAgents
            };
            if (targetRun) {
              const updatedRun = { ...targetRun, status: 'failed' as const };
              const nextStateWithRun = {
                ...nextState,
                runDetailsById: {
                  ...state.runDetailsById,
                  [runId]: updatedRun
                }
              };
              return updateSandboxStatusMessage({ ...state, ...nextStateWithRun }, updatedRun.conversationId || state.activeConversationId, runId);
            }
            return nextState;
          });
          get().loadSandboxRunDetail(runId);
        }
        get().addDesktopNotification(
          '沙箱运行失败',
          `沙箱任务 (ID: ${runId}) 执行失败。`,
          'error',
          'error'
        );
      });

      // ============ Orchestrator Planning 事件处理 ============

      /**
       * 通用规划事件处理器：
       * 1. 将后端已创建好的 message 插入消息流（dedup）
       * 2. 追踪 phase 到 planningPhaseByRunId
       * 3. 若 completed 且含 dagPreview，更新 run dag
       */
      const handlePlanningEvent = (event: any) => {
        const payload = event.data as {
          runId?: string;
          conversationId?: string;
          message?: any;
          phase?: string;
          dagPreview?: any;
          error?: string;
        };
        const { runId, conversationId, message, phase, dagPreview } = payload;

        set(state => {
          // 仅处理当前活跃会话
          if (conversationId && state.activeConversationId !== conversationId) return {};

          const updates: Partial<typeof state> = {};

          // 1. dedup 插入消息
          if (message?.id) {
            const alreadyExists = state.messages.some((m: any) => m.id === message.id);
            if (!alreadyExists) {
              updates.messages = [...state.messages, mapMessageMetadata(message)];
            }
          }

          // 2. 追踪 phase
          if (runId && phase) {
            const existingPhases = state.planningPhaseByRunId[runId] || [];
            if (!existingPhases.includes(phase)) {
              updates.planningPhaseByRunId = {
                ...state.planningPhaseByRunId,
                [runId]: [...existingPhases, phase],
              };
            }
          }

          // 3. completed + dagPreview → 更新 run 的 dag
          if (phase === 'completed' && dagPreview && runId) {
            const existingRun = state.runDetailsById[runId];
            if (existingRun) {
              updates.runDetailsById = {
                ...state.runDetailsById,
                [runId]: {
                  ...existingRun,
                  dag: { ...existingRun.dag, ...dagPreview },
                },
              };
            }
          }

          return updates;
        });
      };

      const unsubPlanningStarted = wsClient.on('orchestrator.planning.started', handlePlanningEvent);
      const unsubPlanningContextReady = wsClient.on('orchestrator.planning.context_ready', handlePlanningEvent);
      const unsubPlanningAgentsSelected = wsClient.on('orchestrator.planning.agents_selected', handlePlanningEvent);
      const unsubPlanningModelStarted = wsClient.on('orchestrator.planning.model_started', handlePlanningEvent);
      const unsubPlanningModelCompleted = wsClient.on('orchestrator.planning.model_completed', handlePlanningEvent);
      const unsubPlanningNormalized = wsClient.on('orchestrator.planning.normalized', handlePlanningEvent);
      const unsubPlanningCompleted = wsClient.on('orchestrator.planning.completed', handlePlanningEvent);
      const unsubPlanningFailed = wsClient.on('orchestrator.planning.failed', handlePlanningEvent);

      const unsubRunRetryScheduled = wsClient.on('run.retry.scheduled', (event: any) => {
        const { runId, retryAttempt, maxRetryAttempts, message } = event.data;
        set(state => ({
          runRetryProgress: {
            ...state.runRetryProgress,
            [runId]: { attempt: retryAttempt, maxAttempts: maxRetryAttempts, message }
          }
        }));
      });

      const unsubRunRetryCreated = wsClient.on('run.retry.created', (event: any) => {
        const { runId, retryOfRunId, run } = event.data;
        const conversationId = run?.conversationId || get().activeConversationId;
        
        set(state => {
          const updatedRetryProgress = { ...state.runRetryProgress };
          delete updatedRetryProgress[retryOfRunId];
          
          const updates: any = {
            runRetryProgress: updatedRetryProgress
          };

          if (conversationId) {
            updates.runsByConversationId = {
              ...state.runsByConversationId,
              [conversationId]: state.runsByConversationId[conversationId]?.includes(runId)
                ? state.runsByConversationId[conversationId]
                : [runId, ...(state.runsByConversationId[conversationId] || [])]
            };
            updates.activeRunIdByConversationId = {
              ...state.activeRunIdByConversationId,
              [conversationId]: runId
            };
            updates.rightPanelTab = 'sandbox';
          }

          if (run) {
            const runDetail = {
              ...run,
              steps: run.steps?.map((s: any) => ({
                ...s,
                log: s.log || s.logs || '',
                description: s.description || s.task || ''
              })) || []
            };
            updates.runDetailsById = {
              ...state.runDetailsById,
              [runId]: runDetail
            };
            updates.runFilesByRunId = {
              ...state.runFilesByRunId,
              [runId]: runDetail.files || []
            };
            updates.runConflictsByRunId = {
              ...state.runConflictsByRunId,
              [runId]: runDetail.conflicts || []
            };
          }

          return updates;
        });

        if (run) {
          get().loadSandboxFileTree(runId);
        } else {
          get().loadSandboxRunDetail(runId);
        }
        get().addDesktopNotification(
          '沙箱正在自动重试',
          `新重试任务 (ID: ${runId}) 已创建。`,
          'info',
          'step'
        );
      });

      const unsubRunStepToolStarted = wsClient.on('run.step.tool.started', (event: any) => {
        const { runId, stepId, toolName, args } = event.data;
        set(state => {
          const targetRun = state.runDetailsById[runId];
          if (!targetRun) return {};
          const updatedSteps = targetRun.steps?.map((step: any) => {
            if (step.id === stepId) {
              const currentLog = step.log || step.logs || '';
              const newLog = `${currentLog}\n⚙️ [Tool Call Started] ${toolName} with args: ${JSON.stringify(args || {})}\n`;
              return { 
                ...step, 
                log: newLog,
                logs: newLog
              };
            }
            return step;
          }) || [];
          const nextState = {
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: {
                ...targetRun,
                steps: updatedSteps
              }
            }
          };
          return updateSandboxStatusMessage({ ...state, ...nextState }, targetRun.conversationId || state.activeConversationId, runId);
        });
      });

      const unsubRunStepToolCompleted = wsClient.on('run.step.tool.completed', (event: any) => {
        const { runId, stepId, toolName } = event.data;
        set(state => {
          const targetRun = state.runDetailsById[runId];
          if (!targetRun) return {};
          const updatedSteps = targetRun.steps?.map((step: any) => {
            if (step.id === stepId) {
              const currentLog = step.log || step.logs || '';
              const newLog = `${currentLog}✅ [Tool Call Completed] ${toolName} success.\n`;
              return { 
                ...step, 
                log: newLog,
                logs: newLog
              };
            }
            return step;
          }) || [];
          const nextState = {
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: {
                ...targetRun,
                steps: updatedSteps
              }
            }
          };
          return updateSandboxStatusMessage({ ...state, ...nextState }, targetRun.conversationId || state.activeConversationId, runId);
        });
      });

      const unsubRunStepToolFailed = wsClient.on('run.step.tool.failed', (event: any) => {
        const { runId, stepId, toolName, error } = event.data;
        set(state => {
          const targetRun = state.runDetailsById[runId];
          if (!targetRun) return {};
          const updatedSteps = targetRun.steps?.map((step: any) => {
            if (step.id === stepId) {
              const currentLog = step.log || step.logs || '';
              const newLog = `${currentLog}❌ [Tool Call Failed] ${toolName} error: ${error || 'Unknown error'}\n`;
              return { 
                ...step, 
                log: newLog,
                logs: newLog
              };
            }
            return step;
          }) || [];
          const nextState = {
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: {
                ...targetRun,
                steps: updatedSteps
              }
            }
          };
          return updateSandboxStatusMessage({ ...state, ...nextState }, targetRun.conversationId || state.activeConversationId, runId);
        });
      });

      (wsClient as any)._unsubs = [
        unsubUserCreated,
        unsubError,
        unsubThinking,
        unsubChunk,
        unsubCompleted,
        unsubArtifact,
        unsubAllCompleted,
        unsubStatusChanged,
        unsubRunCreated,
        unsubRunQueued,
        unsubRunStarted,
        unsubLockAcquired,
        unsubLockReleased,
        unsubRunStepStarted,
        unsubRunStepLog,
        unsubRunStepCompleted,
        unsubRunStepFailed,
        unsubRunStepConflict,
        unsubRunCompleted,
        unsubRunFailed,
        unsubExecutionDecided,
        unsubPlanningStarted,
        unsubPlanningContextReady,
        unsubPlanningAgentsSelected,
        unsubPlanningModelStarted,
        unsubPlanningModelCompleted,
        unsubPlanningNormalized,
        unsubPlanningCompleted,
        unsubPlanningFailed,
        unsubRunRetryScheduled,
        unsubRunRetryCreated,
        unsubRunStepToolStarted,
        unsubRunStepToolCompleted,
        unsubRunStepToolFailed,
      ];
    } catch (e) {
      console.error('[Store] WS 连接失败', e);
      set({ wsStatus: 'disconnected' });
    }
  },

  disconnectWS: () => {
    if ((wsClient as any)._unsubs) {
      (wsClient as any)._unsubs.forEach((unsub: any) => unsub());
      delete (wsClient as any)._unsubs;
    }
    wsClient.disconnect();
    set({ wsStatus: 'disconnected' });
  },

  setReplyContext: (replyContext) => set({ replyContext }),
  setQuoteArtifactRef: (quoteArtifactRef) => set({ quoteArtifactRef }),
  setWebSearchMode: (webSearchMode) => set({ webSearchMode }),

  login: async (email, password) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await loginApi({ email, password });
        if (res.code === 0 && res.data) {
          const user = { ...res.data.user, isLoggedIn: true };
          localStorage.setItem('auth_token', res.data.token);
          localStorage.setItem('ag_user', JSON.stringify(user));
          set({
            currentUser: user as any,
            configuringAgentId: null,
            configuringAgentIsSessionLevel: false,
            isNewConversationOpen: false,
            preselectedAgentId: null,
          });
          
          await get().loadBusinessData();
          return { success: true, message: '登录成功' };
        } else {
          return { success: false, message: res.message || '登录失败' };
        }
      } catch (e: any) {
        console.error(e);
        return { success: false, message: e.response?.data?.message || '登录接口调用失败' };
      }
    }

    try {
      const usersStr = localStorage.getItem('ag_registered_users') || '[]';
      const users = JSON.parse(usersStr);
      const found = users.find((u: any) => u.email.toLowerCase() === email.toLowerCase());

      if (!found) {
        return { success: false, message: '该邮箱尚未注册' };
      }

      if (found.password !== password) {
        return { success: false, message: '密码不正确' };
      }

      const user = { name: found.name, email: found.email, avatar: found.avatar, isLoggedIn: true };
      set({
        currentUser: user,
        configuringAgentId: null,
        configuringAgentIsSessionLevel: false,
        isNewConversationOpen: false,
        preselectedAgentId: null,
      });
      localStorage.setItem('ag_user', JSON.stringify(user));
      return { success: true, message: '登录成功' };
    } catch (e) {
      console.error(e);
      return { success: false, message: '登录出现异常' };
    }
  },

  register: async (name, email, password, avatar) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await registerApi({ name, email, password, avatar });
        if (res.code === 0 && res.data) {
          const user = { ...res.data.user, isLoggedIn: true };
          localStorage.setItem('auth_token', res.data.token);
          localStorage.setItem('ag_user', JSON.stringify(user));
          set({
            currentUser: user as any,
            configuringAgentId: null,
            configuringAgentIsSessionLevel: false,
            isNewConversationOpen: false,
            preselectedAgentId: null,
          });
          
          await get().loadBusinessData();
          return { success: true, message: '注册成功' };
        } else {
          return { success: false, message: res.message || '注册失败' };
        }
      } catch (e: any) {
        console.error(e);
        return { success: false, message: e.response?.data?.message || '注册接口调用失败' };
      }
    }

    try {
      const usersStr = localStorage.getItem('ag_registered_users') || '[]';
      const users = JSON.parse(usersStr);
      const exists = users.some((u: any) => u.email.toLowerCase() === email.toLowerCase());

      if (exists) {
        return { success: false, message: '该邮箱已被注册' };
      }

      const newUser = { name, email, password, avatar };
      users.push(newUser);
      localStorage.setItem('ag_registered_users', JSON.stringify(users));

      // Auto login after registration
      const user = { name, email, avatar, isLoggedIn: true };
      set({ currentUser: user });
      localStorage.setItem('ag_user', JSON.stringify(user));

      return { success: true, message: '注册成功' };
    } catch (e) {
      console.error(e);
      return { success: false, message: '注册出现异常' };
    }
  },

  loginAsGuest: async (name, email, avatar) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await loginAsGuestApi();
        if (res.code === 0 && res.data) {
          const user = { ...res.data.user, isLoggedIn: true };
          localStorage.setItem('auth_token', res.data.token);
          localStorage.setItem('ag_user', JSON.stringify(user));
          set({ currentUser: user as any });
          
          await get().loadBusinessData();
          return;
        }
      } catch (e) {
        console.error(e);
      }
    }

    const user = { name, email, avatar, isLoggedIn: true };
    set({
      currentUser: user,
      configuringAgentId: null,
      configuringAgentIsSessionLevel: false,
      isNewConversationOpen: false,
      preselectedAgentId: null,
    });
    localStorage.setItem('ag_user', JSON.stringify(user));
  },

  logout: async () => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        await logoutApi();
      } catch (e) {
        console.error('Logout API failed', e);
      }
    }
    localStorage.removeItem('auth_token');
    localStorage.removeItem('ag_user');
    get().disconnectWS();
    set({
      currentUser: null,
      activeConversationId: null,
      messages: [],
      pins: [],
      memories: [],
      configuringAgentId: null,
      configuringAgentIsSessionLevel: false,
      isNewConversationOpen: false,
      preselectedAgentId: null,
      replyContext: null,
      quoteArtifactRef: null,
    });
  },

  updateProfile: async (name, email, avatar) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await updateProfileApi({ name, email, avatar });
        if (res.code !== 0) {
          console.error('[Store] 修改个人资料 API 失败', res.message);
        }
      } catch (e) {
        console.error('[Store] 修改个人资料 API 失败', e);
      }
    }
    const user = { name, email, avatar, isLoggedIn: true };
    set({ currentUser: user });
    localStorage.setItem('ag_user', JSON.stringify(user));
  },

  updateSettings: async (newSettings) => {
    const updated = { ...get().settings, ...newSettings };
    set({ settings: updated });
    localStorage.setItem('ag_settings', JSON.stringify(updated));

    try {
      await platform.settings.set(updated);
    } catch (e) {
      console.warn('Failed to save settings via platform:', e);
    }

    if (newSettings.theme) {
      if (newSettings.theme === 'dark') {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  },

  setIsSettingsOpen: (isSettingsOpen) => set({ isSettingsOpen }),
  togglePinMessage: async (messageId) => {
    const { messages, useMockMode, activeConversationId, pins } = get();
    const targetMsg = messages.find(m => m.id === messageId);
    if (!targetMsg) return;

    const newPinned = !targetMsg.isPinned;

    if (useMockMode) {
      let updatedPins = [...pins];
      if (newPinned) {
        updatedPins.push({
          id: `pin-${messageId}-${Date.now()}`,
          conversationId: activeConversationId || '',
          messageId: messageId,
          createdAt: getCurrentFullTime(),
          message: { ...targetMsg, isPinned: true }
        });
      } else {
        updatedPins = updatedPins.filter(p => p.messageId !== messageId);
      }

      set(state => ({
        messages: state.messages.map(m => m.id === messageId ? { ...m, isPinned: newPinned } : m),
        pins: updatedPins
      }));
      return;
    }

    if (!activeConversationId) return;
    
    try {
      if (newPinned) {
        const res = await pinMessage(activeConversationId, messageId);
        if (res.code === 0) {
          set(state => ({
            messages: state.messages.map(m => m.id === messageId ? { ...m, isPinned: true } : m),
            pins: [...state.pins, {
              ...res.data,
              message: res.data.message ? mapMessageMetadata(res.data.message) : res.data.message
            }]
          }));
        }
      } else {
        const res = await unpinMessage(activeConversationId, messageId);
        if (res.code === 0) {
          set(state => ({
            messages: state.messages.map(m => m.id === messageId ? { ...m, isPinned: false } : m),
            pins: state.pins.filter(p => p.messageId !== messageId)
          }));
        }
      }
    } catch (e) {
      console.error('[Store] Pin 消息失败', e);
    }
  },

  deleteMemory: async (memoryId) => {
    const { useMockMode, activeConversationId } = get();
    if (useMockMode) {
      set(state => ({
        memories: state.memories.filter(m => m.id !== memoryId)
      }));
      return;
    }

    if (!activeConversationId) return;
    try {
      const res = await deleteMemory(activeConversationId, memoryId);
      if (res.code === 0) {
        set(state => ({
          memories: state.memories.filter(m => m.id !== memoryId)
        }));
      }
    } catch (e) {
      console.error('[Store] 删除记忆失败', e);
    }
  },

  updateMemory: async (memoryId, content, category) => {
    const { useMockMode, activeConversationId } = get();
    if (useMockMode) {
      set(state => ({
        memories: state.memories.map(m => m.id === memoryId ? { ...m, content, category: category || m.category, updatedAt: getCurrentFullTime() } : m)
      }));
      return;
    }

    if (!activeConversationId) return;
    try {
      const res = await updateMemory(activeConversationId, memoryId, { content, category });
      if (res.code === 0 && res.data) {
        set(state => ({
          memories: state.memories.map(m => m.id === memoryId ? res.data : m)
        }));
      }
    } catch (e) {
      console.error('[Store] 修改记忆失败', e);
    }
  },
  saveEditedArtifact: async (artifactId, newContent) => {
    const { artifacts, useMockMode, activeConversationId } = get();
    const originalArt = artifacts.find(a => a.id === artifactId);
    if (!originalArt) return;

    const nextVer = originalArt.latestVersion + 1;
    const newVersionId = `ver-${artifactId}-${nextVer}-${Date.now()}`;

    let updatedArt: Artifact;
    let newVersion: ArtifactVersion;

    if (!useMockMode) {
      try {
        const res = await updateArtifactContent(artifactId, { 
          content: newContent,
          changeSummary: `用户手动修改`,
          conversationId: activeConversationId || undefined
        });
        if (res.code === 0) {
          updatedArt = res.data;
          newVersion = res.data.currentVersion;
        } else {
          throw new Error(res.message || '更新接口返回错误');
        }
      } catch (e) {
        console.error('[Store] saveEditedArtifact API 调用失败，退回到 Mock 逻辑', e);
        newVersion = {
          id: newVersionId,
          artifactId,
          version: nextVer,
          content: newContent,
          size: newContent.length,
          createdBy: 'user',
          createdByType: 'user',
          parentVersionId: originalArt.currentVersionId,
          createdAt: getCurrentFullTime(),
        };
        updatedArt = {
          ...originalArt,
          currentVersionId: newVersionId,
          latestVersion: nextVer,
          updatedAt: getCurrentFullTime(),
        };
      }
    } else {
      newVersion = {
        id: newVersionId,
        artifactId,
        version: nextVer,
        content: newContent,
        size: newContent.length,
        createdBy: 'user',
        createdByType: 'user',
        parentVersionId: originalArt.currentVersionId,
        createdAt: getCurrentFullTime(),
      };
      updatedArt = {
        ...originalArt,
        currentVersionId: newVersionId,
        latestVersion: nextVer,
        updatedAt: getCurrentFullTime(),
      };
    }

    const targetConvId = activeConversationId || originalArt.conversationId;
    const editLogMsg: Message = {
      id: createId('msg'),
      conversationId: targetConvId,
      senderId: 'system',
      senderName: '系统',
      role: 'system',
      type: 'artifact',
      artifactId: artifactId,
      content: `生成产物 ${originalArt.title}`,
      createdAt: getCurrentFullTime(),
    };

    set(state => {
      const updatedVersionsList = [...(state.artifactVersions[artifactId] || [])];
      if (!updatedVersionsList.some(v => v.id === newVersion.id)) {
        updatedVersionsList.push(newVersion);
      }

      // Map across conversationArtifacts
      const updatedConversationArtifacts = { ...state.conversationArtifacts };
      Object.keys(updatedConversationArtifacts).forEach(cId => {
        updatedConversationArtifacts[cId] = updatedConversationArtifacts[cId].map(a => 
          a.id === artifactId ? { ...a, ...updatedArt } : a
        );
      });

      // Map across workspaceArtifacts
      const updatedWorkspaceArtifacts = { ...state.workspaceArtifacts };
      Object.keys(updatedWorkspaceArtifacts).forEach(wsId => {
        updatedWorkspaceArtifacts[wsId] = updatedWorkspaceArtifacts[wsId].map(a => 
          a.id === artifactId ? { ...a, ...updatedArt } : a
        );
      });

      const updatedConversationMessages = { ...state.conversationMessages };
      if (useMockMode && targetConvId) {
        updatedConversationMessages[targetConvId] = [
          ...(updatedConversationMessages[targetConvId] || []),
          editLogMsg
        ];
      }

      return {
        artifacts: state.artifacts.map(a => a.id === artifactId ? updatedArt : a),
        conversationArtifacts: updatedConversationArtifacts,
        workspaceArtifacts: updatedWorkspaceArtifacts,
        artifactVersions: {
          ...state.artifactVersions,
          [artifactId]: updatedVersionsList,
        },
        selectedArtifactId: artifactId,
        selectedArtifactVersion: nextVer,
        messages: useMockMode ? [...state.messages, editLogMsg] : state.messages,
        conversationMessages: updatedConversationMessages,
      };
    });
  },

  getContextUsage: async () => {
    const { activeConversationId, useMockMode } = get();
    if (!activeConversationId) return;

    if (!useMockMode) {
      try {
        const res = await getContextUsageApi(activeConversationId);
        if (res.code === 0) {
          get().setContextUsage(res.data);
          return;
        }
      } catch (e) {
        console.warn('[Store] getContextUsage API 调用失败', e);
      }
    }
  },

  setContextUsage: (usage) => {
    set(state => ({
      conversations: state.conversations.map(c =>
        c.id === state.activeConversationId
          ? { ...c, contextUsage: usage }
          : c
      ),
    }));
  },

  // ============ v4 新增：Agent 一对一专属对话系统 Actions ============
  openAgentProfile: (agentId, isSessionLevel = false) => {
    set({ 
      showAgentProfile: true, 
      viewingAgentId: agentId,
      configuringAgentIsSessionLevel: isSessionLevel
    });
  },

  closeAgentProfile: () => {
    set({ 
      showAgentProfile: false, 
      viewingAgentId: null 
    });
  },

  getOrCreateAgentChat: async (agentId: string) => {
    const { conversations, agents, useMockMode, currentUser } = get();
    const targetAgent = agents.find(a => a.id === agentId) || get().allAgents.find(a => a.id === agentId);

    if (targetAgent && (targetAgent.requiresWorkspace === true || targetAgent.supportsContactConversation === false)) {
      set({ preselectedAgentId: agentId, isNewConversationOpen: true });
      alert(`智能体 "${targetAgent.name}" 仅能在工作区会话内使用，请选择或新建一个工作区开始。`);
      throw new Error("Direct contact conversation not supported for this platform agent");
    }

    if (!useMockMode && currentUser) {
      try {
        const userId = currentUser.id || 'user-admin';
        const res = await getAgentContact(userId, agentId);
        if (res && res.code === 40002) {
          console.warn("Backend returned 40002, falling back to local fallback conversation");
        } else if (res.code === 0 && res.data) {
          const apiConv = res.data.conversation;
          const mappedConv: Conversation = {
            ...apiConv,
            mode: 'agent',
          };

          set(state => {
            const hasConv = state.conversations.some(c => c.id === mappedConv.id);
            const nextConvs = hasConv
              ? state.conversations.map(c => c.id === mappedConv.id ? mappedConv : c)
              : [...state.conversations, mappedConv];
            return {
              conversations: mergeLocalFlags(nextConvs)
            };
          });

          await get().setActiveConversationId(mappedConv.id);
          return mappedConv;
        }
      } catch (e: any) {
        console.error('Failed to get or create backend agent contact session, falling back to local creation', e);
      }
    }

    const existing = conversations.find(c => c.mode === 'agent' && c.agentIds && c.agentIds.length === 1 && c.agentIds[0] === agentId);
    if (existing) {
      await get().setActiveConversationId(existing.id);
      return existing;
    }

    const title = targetAgent ? targetAgent.name : '一对一对话';
    const newConv: Conversation = {
      id: `conv-agent-${agentId}`,
      title: title,
      mode: 'agent',
      agentIds: [agentId],
      lastMessage: '',
      updatedAt: getCurrentFullTime(),
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      conversations: mergeLocalFlags([...state.conversations, newConv]),
    }));

    await get().setActiveConversationId(newConv.id);
    return newConv;
  },

  sendAgentChatMessage: async (agentChatId, content) => {
    const { agents } = get();
    const targetAgentChat = get().agentChats.find(c => c.id === agentChatId);
    if (!targetAgentChat) return;

    const targetAgent = agents.find(a => a.id === targetAgentChat.agentId);
    if (!targetAgent) return;

    const userMsg: AgentChatMessage = {
      id: createId('chat-msg'),
      agentChatId,
      senderId: 'user',
      senderName: '用户',
      role: 'user',
      type: 'text',
      content,
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      agentChatMessages: {
        ...state.agentChatMessages,
        [agentChatId]: [...(state.agentChatMessages[agentChatId] || []), userMsg],
      },
      agentChats: state.agentChats.map(c =>
        c.id === agentChatId
          ? { ...c, lastMessage: content, updatedAt: getCurrentFullTime() }
          : c
      ),
    }));

    // Mock 模式演示回复
    await new Promise(r => setTimeout(r, 1000));

    const replyContent = `收到了你的消息："${content}"\n\n我是 ${targetAgent.name}，这是我们一对一专属对话。`;
    const agentMsg: AgentChatMessage = {
      id: createId('chat-msg'),
      agentChatId,
      senderId: targetAgent.id,
      senderName: targetAgent.name,
      role: 'agent',
      type: 'text',
      content: replyContent,
      createdAt: getCurrentFullTime(),
    };

    set(state => ({
      agentChatMessages: {
        ...state.agentChatMessages,
        [agentChatId]: [...(state.agentChatMessages[agentChatId] || []), agentMsg],
      },
      agentChats: state.agentChats.map(c =>
        c.id === agentChatId
          ? { ...c, lastMessage: replyContent, updatedAt: getCurrentFullTime() }
          : c
      ),
    }));
  },

  setShowAgentChatView: (show) => set({ showAgentChatView: show }),

  // ============ Sandbox V1: 按会话和 runId 分离的状态模型 ============
  setRightPanelTab: (tab) => set({ rightPanelTab: tab }),

  addSandboxDebugLog: (type, name, payload, method) => {
    const newLog = {
      id: `log-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      timestamp: new Date().toLocaleTimeString(),
      type,
      name,
      payload,
      method,
    };
    set(state => ({
      sandboxDebugLogs: [newLog, ...state.sandboxDebugLogs].slice(0, 100), // Keep last 100 logs
    }));
  },
  clearSandboxDebugLogs: () => set({ sandboxDebugLogs: [] }),

  getActiveRunId: (conversationId) => {
    const { activeRunIdByConversationId } = get();
    if (!conversationId) return null;
    return activeRunIdByConversationId[conversationId] || null;
  },

  getActiveRun: (conversationId) => {
    const { getActiveRunId, runDetailsById } = get();
    const activeRunId = getActiveRunId(conversationId);
    if (!activeRunId) return null;
    return runDetailsById[activeRunId] || null;
  },

  setSelectedSandboxFilePath: (runId, path) => {
    set(state => ({
      selectedSandboxFilePathByRunId: {
        ...state.selectedSandboxFilePathByRunId,
        [runId || '']: path
      }
    }));
  },

  getSelectedSandboxFilePath: (runId) => {
    const { selectedSandboxFilePathByRunId } = get();
    if (!runId) return null;
    return selectedSandboxFilePathByRunId[runId] || null;
  },

  createSandboxRun: async (prompt, environmentProfile) => {
    const { activeConversationId, useMockMode, conversations } = get();
    if (!activeConversationId) return;

    const conversation = conversations.find(c => c.id === activeConversationId);
    if (conversation) {
      if (conversation.mode === 'agent') {
        alert('智能体联系人会话不支持沙箱任务，请创建单聊或群聊会话并选择/新建工作区。');
        return;
      }
      if (!conversation.workspaceId && !environmentProfile?.workspaceId) {
        alert('请先选择或新建工作区。');
        return;
      }
    }

    const workspaceId = conversation?.workspaceId || environmentProfile?.workspaceId || undefined;

    if (!useMockMode) {
      try {
        const res = await sandboxService.createSandboxRun(activeConversationId, { prompt, environmentProfile, workspaceId });
        if (res.code === 0 && res.data) {
          const runDetail = res.data;
          set(state => ({
            runsByConversationId: {
              ...state.runsByConversationId,
              [activeConversationId]: [runDetail.id, ...(state.runsByConversationId[activeConversationId] || [])]
            },
            activeRunIdByConversationId: {
              ...state.activeRunIdByConversationId,
              [activeConversationId]: runDetail.id
            },
            runDetailsById: {
              ...state.runDetailsById,
              [runDetail.id]: runDetail
            },
            runFilesByRunId: {
              ...state.runFilesByRunId,
              [runDetail.id]: runDetail.files || []
            },
            runConflictsByRunId: {
              ...state.runConflictsByRunId,
              [runDetail.id]: runDetail.conflicts || []
            },
            runFileContentsByRunId: {
              ...state.runFileContentsByRunId,
              [runDetail.id]: {}
            },
            selectedSandboxFilePathByRunId: {
              ...state.selectedSandboxFilePathByRunId,
              [runDetail.id]: null
            },
            rightPanelTab: 'sandbox'
          }));
        }
      } catch (e) {
        console.error('[Store] 创建沙箱失败', e);
      }
    } else {
      const hasConflict = prompt.includes('conflict') || prompt.includes('冲突');
      const hasFailed = prompt.includes('fail') || prompt.includes('失败') || prompt.includes('timeout');
      const hasCancelled = prompt.includes('cancel') || prompt.includes('取消');
      
      const baseRun = mockSandboxNormalScenarios.createNormalCompleteSandboxRun(activeConversationId!);
      
      const pendingRun = {
        ...baseRun,
        status: 'pending' as const,
        steps: baseRun.steps.map((s: any) => ({ ...s, status: 'pending' as const, log: '' })),
        files: [],
        conflicts: [],
        summary: '',
        error: null,
        finishedAt: null
      };
      
      set(state => ({
        runsByConversationId: {
          ...state.runsByConversationId,
          [activeConversationId!]: [pendingRun.id, ...(state.runsByConversationId[activeConversationId!] || [])]
        },
        activeRunIdByConversationId: {
          ...state.activeRunIdByConversationId,
          [activeConversationId!]: pendingRun.id
        },
        runDetailsById: {
          ...state.runDetailsById,
          [pendingRun.id]: pendingRun
        },
        runFilesByRunId: {
          ...state.runFilesByRunId,
          [pendingRun.id]: []
        },
        runConflictsByRunId: {
          ...state.runConflictsByRunId,
          [pendingRun.id]: []
        },
        runFileContentsByRunId: {
          ...state.runFileContentsByRunId,
          [pendingRun.id]: {}
        },
        selectedSandboxFilePathByRunId: {
          ...state.selectedSandboxFilePathByRunId,
          [pendingRun.id]: null
        },
        rightPanelTab: 'sandbox'
      }));
      
      const currentRunId = pendingRun.id;
      let stepDelay = 0;
      
      setTimeout(() => {
        set(state => {
          const targetRun = state.runDetailsById[currentRunId];
          if (!targetRun) return state;
          return {
            runDetailsById: {
              ...state.runDetailsById,
              [currentRunId]: { ...targetRun, status: 'running' as const, startedAt: getCurrentFullTime() }
            }
          };
        });
      }, (stepDelay += 500));
      
      const totalSteps = baseRun.steps.length;
      
      if (hasConflict) {
        for (let i = 0; i < 3; i++) {
          const currentStepIdx = i;
          setTimeout(() => {
            const runId = get().activeRunIdByConversationId[activeConversationId!];
            if (!runId || runId !== currentRunId) return;
            set(state => {
              const targetRun = state.runDetailsById[currentRunId];
              if (!targetRun) return state;
              const updatedSteps = [...targetRun.steps];
              if (updatedSteps[currentStepIdx]) {
                if (i < 2) {
                  updatedSteps[currentStepIdx] = {
                    ...updatedSteps[currentStepIdx],
                    status: 'completed' as const,
                    log: baseRun.steps[i].log
                  };
                } else {
                  const conflictRunData = mockSandboxNormalScenarios.createConflictScenarioSandboxRun(activeConversationId!);
                  updatedSteps[currentStepIdx] = {
                    ...updatedSteps[currentStepIdx],
                    status: 'conflict' as const,
                    log: conflictRunData.steps[2].log
                  };
                  return {
                    runDetailsById: {
                      ...state.runDetailsById,
                      [currentRunId]: {
                        ...targetRun,
                        status: 'conflict' as const,
                        steps: updatedSteps
                      }
                    },
                    runConflictsByRunId: {
                      ...state.runConflictsByRunId,
                      [currentRunId]: conflictRunData.conflicts
                    }
                  };
                }
              }
              return {
                runDetailsById: {
                  ...state.runDetailsById,
                  [currentRunId]: { ...targetRun, steps: updatedSteps }
                }
              };
            });
          }, (stepDelay += 1500));
        }
      } else if (hasFailed) {
        for (let i = 0; i < 2; i++) {
          const currentStepIdx = i;
          setTimeout(() => {
            const runId = get().activeRunIdByConversationId[activeConversationId!];
            if (!runId || runId !== currentRunId) return;
            set(state => {
              const targetRun = state.runDetailsById[currentRunId];
              if (!targetRun) return state;
              const updatedSteps = [...targetRun.steps];
              if (updatedSteps[currentStepIdx]) {
                if (i < 1) {
                  updatedSteps[currentStepIdx] = {
                    ...updatedSteps[currentStepIdx],
                    status: 'completed' as const,
                    log: baseRun.steps[i].log
                  };
                } else {
                  const failedRunData = mockSandboxNormalScenarios.createFailedScenarioSandboxRun(activeConversationId!);
                  updatedSteps[currentStepIdx] = {
                    ...updatedSteps[currentStepIdx],
                    status: 'failed' as const,
                    log: failedRunData.steps[1].log,
                    error: failedRunData.steps[1].error
                  };
                  return {
                    runDetailsById: {
                      ...state.runDetailsById,
                      [currentRunId]: {
                        ...targetRun,
                        status: 'failed' as const,
                        steps: updatedSteps,
                        error: failedRunData.error,
                        finishedAt: getCurrentFullTime()
                      }
                    }
                  };
                }
              }
              return {
                runDetailsById: {
                  ...state.runDetailsById,
                  [currentRunId]: { ...targetRun, steps: updatedSteps }
                }
              };
            });
          }, (stepDelay += 1500));
        }
      } else if (hasCancelled) {
        for (let i = 0; i < 2; i++) {
          const currentStepIdx = i;
          setTimeout(() => {
            const runId = get().activeRunIdByConversationId[activeConversationId!];
            if (!runId || runId !== currentRunId) return;
            set(state => {
              const targetRun = state.runDetailsById[currentRunId];
              if (!targetRun) return state;
              const updatedSteps = [...targetRun.steps];
              if (updatedSteps[currentStepIdx]) {
                if (i < 1) {
                  updatedSteps[currentStepIdx] = {
                    ...updatedSteps[currentStepIdx],
                    status: 'completed' as const,
                    log: baseRun.steps[i].log
                  };
                } else {
                  const cancelledRunData = mockSandboxNormalScenarios.createCancelledScenarioSandboxRun(activeConversationId!);
                  updatedSteps[currentStepIdx] = {
                    ...updatedSteps[currentStepIdx],
                    status: 'blocked' as const,
                    log: cancelledRunData.steps[1].log
                  };
                  return {
                    runDetailsById: {
                      ...state.runDetailsById,
                      [currentRunId]: {
                        ...targetRun,
                        status: 'cancelled' as const,
                        steps: updatedSteps,
                        finishedAt: getCurrentFullTime()
                      }
                    }
                  };
                }
              }
              return {
                runDetailsById: {
                  ...state.runDetailsById,
                  [currentRunId]: { ...targetRun, steps: updatedSteps }
                }
              };
            });
          }, (stepDelay += 1500));
        }
      } else {
        for (let i = 0; i < totalSteps; i++) {
          const currentStepIdx = i;
          setTimeout(() => {
            const runId = get().activeRunIdByConversationId[activeConversationId!];
            if (!runId || runId !== currentRunId) return;
            set(state => {
              const targetRun = state.runDetailsById[currentRunId];
              if (!targetRun) return state;
              const updatedSteps = [...targetRun.steps];
              if (updatedSteps[currentStepIdx]) {
                updatedSteps[currentStepIdx] = {
                  ...updatedSteps[currentStepIdx],
                  status: 'completed' as const,
                  log: baseRun.steps[currentStepIdx].log
                };
              }
              const allStepsDone = i === totalSteps - 1;
              return {
                runDetailsById: {
                  ...state.runDetailsById,
                  [currentRunId]: {
                    ...targetRun,
                    steps: updatedSteps,
                    status: allStepsDone ? 'completed' as const : targetRun.status,
                    summary: allStepsDone ? baseRun.summary : '',
                    finishedAt: allStepsDone ? getCurrentFullTime() : targetRun.finishedAt
                  }
                },
                runFilesByRunId: allStepsDone ? {
                  ...state.runFilesByRunId,
                  [currentRunId]: baseRun.files
                } : state.runFilesByRunId,
                runFileContentsByRunId: allStepsDone ? {
                  ...state.runFileContentsByRunId,
                  [currentRunId]: baseRun.files.reduce((acc: Record<string, string>, f: any) => {
                    acc[f.path] = mockSandboxNormalScenarios.getMockFileContent(f.path);
                    return acc;
                  }, {} as Record<string, string>)
                } : state.runFileContentsByRunId
              };
            });
          }, (stepDelay += 1500));
        }
      }
    }
  },

  loadSandboxRunList: async (conversationId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxRunList(conversationId);
        if (res.code === 0 && res.data) {
          const list = res.data.list;
          const activeRunAgents = new Set<string>();
          const newRunsById = { ...get().runDetailsById };
          list.forEach((run: any) => {
            newRunsById[run.id] = run;
            if (run.status === 'pending' || run.status === 'running') {
              const activeSteps = run.steps || [];
              const runningStep = activeSteps.find((s: any) => s.status === 'running');
              if (runningStep) {
                activeRunAgents.add(runningStep.agentId);
              } else {
                const pendingStep = activeSteps.find((s: any) => s.status === 'pending');
                if (pendingStep) {
                  activeRunAgents.add(pendingStep.agentId);
                } else if (activeSteps.length > 0) {
                  activeRunAgents.add(activeSteps[activeSteps.length - 1].agentId);
                }
              }
            }
          });
          set(state => {
            const currentActiveRunId = state.activeRunIdByConversationId[conversationId];
            const isValidActive = currentActiveRunId && list.some((r: any) => r.id === currentActiveRunId);
            const nextActiveRunId = isValidActive ? currentActiveRunId : (list.length > 0 ? list[0].id : null);
            return {
              runsByConversationId: {
                ...state.runsByConversationId,
                [conversationId]: list.map((r: any) => r.id)
              },
              activeRunIdByConversationId: {
                ...state.activeRunIdByConversationId,
                [conversationId]: nextActiveRunId
              },
              runDetailsById: newRunsById,
              agents: state.agents.map(a =>
                activeRunAgents.has(a.id) ? { ...a, status: 'thinking' as const } : a
              )
            };
          });
        }
      } catch (e) {
        console.error('[Store] 获取沙箱任务列表失败', e);
      }
    }
  },

  loadSandboxRunDetail: async (runId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxRunDetail(runId);
        if (res.code === 0 && res.data) {
          const runDetail = res.data;
          if (runDetail.steps) {
            set(state => {
              const existingRun = state.runDetailsById[runId];
              const mergedSteps = mergeRunSteps(existingRun?.steps, runDetail.steps);
              runDetail.steps = mergedSteps;
              return {
                runDetailsById: {
                  ...state.runDetailsById,
                  [runId]: runDetail
                },
                runFilesByRunId: {
                  ...state.runFilesByRunId,
                  [runId]: runDetail.files || []
                },
                runConflictsByRunId: {
                  ...state.runConflictsByRunId,
                  [runId]: runDetail.conflicts || []
                },
                runsByConversationId: runDetail.conversationId ? {
                  ...state.runsByConversationId,
                  [runDetail.conversationId]: state.runsByConversationId[runDetail.conversationId]?.includes(runId)
                    ? state.runsByConversationId[runDetail.conversationId]
                    : [runId, ...(state.runsByConversationId[runDetail.conversationId] || [])]
                } : state.runsByConversationId
              };
            });
          } else {
            set(state => ({
              runDetailsById: {
                ...state.runDetailsById,
                [runId]: runDetail
              },
              runFilesByRunId: {
                ...state.runFilesByRunId,
                [runId]: runDetail.files || []
              },
              runConflictsByRunId: {
                ...state.runConflictsByRunId,
                [runId]: runDetail.conflicts || []
              },
              runsByConversationId: runDetail.conversationId ? {
                ...state.runsByConversationId,
                [runDetail.conversationId]: state.runsByConversationId[runDetail.conversationId]?.includes(runId)
                  ? state.runsByConversationId[runDetail.conversationId]
                  : [runId, ...(state.runsByConversationId[runDetail.conversationId] || [])]
              } : state.runsByConversationId
            }));
          }
          get().loadSandboxFileTree(runId);
        }
      } catch (e) {
        console.error('[Store] 获取沙箱运行详情失败', e);
      }
    }
  },

  loadSandboxFiles: async (runId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxFiles(runId);
        if (res.code === 0 && res.data) {
          set(state => ({
            runFilesByRunId: {
              ...state.runFilesByRunId,
              [runId]: res.data
            }
          }));
        }
      } catch (e) {
        console.error('[Store] 获取沙箱文件列表失败', e);
      }
    }
  },

  loadSandboxFileContent: async (runId, path) => {
    const { useMockMode, runFileContentsByRunId } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxFileContent(runId, path);
        if (res.code === 0 && res.data) {
          set(state => ({
            runFileContentsByRunId: {
              ...state.runFileContentsByRunId,
              [runId]: {
                ...(state.runFileContentsByRunId[runId] || {}),
                [path]: res.data.content
              }
            }
          }));
          return res.data.content;
        }
      } catch (e) {
        console.error('[Store] 读取沙箱文件内容失败', e);
      }
    } else {
      const contents = runFileContentsByRunId[runId] || {};
      if (contents[path]) return contents[path];
    }
    return '';
  },

  loadSandboxConflicts: async (runId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxConflicts(runId);
        if (res.code === 0 && res.data) {
          set(state => ({
            runConflictsByRunId: {
              ...state.runConflictsByRunId,
              [runId]: res.data
            }
          }));
        }
      } catch (e) {
        console.error('[Store] 获取沙箱冲突列表失败', e);
      }
    }
  },

  resolveSandboxConflict: async (runId, conflictId, resolution, content) => {
    const { useMockMode, getActiveRun, runConflictsByRunId } = get();
    const activeConvId = get().activeConversationId;
    const activeRun = getActiveRun(activeConvId);
    
    if (!useMockMode) {
      try {
        const res = await sandboxService.resolveSandboxConflict(runId, conflictId, resolution, content);
        if (res.code === 0 && res.data) {
          await get().loadSandboxRunDetail(runId);
          await get().loadSandboxFiles(runId);
          await get().loadSandboxConflicts(runId);
        }
      } catch (e) {
        console.error('[Store] 解决冲突失败', e);
      }
    } else {
      // Mock resolve simulation
      const conflicts = runConflictsByRunId[runId] || [];
      const conflict = conflicts.find(c => c.id === conflictId);
      if (!conflict || !activeRun) return;

      const resolvedContent = resolution === 'current'
        ? '# Original Content\nThis was preserved.'
        : resolution === 'incoming'
          ? conflict.incomingContent
          : (content || '');

      // Mark conflict as resolved
      const nextConflicts = conflicts.map(c =>
        c.id === conflictId
          ? { ...c, status: 'resolved' as const, resolution }
          : c
      );

      set(state => ({
        runConflictsByRunId: {
          ...state.runConflictsByRunId,
          [runId]: nextConflicts
        },
        runFileContentsByRunId: {
          ...state.runFileContentsByRunId,
          [runId]: {
            ...(state.runFileContentsByRunId[runId] || {}),
            [conflict.filePath]: resolvedContent
          }
        }
      }));

      // Simulate step-3 complete, step-4 start after conflict resolution
      setTimeout(() => {
        const currentRun = getActiveRun(activeConvId);
        if (!currentRun || currentRun.id !== runId) return;
        
        const currentSteps = currentRun.steps.map((s: any) => {
          if (s.id === 'step-3') {
            return {
              ...s,
              status: 'completed' as const,
              description: '写入源文件已完成',
              log: (s.log || '') + `[System] Conflict resolved via resolution=${resolution}.\n[Agent: Claude Code] File README.md resolved and written.\n`
            };
          }
          if (s.id === 'step-4') {
            return {
              ...s,
              status: 'running' as const,
              log: (s.log || '') + '[Agent: Codex] Starting compilation and test script execution...\n'
            };
          }
          return s;
        });

        const currentNodes = currentRun.dag.nodes.map((n: any) => {
          if (n.id === 'step-3') return { ...n, status: 'completed' as const };
          if (n.id === 'step-4') return { ...n, status: 'running' as const };
          return n;
        });

        const mockFiles = [
          {
            id: 'file-readme',
            sandboxId: currentRun.sandboxId || '',
            runId,
            path: conflict.filePath,
            contentHash: 'hash-resolved',
            currentVersion: 2,
            createdAt: getCurrentFullTime(),
            updatedAt: getCurrentFullTime()
          }
        ];

        set(state => ({
          runDetailsById: {
            ...state.runDetailsById,
            [runId]: {
              ...state.runDetailsById[runId],
              status: 'running' as const,
              steps: currentSteps,
              dag: { nodes: currentNodes },
              files: mockFiles,
              conflicts: []
            }
          },
          runFilesByRunId: {
            ...state.runFilesByRunId,
            [runId]: mockFiles
          },
          runConflictsByRunId: {
            ...state.runConflictsByRunId,
            [runId]: []
          }
        }));

        // Finally step 4 completes
        setTimeout(() => {
          const finalRun = getActiveRun(activeConvId);
          if (!finalRun || finalRun.id !== runId) return;
          const finalSteps = finalRun.steps.map((s: any) => {
            if (s.id === 'step-4') {
              return {
                ...s,
                status: 'completed' as const,
                log: (s.log || '') + '[Agent: Codex] Compilation success. Test scripts: OK.\n[System] Sandbox V1 complete.\n'
              };
            }
            return s;
          });

          const finalNodes = finalRun.dag.nodes.map((n: any) => {
            if (n.id === 'step-4') return { ...n, status: 'completed' as const };
            return n;
          });

          set(state => ({
            runDetailsById: {
              ...state.runDetailsById,
              [runId]: {
                ...state.runDetailsById[runId],
                status: 'completed' as const,
                steps: finalSteps,
                dag: { nodes: finalNodes },
                finishedAt: getCurrentFullTime()
              }
            }
          }));
        }, 2000);

      }, 1000);
    }
  },

  cancelSandboxRun: async (runId) => {
    const { useMockMode } = get();

    // 1. Optimistic Update (Immediate UI response)
    set(state => {
      const current = state.runDetailsById[runId];
      if (!current) return {};
      
      const updatedSteps = current.steps?.map((s: any) => {
        if (s.status === 'running' || s.status === 'pending') {
          return { 
            ...s, 
            status: 'failed' as const, 
            log: (s.log || '') + '\n[System] 用户已终止任务执行。' 
          };
        }
        return s;
      }) || [];

      const updatedAgents = state.agents.map(a => {
        if (a.status === 'thinking') {
          return { ...a, status: 'online' as const };
        }
        return a;
      });

      return {
        runDetailsById: {
          ...state.runDetailsById,
          [runId]: {
            ...current,
            status: 'cancelled' as const,
            finishedAt: getCurrentFullTime(),
            steps: updatedSteps
          }
        },
        agents: updatedAgents
      };
    });

    if (!useMockMode) {
      try {
        const res = await sandboxService.cancelSandboxRun(runId);
        if (res.code === 0 && res.data) {
          set(state => {
            const backendData = res.data;
            const updatedAgents = state.agents.map(a => {
              if (a.status === 'thinking') {
                return { ...a, status: 'online' as const };
              }
              return a;
            });
            return {
              runDetailsById: {
                ...state.runDetailsById,
                [runId]: {
                  ...state.runDetailsById[runId],
                  ...backendData,
                  status: 'cancelled' as const
                }
              },
              agents: updatedAgents
            };
          });
        }
      } catch (e) {
        console.error('[Store] 取消沙箱失败', e);
      }
    }
  },

  rollbackSandboxRun: async (runId) => {
    const { useMockMode, activeConversationId } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.rollbackSandboxRun(runId);
        if (res.code === 0 && res.data) {
          set(state => {
            let updates: any = {
              runDetailsById: {
                ...state.runDetailsById,
                [runId]: res.data
              }
            };
            return updates;
          });

          // 完全重新从服务器拉取 workspace artifact list，不依赖本地缓存的增量计算
          const runDetail = res.data;
          const workspaceId = runDetail?.workspaceId;
          const conversationId = runDetail?.conversationId || activeConversationId;

          if (workspaceId) {
            try {
              const wsArtifactsRes = await getWorkspaceArtifacts(workspaceId);
              if (wsArtifactsRes.code === 0 && wsArtifactsRes.data) {
                set(state => ({
                  workspaceArtifacts: {
                    ...state.workspaceArtifacts,
                    [workspaceId]: wsArtifactsRes.data
                  }
                }));
              }
            } catch (e) {
              console.warn('[Store] 刷新 workspace artifacts 失败', e);
            }
          }

          if (conversationId) {
            try {
              const convArtifactsRes = await getArtifactMetaList(conversationId);
              if (convArtifactsRes.code === 0 && convArtifactsRes.data) {
                set(state => ({
                  conversationArtifacts: {
                    ...state.conversationArtifacts,
                    [conversationId]: convArtifactsRes.data
                  }
                }));
              }
            } catch (e) {
              console.warn('[Store] 刷新 conversation artifacts 失败', e);
            }
          }
        }
      } catch (e) {
        console.error('[Store] 撤销沙箱更改失败', e);
        throw e;
      }
    } else {
      set(state => {
        const current = state.runDetailsById[runId];
        if (!current) return {};
        return {
          runDetailsById: {
            ...state.runDetailsById,
            [runId]: {
              ...current,
              status: 'cancelled' as const,
              finishedAt: getCurrentFullTime()
            }
          }
        };
      });
    }
  },

  retrySandboxRun: async (runId) => {
    const { useMockMode, activeConversationId } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.retrySandboxRun(runId);
        if (res.code === 0 && res.data) {
          const newRun = res.data.run;
          const conversationId = newRun?.conversationId || activeConversationId;
          if (conversationId && newRun) {
            set(state => ({
              runsByConversationId: {
                ...state.runsByConversationId,
                [conversationId]: state.runsByConversationId[conversationId]?.includes(newRun.id)
                  ? state.runsByConversationId[conversationId]
                  : [newRun.id, ...(state.runsByConversationId[conversationId] || [])]
              },
              activeRunIdByConversationId: {
                ...state.activeRunIdByConversationId,
                [conversationId]: newRun.id
              },
              runDetailsById: {
                ...state.runDetailsById,
                [newRun.id]: {
                  ...newRun,
                  steps: newRun.steps?.map((s: any) => ({
                    ...s,
                    log: s.log || s.logs || '',
                    description: s.description || s.task || ''
                  })) || []
                }
              },
              rightPanelTab: 'sandbox'
            }));
            get().loadSandboxFileTree(newRun.id);
          }
        }
      } catch (e) {
        console.error('[Store] 重试沙箱运行失败', e);
        throw e;
      }
    } else {
      // Mock Mode retry simulation
      const current = get().runDetailsById[runId];
      if (!current) return;
      const newRunId = `run-retry-${Date.now()}`;
      const conversationId = current.conversationId || activeConversationId;
      if (!conversationId) return;

      const newRun = {
        ...current,
        id: newRunId,
        status: 'running' as const,
        createdAt: getCurrentFullTime(),
        startedAt: getCurrentFullTime(),
        finishedAt: null,
        steps: [
          {
            id: 'step-1',
            runId: newRunId,
            agentId: 'system',
            agentName: 'System',
            status: 'completed' as const,
            description: '重试初始化，清理工作区临时状态',
            createdAt: getCurrentFullTime(),
            updatedAt: getCurrentFullTime(),
          },
          {
            id: 'step-2',
            runId: newRunId,
            agentId: 'agent-orchestrator',
            agentName: 'Orchestrator',
            status: 'running' as const,
            description: '提示词重构：根据上次失败规避并重新运行中...',
            createdAt: getCurrentFullTime(),
            updatedAt: getCurrentFullTime(),
          }
        ],
        dag: {
          nodes: [
            { id: 'step-1', label: 'System', agentId: 'system', status: 'completed' as const, dependencies: [] },
            { id: 'step-2', label: 'Orchestrator', agentId: 'agent-orchestrator', status: 'running' as const, dependencies: ['step-1'] },
          ]
        },
        files: [],
        conflicts: []
      };

      set(state => ({
        runsByConversationId: {
          ...state.runsByConversationId,
          [conversationId]: [newRunId, ...(state.runsByConversationId[conversationId] || [])]
        },
        activeRunIdByConversationId: {
          ...state.activeRunIdByConversationId,
          [conversationId]: newRunId
        },
        runDetailsById: {
          ...state.runDetailsById,
          [newRunId]: newRun
        },
        rightPanelTab: 'sandbox'
      }));

      // Simulate completion after a brief delay
      setTimeout(() => {
        set(state => {
          const runToComplete = state.runDetailsById[newRunId];
          if (!runToComplete) return {};
          return {
            runDetailsById: {
              ...state.runDetailsById,
              [newRunId]: {
                ...runToComplete,
                status: 'completed' as const,
                finishedAt: getCurrentFullTime(),
                steps: runToComplete.steps.map((s: any) =>
                  s.id === 'step-2' ? { ...s, status: 'completed' as const, description: '自动规避上次失败原因并成功完成' } : s
                ),
                dag: {
                  nodes: runToComplete.dag.nodes.map((n: any) =>
                    n.id === 'step-2' ? { ...n, status: 'completed' as const } : n
                  )
                }
              }
            }
          };
        });
      }, 5000);
    }
  },

  setWorkspaceSearchKeyword: (keyword) => set({ workspaceSearchKeyword: keyword }),

  fetchServerWorkspaces: async (status = 'active', page = 1) => {
    const { useMockMode, serverWorkspacePageSize } = get();
    if (useMockMode) {
      let activeList = get().serverWorkspaces;
      let deletedList = get().serverDeletedWorkspaces;
      if (activeList.length === 0 && deletedList.length === 0) {
        activeList = [
          {
            id: 'ws-mock-1',
            name: '项目工作区',
            status: 'active',
            createdAt: '2026-06-05 10:00:00',
            updatedAt: '2026-06-05 10:10:00',
            deletedAt: null,
            conversationCount: 2,
            lastUsedAt: '2026-06-05 10:10:00'
          },
          {
            id: 'ws-mock-2',
            name: '数据分析沙箱',
            status: 'active',
            createdAt: '2026-06-05 11:00:00',
            updatedAt: '2026-06-05 11:30:00',
            deletedAt: null,
            conversationCount: 1,
            lastUsedAt: '2026-06-05 11:30:00'
          }
        ];
        set({ serverWorkspaces: activeList });
      }
      if (status === 'active') {
        set({
          serverWorkspaces: activeList,
          serverWorkspaceTotal: activeList.length,
          serverWorkspacePage: 1
        });
      } else if (status === 'deleted') {
        set({
          serverDeletedWorkspaces: deletedList,
          serverWorkspaceTotal: deletedList.length,
          serverWorkspacePage: 1
        });
      }
      return;
    }
    try {
      const res = await workspaceService.getWorkspaces({ status, page, pageSize: serverWorkspacePageSize });
      if (res.code === 0 && res.data) {
        const items = (res.data as any).items || res.data.list || [];
        if (status === 'active') {
          set({
            serverWorkspaces: items,
            serverWorkspaceTotal: res.data.total,
            serverWorkspacePage: res.data.page
          });
        } else if (status === 'deleted') {
          set({
            serverDeletedWorkspaces: items,
            serverWorkspaceTotal: res.data.total,
            serverWorkspacePage: res.data.page
          });
        }
      }
    } catch (e) {
      console.error('[Store] 获取服务器工作区失败', e);
    }
  },

  createServerWorkspace: async (name) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const newWs: WorkspaceItem = {
        id: `ws-mock-${Date.now()}`,
        name,
        status: 'active',
        createdAt: getCurrentFullTime(),
        updatedAt: getCurrentFullTime(),
        deletedAt: null,
        conversationCount: 0,
        lastUsedAt: getCurrentFullTime()
      };
      set(state => ({
        serverWorkspaces: [newWs, ...state.serverWorkspaces]
      }));
      return newWs;
    }
    const res = await workspaceService.createWorkspace(name);
    if (res.code === 0 && res.data) {
      await get().fetchServerWorkspaces('active');
      return res.data;
    } else {
      throw res;
    }
  },

  renameServerWorkspace: async (id, name) => {
    const { useMockMode } = get();
    if (useMockMode) {
      set(state => ({
        serverWorkspaces: state.serverWorkspaces.map(w => w.id === id ? { ...w, name, updatedAt: getCurrentFullTime() } : w),
        serverCurrentWorkspace: state.serverCurrentWorkspace?.id === id ? { ...state.serverCurrentWorkspace, name, updatedAt: getCurrentFullTime() } : state.serverCurrentWorkspace
      }));
      return;
    }
    const res = await workspaceService.renameWorkspace(id, name);
    if (res.code === 0) {
      await get().fetchServerWorkspaces('active');
      const { serverCurrentWorkspace } = get();
      if (serverCurrentWorkspace && serverCurrentWorkspace.id === id) {
        set({ serverCurrentWorkspace: { ...serverCurrentWorkspace, name } });
      }
    } else {
      throw res;
    }
  },

  deleteServerWorkspace: async (id) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const target = get().serverWorkspaces.find(w => w.id === id);
      if (target) {
        const deletedTarget = { ...target, status: 'deleted' as const, deletedAt: getCurrentFullTime() };
        set(state => ({
          serverWorkspaces: state.serverWorkspaces.filter(w => w.id !== id),
          serverDeletedWorkspaces: [deletedTarget, ...state.serverDeletedWorkspaces],
          serverCurrentWorkspace: state.serverCurrentWorkspace?.id === id ? null : state.serverCurrentWorkspace,
          serverWorkspaceTree: state.serverCurrentWorkspace?.id === id ? null : state.serverWorkspaceTree,
          conversations: state.conversations.map(c => c.workspaceId === id ? { ...c, workspaceId: null } : c)
        }));
      }
      return;
    }
    const res = await workspaceService.deleteWorkspace(id);
    if (res.code === 0) {
      await get().fetchServerWorkspaces('active');
      await get().fetchServerWorkspaces('deleted');
      const { serverCurrentWorkspace, conversations } = get();
      if (serverCurrentWorkspace && serverCurrentWorkspace.id === id) {
        set({ serverCurrentWorkspace: null, serverWorkspaceTree: null });
      }
      // Unbind from conversations
      set({
        conversations: conversations.map(c =>
          c.workspaceId === id ? { ...c, workspaceId: null } : c
        )
      });
    } else {
      throw res;
    }
  },

  restoreServerWorkspace: async (id) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const target = get().serverDeletedWorkspaces.find(w => w.id === id);
      if (target) {
        const restoredTarget = { ...target, status: 'active' as const, deletedAt: null };
        set(state => ({
          serverDeletedWorkspaces: state.serverDeletedWorkspaces.filter(w => w.id !== id),
          serverWorkspaces: [restoredTarget, ...state.serverWorkspaces]
        }));
      }
      return;
    }
    const res = await workspaceService.restoreWorkspace(id);
    if (res.code === 0) {
      await get().fetchServerWorkspaces('active');
      await get().fetchServerWorkspaces('deleted');
    } else {
      throw res;
    }
  },

  purgeServerWorkspace: async (id) => {
    const { useMockMode } = get();
    if (useMockMode) {
      set(state => ({
        serverDeletedWorkspaces: state.serverDeletedWorkspaces.filter(w => w.id !== id)
      }));
      return;
    }
    const res = await workspaceService.purgeWorkspace(id);
    if (res.code === 0) {
      await get().fetchServerWorkspaces('deleted');
    } else {
      throw res;
    }
  },

  loadServerWorkspaceTree: async (id) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const mockTree: ServerWorkspaceTreeNode = {
        name: '项目工作区',
        path: '',
        type: 'directory',
        children: [
          { name: 'src', path: 'src', type: 'directory', children: [
            { name: 'App.tsx', path: 'src/App.tsx', type: 'file' },
            { name: 'index.css', path: 'src/index.css', type: 'file' }
          ] },
          { name: 'package.json', path: 'package.json', type: 'file' },
          { name: 'README.md', path: 'README.md', type: 'file' }
        ]
      };
      set({ serverWorkspaceTree: mockTree });
      return;
    }
    try {
      const res = await workspaceService.getFileTree(id);
      if (res.code === 0 && res.data) {
        set({ serverWorkspaceTree: res.data });
      }
    } catch (e) {
      console.error('[Store] 加载服务器文件树失败', e);
    }
  },

  loadServerFileContent: async (id, path) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const mockContent = path.endsWith('.json') ? '{\n  "name": "mock-project"\n}' : '/* Mock Content for ' + path + ' */';
      const fileData: FileContentData = {
        path,
        name: path.split('/').pop() || '',
        mime: 'text/plain',
        size: mockContent.length,
        sha256: 'mock-sha-' + path,
        isText: true,
        encoding: 'utf-8',
        content: mockContent,
        truncated: false
      };
      set({ serverSelectedFileContent: fileData });
      return mockContent;
    }
    const res = await workspaceService.getFileContent(id, path);
    if (res.code === 0 && res.data) {
      set({ serverSelectedFileContent: res.data });
      return res.data.content;
    }
    return '';
  },

  saveServerFileContent: async (id, path, content) => {
    const { useMockMode, serverSelectedFileContent } = get();
    if (useMockMode) {
      if (serverSelectedFileContent) {
        set({
          serverSelectedFileContent: {
            ...serverSelectedFileContent,
            content,
            sha256: 'mock-sha-updated-' + Date.now()
          }
        });
      }
      return true;
    }
    const baseSha256 = (serverSelectedFileContent && serverSelectedFileContent.path === path) ? serverSelectedFileContent.sha256 : '';
    const res = await workspaceService.saveFileContent(id, path, content, baseSha256);
    if (res.code === 0) {
      await get().loadServerFileContent(id, path);
      await get().loadServerWorkspaceTree(id);
      return true;
    } else {
      throw res;
    }
  },

  uploadServerFile: async (id, dir, file) => {
    const { useMockMode } = get();
    if (useMockMode) {
      const addFileToMockTree = (node: ServerWorkspaceTreeNode): ServerWorkspaceTreeNode => {
        if (node.path === dir || (dir === '' && node.path === '')) {
          const children = node.children || [];
          const exists = children.some(c => c.name === file.name);
          if (exists) {
            throw { code: 40900, message: '文件已存在', data: { error: 'file_exists', path: dir ? `${dir}/${file.name}` : file.name } };
          }
          return {
            ...node,
            children: [...children, { name: file.name, path: dir ? `${dir}/${file.name}` : file.name, type: 'file' }]
          };
        }
        if (node.children) {
          return {
            ...node,
            children: node.children.map(c => addFileToMockTree(c))
          };
        }
        return node;
      };
      const tree = get().serverWorkspaceTree;
      if (tree) {
        try {
          const updated = addFileToMockTree(tree);
          set({ serverWorkspaceTree: updated });
        } catch (e) {
          throw e;
        }
      }
      return;
    }
    const res = await workspaceService.uploadFile(id, dir, file);
    if (res.code === 0) {
      await get().loadServerWorkspaceTree(id);
    } else {
      throw res;
    }
  },

  selectWorkspace: async () => {
    set({ workspaceStatus: 'loading' });
    try {
      const res = await platform.dialog.selectDirectory();
      if (res.success && res.path) {
        const setRes = await platform.workspace.setCurrent(res.path);
        if (setRes.success && setRes.workspace) {
          set({
            currentWorkspace: setRes.workspace,
            workspaceStatus: 'active'
          });
          await get().scanWorkspace();
          // Load recent list
          const recentRes = await platform.workspace.getRecent();
          if (recentRes.success) {
            set({ recentWorkspaces: recentRes.workspaces });
          }
        } else {
          set({ workspaceStatus: 'error' });
        }
      } else {
        set({ workspaceStatus: get().currentWorkspace ? 'active' : 'none' });
      }
    } catch (e) {
      console.error('Select workspace error:', e);
      set({ workspaceStatus: 'error' });
    }
  },

  scanWorkspace: async () => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return;
    try {
      const res = await platform.workspace.scanFiles(currentWorkspace.path);
      if (res.success && res.files) {
        set({ workspaceFiles: res.files });
      }
    } catch (e) {
      console.error('Scan workspace files error:', e);
    }
  },

  clearWorkspace: async () => {
    try {
      await platform.workspace.clearCurrent();
      set({
        currentWorkspace: null,
        workspaceStatus: 'none',
        workspaceFiles: [],
        selectedWorkspaceFilePath: null,
        selectedWorkspaceFileContent: null,
        workspaceContextFiles: []
      });
    } catch (e) {
      console.error('Clear workspace error:', e);
    }
  },

  removeRecentWorkspace: async (workspacePath) => {
    try {
      await platform.workspace.removeRecent(workspacePath);
      const recentRes = await platform.workspace.getRecent();
      if (recentRes.success) {
        set({ recentWorkspaces: recentRes.workspaces });
      }
    } catch (e) {
      console.error('Remove recent workspace error:', e);
    }
  },

  setSelectedWorkspaceFilePath: (path) => {
    set({ selectedWorkspaceFilePath: path });
    if (path) {
      get().loadWorkspaceFileContent(path);
    } else {
      set({ selectedWorkspaceFileContent: null });
    }
  },

  loadWorkspaceFileContent: async (path) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return '';
    try {
      const fullPath = (path.startsWith('/') || path.includes(':')) ? path : `${currentWorkspace.path}/${path}`;
      const res = await platform.file.readText(fullPath);
      if (res.success && res.content !== undefined) {
        set({ selectedWorkspaceFileContent: res.content });
        return res.content;
      }
      return '';
    } catch (e) {
      console.error('Load workspace file content error:', e);
      return '';
    }
  },

  saveWorkspaceFileContent: async (path, content) => {
    const { currentWorkspace } = get();
    if (!currentWorkspace) return false;
    try {
      const fullPath = (path.startsWith('/') || path.includes(':')) ? path : `${currentWorkspace.path}/${path}`;
      const res = await platform.file.writeText(fullPath, content);
      if (res.success) {
        set({ selectedWorkspaceFileContent: content });
        await get().scanWorkspace();
        return true;
      }
      return false;
    } catch (e) {
      console.error('Save workspace file content error:', e);
      return false;
    }
  },

  addFileToContext: (path) => {
    set(state => {
      if (state.workspaceContextFiles.includes(path)) return {};
      return { workspaceContextFiles: [...state.workspaceContextFiles, path] };
    });
  },

  removeFileFromContext: (path) => {
    set(state => ({
      workspaceContextFiles: state.workspaceContextFiles.filter(p => p !== path)
    }));
  },

  clearFileContext: () => {
    set({ workspaceContextFiles: [] });
  },

  loadLocalAgents: async () => {
    try {
      const res = await platform.agentProcess.list();
      if (res.success && res.agents) {
        set({ localAgentProcesses: res.agents });
        // Initialize loading state
        const loading: Record<string, boolean> = {};
        res.agents.forEach((a: any) => {
          loading[a.id] = false;
        });
        set({ localAgentLoading: loading });
      }
    } catch (e) {
      console.error('Load local agents error:', e);
    }
  },

  startLocalAgent: async (id) => {
    set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: true } }));
    try {
      const res = await platform.agentProcess.start(id);
      if (res.success) {
        await get().loadLocalAgents();
        const agent = get().localAgentProcesses.find(a => a.id === id);
        if (agent) {
          await platform.notification.show({
            title: '本地 Agent 正在启动',
            body: `${agent.name} 正在后台启动中...`
          });
        }
      }
    } catch (e) {
      console.error('Start agent error:', e);
    } finally {
      setTimeout(async () => {
        set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: false } }));
        await get().loadLocalAgents();
      }, 2000);
    }
  },

  stopLocalAgent: async (id) => {
    set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: true } }));
    try {
      const res = await platform.agentProcess.stop(id);
      if (res.success) {
        await get().loadLocalAgents();
      }
    } catch (e) {
      console.error('Stop agent error:', e);
    } finally {
      setTimeout(async () => {
        set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: false } }));
        await get().loadLocalAgents();
      }, 1000);
    }
  },

  restartLocalAgent: async (id) => {
    set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: true } }));
    try {
      const res = await platform.agentProcess.restart(id);
      if (res.success) {
        await get().loadLocalAgents();
      }
    } catch (e) {
      console.error('Restart agent error:', e);
    } finally {
      setTimeout(async () => {
        set(state => ({ localAgentLoading: { ...state.localAgentLoading, [id]: false } }));
        await get().loadLocalAgents();
      }, 3000);
    }
  },

  loadLocalAgentLogs: async (id) => {
    try {
      const res = await platform.agentProcess.logs(id);
      if (res.success && res.logs) {
        set(state => ({
          localAgentLogs: { ...state.localAgentLogs, [id]: res.logs || [] }
        }));
      }
    } catch (e) {
      console.error('Load agent logs error:', e);
    }
  },

  applyArtifactToLocal: async (artifactId, versionId, targetPath, autoOverwrite = false) => {
    const artifact = get().artifacts.find(a => a.id === artifactId);
    if (!artifact) return { success: false, error: 'Artifact not found' };

    const versions = get().artifactVersions[artifactId] || [];
    const version = versions.find(v => v.id === versionId || String(v.version) === String(versionId));
    if (!version) return { success: false, error: 'Artifact version not found' };

    const { currentWorkspace } = get();
    let absolutePath = targetPath;
    if (currentWorkspace && !targetPath.startsWith('/') && !targetPath.includes(':')) {
      absolutePath = `${currentWorkspace.path}/${targetPath}`;
    }

    try {
      if (!autoOverwrite) {
        const fileExists = await platform.file.readText(absolutePath);
        if (fileExists.success) {
          return { success: false, conflict: true };
        }
      }

      const writeRes = await platform.file.writeText(absolutePath, version.content);
      if (writeRes.success) {
        await platform.notification.artifactApplied(targetPath);
        
        if (get().activeConversationId) {
          const sysMsg: Message = {
            id: createId('msg'),
            conversationId: get().activeConversationId!,
            senderId: 'system',
            senderName: '系统',
            role: 'system',
            type: 'status',
            content: `📁已成功应用 Artifact "${artifact.title}" (v${version.version}) 到本地路径: \`${targetPath}\``,
            createdAt: getCurrentFullTime()
          };
          set(state => ({
            messages: [...state.messages, sysMsg]
          }));
        }

        get().addDesktopNotification(
          '文件写入成功',
          `Artifact ${artifact.title} 已写入 ${targetPath}`,
          'success'
        );

        return { success: true };
      } else {
        return { success: false, error: writeRes.error || '写入文件失败' };
      }
    } catch (e: any) {
      return { success: false, error: e.message || '操作失败' };
    }
  },

  addDesktopNotification: (title, body, type, eventType) => {
    const newNotification = {
      id: createId('notif'),
      title,
      body,
      timestamp: getCurrentFullTime(),
      type,
      isRead: false
    };
    set(state => ({
      desktopNotifications: [newNotification, ...state.desktopNotifications]
    }));

    // Trigger System-level notifications if enabled in settings
    const { enableNotifications, notifyOnTaskCompleted, notifyOnArtifactCreated, notifyOnAgentError } = get().settings;
    if (enableNotifications) {
      if (eventType === 'step') return; // Do not trigger native system/OS-level popups for minor step completions to avoid spamming
      if (eventType === 'task' && !notifyOnTaskCompleted) return;
      if (eventType === 'artifact' && !notifyOnArtifactCreated) return;
      if (eventType === 'error' && !notifyOnAgentError) return;

      // 1. Electron Desktop Native Bridge Notification
      try {
        if (platform.isDesktop() && platform.notification?.show) {
          platform.notification.show({ title, body });
          return;
        }
      } catch (err) {
        console.warn('Electron platform notification failed, falling back to Web API:', err);
      }

      // 2. HTML5 Browser API standard Notifications
      try {
        if ('Notification' in window) {
          if (Notification.permission === 'granted') {
            new Notification(title, { body, icon: '/favicon.ico' });
          } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
              if (permission === 'granted') {
                new Notification(title, { body, icon: '/favicon.ico' });
              }
            });
          }
        }
      } catch (err) {
        console.warn('Standard Web Notification failed:', err);
      }
    }
  },

  markNotificationAsRead: (id) => {
    set(state => ({
      desktopNotifications: state.desktopNotifications.map(n =>
        n.id === id ? { ...n, isRead: true } : n
      )
    }));
  },

  clearNotifications: () => {
    set({ desktopNotifications: [] });
  },

  loadWorkspaces: async () => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getWorkspaces();
        if (res.code === 0 && res.data) {
          set({ workspaces: res.data.list || [] });
        }
      } catch (e) {
        console.error('[Store] 获取工作区列表失败', e);
      }
    } else {
      set({
        workspaces: [
          {
            id: 'workspace-1',
            ownerUserId: 'user-guest',
            name: 'My Workspace',
            workspacePath: '/tmp/agenthub-sandboxes/workspace-1',
            status: 'active',
            createdAt: getCurrentFullTime(),
            updatedAt: getCurrentFullTime()
          },
          {
            id: 'workspace-2',
            ownerUserId: 'user-guest',
            name: 'Demo Project Workspace',
            workspacePath: '/tmp/agenthub-sandboxes/workspace-2',
            status: 'active',
            createdAt: getCurrentFullTime(),
            updatedAt: getCurrentFullTime()
          }
        ]
      });
    }
  },

  createWorkspace: async (name) => {
    const { useMockMode, workspaces } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.createWorkspace({ name });
        if (res.code === 0 && res.data) {
          const newWorkspace = res.data;
          set({ workspaces: [...workspaces, newWorkspace] });
          return newWorkspace;
        }
      } catch (e) {
        console.error('[Store] 创建工作区失败', e);
      }
    } else {
      const newWorkspace: Workspace = {
        id: `workspace-${Date.now()}`,
        ownerUserId: 'user-guest',
        name,
        workspacePath: `/tmp/agenthub-sandboxes/workspace-${Date.now()}`,
        status: 'active',
        createdAt: getCurrentFullTime(),
        updatedAt: getCurrentFullTime()
      };
      set({ workspaces: [...workspaces, newWorkspace] });
      return newWorkspace;
    }
    return null;
  },

  loadSandboxFileTree: async (runId) => {
    const { useMockMode } = get();
    if (!useMockMode) {
      try {
        const res = await sandboxService.getSandboxFileTree(runId);
        if (res.code === 0 && res.data) {
          set(state => ({
            fileTreeByRunId: {
              ...state.fileTreeByRunId,
              [runId]: res.data
            }
          }));
          return res.data;
        }
      } catch (e) {
        console.error('[Store] 获取沙箱文件目录树失败', e);
      }
    } else {
      const runFiles = get().runFilesByRunId[runId] || [];
      const tree: WorkspaceTreeNode = {
        name: 'workspace',
        type: 'directory',
        children: runFiles.map(f => {
          const parts = f.path.split('/');
          if (parts.length > 1) {
            return {
              name: parts[0],
              type: 'directory' as const,
              children: [
                {
                  name: parts.slice(1).join('/'),
                  type: 'file' as const,
                  path: f.path,
                  file: f
                }
              ]
            };
          }
          return {
            name: f.path,
            type: 'file' as const,
            path: f.path,
            file: f
          };
        })
      };
      set(state => ({
        fileTreeByRunId: {
          ...state.fileTreeByRunId,
          [runId]: tree
        }
      }));
      return tree;
    }
    return null;
  },

  bindConversationWorkspace: async (conversationId, workspaceId) => {
    const { useMockMode, conversations } = get();
    if (!useMockMode) {
      try {
        const res = await updateConversation(conversationId, { workspaceId });
        if (res.code === 0) {
          set({
            conversations: conversations.map(c =>
              c.id === conversationId ? { ...c, workspaceId } : c
            )
          });
        }
      } catch (e) {
        console.error('[Store] 绑定工作区失败', e);
      }
    } else {
      set({
        conversations: conversations.map(c =>
          c.id === conversationId ? { ...c, workspaceId } : c
        )
      });
    }
  },

  addFloatingConversation: (id, x, y) => {
    const { conversations, floatingConversations } = get();
    if (floatingConversations.some(fc => fc.id === id)) {
      set({
        floatingConversations: floatingConversations.map(fc =>
          fc.id === id ? { ...fc, isMinimized: false, isMaximized: false } : fc
        )
      });
      return;
    }
    const newFloating: FloatingConversation = {
      id,
      x: x ?? 100,
      y: y ?? 100,
      width: 450,
      height: 600,
      isMinimized: false,
      isMaximized: false,
    };
    set({
      floatingConversations: [...floatingConversations, newFloating]
    });
  },

  removeFloatingConversation: (id) => {
    set(state => ({
      floatingConversations: state.floatingConversations.filter(fc => fc.id !== id)
    }));
  },

  updateFloatingConversation: (id, updates) => {
    set(state => ({
      floatingConversations: state.floatingConversations.map(fc =>
        fc.id === id ? { ...fc, ...updates } : fc
      )
    }));
  },

  sendMessageToConversation: async (convId, content, attachments, targetAgentId, useSandbox, webSearchMode) => {
    const { useMockMode, conversations, agents } = get();
    const activeConv = conversations.find(c => c.id === convId);
    if (!activeConv) return;

    const newUserMessage: Message = {
      id: createId('msg'),
      conversationId: convId,
      senderId: 'user',
      senderName: '用户',
      role: 'user',
      type: 'text',
      content,
      createdAt: getCurrentFullTime(),
      attachments,
    };

    set(state => {
      const currentMsgs = state.conversationMessages[convId] || [];
      const newMsgs = [...currentMsgs, newUserMessage];
      const syncActive = state.activeConversationId === convId;
      return {
        conversationMessages: {
          ...state.conversationMessages,
          [convId]: newMsgs
        },
        ...(syncActive ? { messages: newMsgs } : {}),
        conversations: state.conversations.map(c =>
          c.id === convId
            ? { ...c, lastMessage: content, updatedAt: getCurrentFullTime() }
            : c
        )
      };
    });

    let finalAttachments = attachments || [];
    const filesToUpload = finalAttachments.filter(a => a.file).map(a => a.file) as File[];

    if (filesToUpload.length > 0) {
      if (!useMockMode) {
        try {
          const { uploadAttachmentBatch } = await import('@/services/http/attachmentService');
          const res = await uploadAttachmentBatch(convId, filesToUpload);
          if (res.code === 0 && res.data && res.data.results) {
            const uploadedAttachments: MessageAttachment[] = [];
            res.data.results.forEach((result) => {
              if (result && result.ok && result.attachment) {
                uploadedAttachments.push(result.attachment);
              }
            });
            finalAttachments = uploadedAttachments;
            set(state => {
              const currentMsgs = state.conversationMessages[convId] || [];
              const updated = currentMsgs.map(m => m.id === newUserMessage.id ? { ...m, attachments: uploadedAttachments } : m);
              const syncActive = state.activeConversationId === convId;
              return {
                conversationMessages: {
                  ...state.conversationMessages,
                  [convId]: updated
                },
                ...(syncActive ? { messages: updated } : {})
              };
            });
          } else {
            console.error("Batch upload failed in store:", res.message);
            set(state => {
              const currentMsgs = state.conversationMessages[convId] || [];
              const updated = currentMsgs.map(m => m.id === newUserMessage.id ? { ...m, attachments: m.attachments?.map(a => ({ ...a, uploadError: '上传失败' })) } : m);
              const syncActive = state.activeConversationId === convId;
              return {
                conversationMessages: {
                  ...state.conversationMessages,
                  [convId]: updated
                },
                ...(syncActive ? { messages: updated } : {})
              };
            });
            return;
          }
        } catch (err: any) {
          console.error("Batch upload failed in store:", err);
          set(state => {
            const currentMsgs = state.conversationMessages[convId] || [];
            const updated = currentMsgs.map(m => m.id === newUserMessage.id ? { ...m, attachments: m.attachments?.map(a => ({ ...a, uploadError: '上传网络错误' })) } : m);
            const syncActive = state.activeConversationId === convId;
            return {
              conversationMessages: {
                ...state.conversationMessages,
                [convId]: updated
              },
              ...(syncActive ? { messages: updated } : {})
            };
          });
          return;
        }
      } else {
        // Mock mode upload simulation
        await new Promise(resolve => setTimeout(resolve, 1000));
        finalAttachments = finalAttachments.map(item => ({
          ...item,
          parseStatus: 'parsed' as const,
          summary: `[Mock 摘要] 这是关于 ${item.name} 的模型提取摘要分析。`,
          meta: item.name.endsWith('.zip') ? { entryCount: 5, parsedEntryCount: 4, skipped: true } : item.meta,
          createdAt: new Date().toISOString()
        }));
        set(state => {
          const currentMsgs = state.conversationMessages[convId] || [];
          const updated = currentMsgs.map(m => m.id === newUserMessage.id ? { ...m, attachments: finalAttachments } : m);
          const syncActive = state.activeConversationId === convId;
          return {
            conversationMessages: {
              ...state.conversationMessages,
              [convId]: updated
            },
            ...(syncActive ? { messages: updated } : {})
          };
        });
      }
    }

    if (useMockMode) {
      (async () => {
        const handled = await handleMockFileAttachments(convId, finalAttachments, set, get);
        if (handled) return;

        setTimeout(() => {
          const replyResult = generateMockReply({
            conversation: activeConv,
            agents,
            userContent: content,
          });
          const replyMsg = replyResult.messages[0] || {
            id: createId('msg'),
            conversationId: convId,
            senderId: activeConv.agentIds[0] || 'assistant',
            senderName: agents.find(a => a.id === activeConv.agentIds[0])?.name || '智能体',
            role: 'agent' as const,
            type: 'text' as const,
            content: '收到您的请求了，正在处理中...',
            createdAt: getCurrentFullTime(),
          };

          const newBotMessage: Message = {
            ...replyMsg,
            role: replyMsg.role as any,
            type: replyMsg.type as any,
          };

          set(state => {
            const currentMsgs = state.conversationMessages[convId] || [];
            const newMsgs = [...currentMsgs, newBotMessage];
            const syncActive = state.activeConversationId === convId;
            return {
              conversationMessages: {
                ...state.conversationMessages,
                [convId]: newMsgs
              },
              ...(syncActive ? { messages: newMsgs } : {}),
              conversations: state.conversations.map(c =>
                c.id === convId
                  ? { ...c, lastMessage: newBotMessage.content, updatedAt: getCurrentFullTime() }
                  : c
              )
            };
          });
        }, 1000);
      })();
    } else {
      try {
        const sendRes = await sendMessageNonStreaming(convId, { 
          content,
          attachments: finalAttachments?.map((a: any) => ({
            id: a.id,
            attachmentId: a.id,
            name: a.name,
            url: a.url,
            type: a.type || a.kind || 'file',
            kind: a.type || a.kind || 'file',
            size: a.size || 0,
            mimeType: a.mimeType || ''
          })),
          targetAgentId,
          useSandbox: useSandbox ? true : undefined,
          executionMode: useSandbox ? 'sandbox' : undefined,
          webSearchMode,
        });

        if (sendRes.code === 40002) {
          alert(`❌ 发送失败：${sendRes.message || '客户端不允许创建 system/status 消息'}`);
          get().addDesktopNotification('发送失败', sendRes.message || '客户端不允许创建 system/status 消息', 'error', 'error');
          set(state => {
            const currentMsgs = state.conversationMessages[convId] || [];
            const filtered = currentMsgs.filter((m: any) => m.id !== newUserMessage.id);
            const syncActive = state.activeConversationId === convId;
            return {
              conversationMessages: {
                ...state.conversationMessages,
                [convId]: filtered
              },
              ...(syncActive ? { messages: filtered } : {})
            };
          });
          return;
        }

        const res = await getMessageList(convId);
        let messagesData: Message[] = [];
        if (res && (res as any).code === 0 && (res as any).data?.list) {
          messagesData = (res as any).data.list.map((m: any) => mapMessageMetadata(m));
        } else if (Array.isArray(res)) {
          messagesData = res;
        }
        set(state => {
          const syncActive = state.activeConversationId === convId;
          return {
            conversationMessages: {
              ...state.conversationMessages,
              [convId]: messagesData
            },
            ...(syncActive ? { messages: messagesData } : {})
          };
        });
      } catch (e: any) {
        console.error('[Store] 发送消息失败', e);
        const errCode = e.response?.data?.code;
        const errMsg = e.response?.data?.message || e.message || '网络请求失败';
        if (errCode === 40002) {
          alert(`❌ 发送失败：${errMsg}`);
          get().addDesktopNotification('发送失败', errMsg, 'error', 'error');
          set(state => {
            const currentMsgs = state.conversationMessages[convId] || [];
            const filtered = currentMsgs.filter((m: any) => m.id !== newUserMessage.id);
            const syncActive = state.activeConversationId === convId;
            return {
              conversationMessages: {
                ...state.conversationMessages,
                [convId]: filtered
              },
              ...(syncActive ? { messages: filtered } : {})
            };
          });
        }
      }
    }
  },

}));

// Auto-sync messages state of the active conversation to conversationMessages dictionary
useAgentHubStore.subscribe((state, prevState) => {
  const activeId = state.activeConversationId;
  if (activeId && state.messages && state.messages !== prevState.messages) {
    const cache = (useAgentHubStore.getState() as any).conversationMessages || {};
    if (cache[activeId] !== state.messages) {
      useAgentHubStore.setState((prev: any) => ({
        conversationMessages: {
          ...prev.conversationMessages,
          [activeId]: state.messages
        }
      }));
    }
  }
  if (activeId && state.artifacts && state.artifacts !== prevState.artifacts) {
    const activeConv = state.conversations.find((c: any) => c.id === activeId);
    const workspaceId = activeConv?.workspaceId;
    if (workspaceId) {
      const cache = (useAgentHubStore.getState() as any).workspaceArtifacts || {};
      if (cache[workspaceId] !== state.artifacts) {
        useAgentHubStore.setState((prev: any) => ({
          workspaceArtifacts: {
            ...prev.workspaceArtifacts,
            [workspaceId]: state.artifacts
          }
        }));
      }
    } else {
      const cache = (useAgentHubStore.getState() as any).conversationArtifacts || {};
      if (cache[activeId] !== state.artifacts) {
        useAgentHubStore.setState((prev: any) => ({
          conversationArtifacts: {
            ...prev.conversationArtifacts,
            [activeId]: state.artifacts
          }
        }));
      }
    }
  }
  if (activeId && state.selectedArtifactId !== prevState.selectedArtifactId) {
    const cache = (useAgentHubStore.getState() as any).conversationSelectedArtifactId || {};
    if (cache[activeId] !== state.selectedArtifactId) {
      useAgentHubStore.setState((prev: any) => ({
        conversationSelectedArtifactId: {
          ...prev.conversationSelectedArtifactId,
          [activeId]: state.selectedArtifactId
        }
      }));
    }
  }
  if (activeId && state.pins && state.pins !== prevState.pins) {
    const cache = (useAgentHubStore.getState() as any).conversationPins || {};
    if (cache[activeId] !== state.pins) {
      useAgentHubStore.setState((prev: any) => ({
        conversationPins: {
          ...prev.conversationPins,
          [activeId]: state.pins
        }
      }));
    }
  }
  if (activeId && state.memories && state.memories !== prevState.memories) {
    const cache = (useAgentHubStore.getState() as any).conversationMemories || {};
    if (cache[activeId] !== state.memories) {
      useAgentHubStore.setState((prev: any) => ({
        conversationMemories: {
          ...prev.conversationMemories,
          [activeId]: state.memories
        }
      }));
    }
  }
});

