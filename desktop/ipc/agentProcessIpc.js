const { ipcMain } = require('electron')

const localAgents = new Map()

function initializeMockAgents() {
  localAgents.set('local-qwen', {
    id: 'local-qwen',
    name: 'Local Qwen',
    provider: 'local-qwen',
    status: 'stopped',
    port: 8000,
    pid: null,
    command: 'python -m vllm.entrypoints.openai.api --model Qwen/Qwen2.5-7B-Instruct',
    workDir: '',
    logs: [],
    createdAt: new Date().toISOString()
  })
  
  localAgents.set('opencode', {
    id: 'opencode',
    name: 'OpenCode',
    provider: 'opencode',
    status: 'stopped',
    port: 8001,
    pid: null,
    command: 'npm run start',
    workDir: '',
    logs: [],
    createdAt: new Date().toISOString()
  })
  
  localAgents.set('codex', {
    id: 'codex',
    name: 'Codex',
    provider: 'codex',
    status: 'stopped',
    port: 8002,
    pid: null,
    command: 'python codex/main.py',
    workDir: '',
    logs: [],
    createdAt: new Date().toISOString()
  })
}

function registerAgentProcessHandlers() {
  initializeMockAgents()

  ipcMain.handle('agent-process:list', async () => {
    try {
      const agents = Array.from(localAgents.values())
      return { success: true, agents }
    } catch (error) {
      console.error('List agents error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent-process:start', async (event, agentId) => {
    try {
      const agent = localAgents.get(agentId)
      if (!agent) {
        return { success: false, error: 'Agent not found' }
      }
      
      agent.status = 'starting'
      agent.logs.push(`[${new Date().toISOString()}] Agent is starting...`)
      
      setTimeout(() => {
        agent.status = 'running'
        agent.pid = Math.floor(Math.random() * 10000) + 1000
        agent.logs.push(`[${new Date().toISOString()}] Agent started successfully, PID: ${agent.pid}`)
      }, 2000)
      
      return { success: true, agent }
    } catch (error) {
      console.error('Start agent error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent-process:stop', async (event, agentId) => {
    try {
      const agent = localAgents.get(agentId)
      if (!agent) {
        return { success: false, error: 'Agent not found' }
      }
      
      agent.status = 'stopping'
      agent.logs.push(`[${new Date().toISOString()}] Agent is stopping...`)
      
      setTimeout(() => {
        agent.status = 'stopped'
        agent.pid = null
        agent.logs.push(`[${new Date().toISOString()}] Agent stopped`)
      }, 1000)
      
      return { success: true, agent }
    } catch (error) {
      console.error('Stop agent error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent-process:restart', async (event, agentId) => {
    try {
      const agent = localAgents.get(agentId)
      if (!agent) {
        return { success: false, error: 'Agent not found' }
      }
      
      agent.status = 'restarting'
      agent.logs.push(`[${new Date().toISOString()}] Agent is restarting...`)
      
      setTimeout(() => {
        agent.status = 'running'
        agent.pid = Math.floor(Math.random() * 10000) + 1000
        agent.logs.push(`[${new Date().toISOString()}] Agent restarted, PID: ${agent.pid}`)
      }, 3000)
      
      return { success: true, agent }
    } catch (error) {
      console.error('Restart agent error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent-process:logs', async (event, agentId) => {
    try {
      const agent = localAgents.get(agentId)
      if (!agent) {
        return { success: false, error: 'Agent not found' }
      }
      
      return { success: true, logs: agent.logs }
    } catch (error) {
      console.error('Get agent logs error:', error)
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('agent-process:status', async (event, agentId) => {
    try {
      const agent = localAgents.get(agentId)
      if (!agent) {
        return { success: false, error: 'Agent not found' }
      }
      
      return { success: true, status: agent.status }
    } catch (error) {
      console.error('Get agent status error:', error)
      return { success: false, error: error.message }
    }
  })
}

module.exports = { registerAgentProcessHandlers }
