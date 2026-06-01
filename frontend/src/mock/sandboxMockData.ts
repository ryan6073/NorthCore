import { AgentRunDetail, SandboxFile, SandboxConflict, SandboxHtmlPreview } from '@/types';
import { createId } from '@/utils/id';
import { getCurrentFullTime } from '@/utils/time';

const generateBaseSandboxRun = (conversationId: string, prompt: string, status: AgentRunDetail['status'] = 'pending'): AgentRunDetail => {
  const runId = createId('run');
  return {
    id: runId,
    sandboxId: createId('sb'),
    conversationId,
    ownerUserId: 'user-admin',
    status,
    prompt,
    summary: '',
    error: null,
    createdAt: getCurrentFullTime(),
    updatedAt: getCurrentFullTime(),
    startedAt: null,
    finishedAt: null,
    sandbox: undefined,
    dag: { nodes: [] },
    steps: [],
    files: [],
    conflicts: []
  };
};

const generateStepBase = (runId: string, stepId: string, agentId: string, agentName: string, description: string) => ({
  id: stepId,
  runId,
  agentId,
  agentName,
  status: 'pending' as const,
  description,
  log: '',
  error: null,
  createdAt: getCurrentFullTime(),
  updatedAt: getCurrentFullTime(),
  startedAt: null,
  finishedAt: null
});

const generateFileBase = (runId: string, sandboxId: string, filePath: string, contentHash: string, version: number = 1): SandboxFile => ({
  id: createId('file'),
  sandboxId,
  runId,
  path: filePath,
  contentHash,
  currentVersion: version,
  artifactId: null,
  createdAt: getCurrentFullTime(),
  updatedAt: getCurrentFullTime()
});

export const createNormalCompleteSandboxRun = (conversationId: string): AgentRunDetail => {
  const run = generateBaseSandboxRun(
    conversationId,
    '创建一个 React 项目的 README.md 和 package.json 文件',
    'running'
  );
  
  const nodes = [
    { id: 'step-1', label: '初始化 Docker 沙箱', agentId: 'system', status: 'completed' as const, dependencies: [] as string[] },
    { id: 'step-2', label: '依赖环境配置', agentId: 'agent-orchestrator', status: 'completed' as const, dependencies: ['step-1'] },
    { id: 'step-3', label: '生成 README 文档', agentId: 'agent-doc', status: 'completed' as const, dependencies: ['step-2'] },
    { id: 'step-4', label: '生成 package.json', agentId: 'agent-claude-code', status: 'completed' as const, dependencies: ['step-3'] },
    { id: 'step-5', label: '静态检查与验证', agentId: 'agent-codex', status: 'completed' as const, dependencies: ['step-4'] }
  ];
  
  run.dag = { nodes };
  
  run.steps = [
    {
      ...generateStepBase(run.id, 'step-1', 'system', 'System', '初始化 Docker 沙箱容器，启用 uv 包管理器'),
      status: 'completed',
      log: '[System] docker run --network none -d -v ...\n[System] Docker sandbox initialized successfully.\n[System] uv version 0.5.0 installed.\n[System] Created workspace directory /workspace.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    },
    {
      ...generateStepBase(run.id, 'step-2', 'agent-orchestrator', 'Orchestrator', '分析任务需求，生成 DAG 步骤规划'),
      status: 'completed',
      log: '[Agent: Orchestrator] Starting task design...\n[Agent: Orchestrator] Workspace analysis complete. 2 files targeted.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    },
    {
      ...generateStepBase(run.id, 'step-3', 'agent-doc', 'DocAgent', '生成专业的项目 README 文档'),
      status: 'completed',
      log: '[Agent: DocAgent] Starting to write README.md...\n[Agent: DocAgent] README.md generated.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    },
    {
      ...generateStepBase(run.id, 'step-4', 'agent-claude-code', 'Claude Code', '生成标准的 package.json'),
      status: 'completed',
      log: '[Agent: Claude Code] Starting to write package.json...\n[Agent: Claude Code] package.json validated.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    },
    {
      ...generateStepBase(run.id, 'step-5', 'agent-codex', 'Codex', '静态检查与基础验证'),
      status: 'completed',
      log: '[Agent: Codex] Starting validation check...\n[Agent: Codex] 2 files validated, no errors.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    }
  ];
  
  run.files = [
    generateFileBase(run.id, run.sandboxId, 'README.md', 'hash-readme-1', 1),
    generateFileBase(run.id, run.sandboxId, 'package.json', 'hash-pkg-1', 1)
  ];
  
  run.summary = '✅ 任务完成！已成功生成 README.md 和 package.json，全部 2 个文件通过静态验证。';
  run.status = 'completed';
  run.finishedAt = getCurrentFullTime();
  
  return run;
};

export const createConflictScenarioSandboxRun = (conversationId: string): AgentRunDetail => {
  const run = generateBaseSandboxRun(
    conversationId,
    '修改现有文件 src/App.tsx，与本地工作区文件产生冲突',
    'conflict'
  );
  
  const nodes = [
    { id: 'step-1', label: '初始化容器', agentId: 'system', status: 'completed' as const, dependencies: [] as string[] },
    { id: 'step-2', label: '导入工作区文件', agentId: 'agent-orchestrator', status: 'completed' as const, dependencies: ['step-1'] },
    { id: 'step-3', label: 'App.tsx 修改', agentId: 'agent-claude-code', status: 'conflict' as const, dependencies: ['step-2'] }
  ];
  
  run.dag = { nodes };
  
  run.steps = [
    {
      ...generateStepBase(run.id, 'step-1', 'system', 'System', '初始化 Docker 沙箱'),
      status: 'completed',
      log: '[System] Docker sandbox initialized.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    },
    {
      ...generateStepBase(run.id, 'step-2', 'agent-orchestrator', 'Orchestrator', '扫描并导入工作区已有文件'),
      status: 'completed',
      log: '[Agent: Orchestrator] Workspace scan complete.\n[Agent: Orchestrator] Importing src/App.tsx...\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    },
    {
      ...generateStepBase(run.id, 'step-3', 'agent-claude-code', 'Claude Code', '修改 App.tsx 时检测到冲突'),
      status: 'conflict',
      log: '[Agent: Claude Code] Starting to modify App.tsx...\n[Agent: Claude Code] Conflict detected!\n[Agent: Claude Code] File src/App.tsx already exists with different content.\n',
      startedAt: getCurrentFullTime()
    }
  ];
  
  run.conflicts = [
    {
      id: 'conf-app-1',
      runId: run.id,
      sandboxId: run.sandboxId,
      fileId: 'file-conflict-app',
      filePath: 'src/App.tsx',
      baseVersion: 1,
      currentVersion: 2,
      incomingContent: `import React, { useState } from 'react';\n\nconst App: React.FC = () => {\n  const [count, setCount] = useState(0);\n  return (\n    <div className="app-container">\n      <h1>Hello from Sandbox Modified</h1>\n      <p>Modified in Docker sandbox</p>\n    </div>\n  );\n};\n\nexport default App;`,
      incomingHash: 'hash-incoming-app-2',
      createdByStepId: 'step-3',
      status: 'open',
      createdAt: getCurrentFullTime(),
      resolvedAt: null
    }
  ];
  
  return run;
};

export const createFailedScenarioSandboxRun = (conversationId: string): AgentRunDetail => {
  const run = generateBaseSandboxRun(
    conversationId,
    '执行一个会超时的复杂任务',
    'failed'
  );
  
  const nodes = [
    { id: 'step-1', label: '初始化', agentId: 'system', status: 'completed' as const, dependencies: [] as string[] },
    { id: 'step-2', label: '运行测试命令', agentId: 'agent-codex', status: 'failed' as const, dependencies: ['step-1'] }
  ];
  
  run.dag = { nodes };
  
  run.steps = [
    {
      ...generateStepBase(run.id, 'step-1', 'system', 'System', '初始化沙箱环境'),
      status: 'completed',
      log: '[System] Docker sandbox initialized.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    },
    {
      ...generateStepBase(run.id, 'step-2', 'agent-codex', 'Codex', '执行长时间命令导致超时失败'),
      status: 'failed',
      error: 'Command timed out after 120 seconds. Max allowed duration is 60s.',
      log: '[Agent: Codex] Starting long-running command...\n[Agent: Codex] Command running at 90s...\n[Agent: Codex] Command running at 110s...\n[System] TIMEOUT: Execution exceeded 60s limit, killed process.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    }
  ];
  
  run.error = '沙箱任务执行超时。命令运行超过 60 秒限制，进程被终止。';
  run.finishedAt = getCurrentFullTime();
  
  return run;
};

export const createCancelledScenarioSandboxRun = (conversationId: string): AgentRunDetail => {
  const run = generateBaseSandboxRun(
    conversationId,
    '这个任务在运行过程中被用户主动取消',
    'cancelled'
  );
  
  const nodes = [
    { id: 'step-1', label: '初始化', agentId: 'system', status: 'completed' as const, dependencies: [] as string[] },
    { id: 'step-2', label: '任务运行中被中断', agentId: 'agent-orchestrator', status: 'blocked' as const, dependencies: ['step-1'] }
  ];
  
  run.dag = { nodes };
  
  run.steps = [
    {
      ...generateStepBase(run.id, 'step-1', 'system', 'System', '初始化沙箱'),
      status: 'completed',
      log: '[System] Docker sandbox initialized.\n',
      startedAt: getCurrentFullTime(),
      finishedAt: getCurrentFullTime()
    },
    {
      ...generateStepBase(run.id, 'step-2', 'agent-orchestrator', 'Orchestrator', '任务运行中被用户取消'),
      status: 'blocked',
      log: '[System] CANCEL: User sent cancellation signal, stopping container...\n[System] Docker container stopped gracefully.\n',
      startedAt: getCurrentFullTime()
    }
  ];
  
  run.finishedAt = getCurrentFullTime();
  
  return run;
};

export const getMockFileContent = (filePath: string): string => {
  const contents: Record<string, string> = {
    'README.md': `# NorthCore Project\n\n这是一个在 Docker 沙箱中自动生成的演示项目。\n\n## 特性\n- ✅ 沙箱安全隔离\n- ✅ uv 依赖管理\n- ✅ TypeScript 支持\n\n生成时间: ${getCurrentFullTime()}`,
    'package.json': `{\n  "name": "northcore-sandbox-demo",\n  "version": "1.0.0",\n  "private": true,\n  "scripts": {\n    "dev": "vite",\n    "build": "tsc && vite build"\n  },\n  "dependencies": {\n    "react": "^18.2.0",\n    "react-dom": "^18.2.0"\n  }\n}`,
    'src/App.tsx': `import React, { useState } from 'react';\n\nconst App: React.FC = () => {\n  const [count, setCount] = useState(0);\n  return (\n    <div className="min-h-screen flex items-center justify-center">\n      <h1>Hello World</h1>\n    </div>\n  );\n};\n\nexport default App;`,
    'index.html': `<!DOCTYPE html>\n<html lang="zh-CN">\n<head>\n  <meta charset="UTF-8" />\n  <title>Sandbox Preview</title>\n  <style>\n    body { font-family: system-ui; background: #f0f9ff; display: flex; align-items: center; justify-content: center; min-height: 100vh; }\n    h1 { color: #2563eb; }\n  </style>\n</head>\n<body>\n  <h1>Hello from Sandbox HTML Preview!</h1>\n</body>\n</html>`
  };
  
  return contents[filePath] || `# File: ${filePath}\n\nMock file content generated at ${getCurrentFullTime()}.`;
};

export const createMockHtmlPreview = (filePath: string): SandboxHtmlPreview => {
  const baseHtml = getMockFileContent(filePath);
  return {
    html: baseHtml,
    sourceFilePath: filePath,
    resolvedAssets: [],
    missingAssets: [],
    warnings: []
  };
};

export const sandboxMockScenarios = {
  createNormalCompleteSandboxRun,
  createConflictScenarioSandboxRun,
  createFailedScenarioSandboxRun,
  createCancelledScenarioSandboxRun,
  getMockFileContent,
  createMockHtmlPreview
};
