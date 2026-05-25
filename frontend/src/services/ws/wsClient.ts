import type { AllWSEvent, ConnectedEvent } from '@/types';

type EventHandler = (event: any) => void;

class AgentHubWSClient {
  private ws: WebSocket | null = null;
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private reconnectAttempts = 0;
  private heartbeatTimer: any = null;
  private reconnectTimer: any = null;
  private readonly MAX_RECONNECT_DELAY = 30000;
  private readonly HEARTBEAT_INTERVAL = 25000;
  private isManualClose = false;
  private url: string = '';

  connect(url?: string): Promise<ConnectedEvent> {
    this.isManualClose = false;
    const targetUrl = url || this.getWebSocketUrl();
    this.url = targetUrl;

    return new Promise((resolve, reject) => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        console.log('[WebSocket] 已连接');
        return;
      }

      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] 连接成功');
        this.startHeartbeat();
        this.reconnectAttempts = 0;
      };

      this.ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.dispatchEvent(parsed);

          if (parsed.type === 'connected') {
            resolve(parsed as ConnectedEvent);
          }
        } catch (err) {
          console.warn('[WebSocket] 解析消息失败', err);
        }
      };

      this.ws.onclose = (event) => {
        console.log('[WebSocket] 连接关闭', event.code);
        this.cleanup();
        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err) => {
        console.error('[WebSocket] 连接错误', err);
        reject(err);
      };
    });
  }

  send(eventType: string, data?: any, eventId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] 连接未就绪，无法发送消息');
      return;
    }

    const payload = {
      type: eventType,
      eventId: eventId ?? `evt-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      data,
    };

    this.ws.send(JSON.stringify(payload));
  }

  on<T = any>(eventType: string, handler: (event: T) => void): () => void {
    if (!this.eventHandlers.has(eventType)) {
      this.eventHandlers.set(eventType, new Set());
    }
    this.eventHandlers.get(eventType)!.add(handler as EventHandler);

    return () => {
      this.off(eventType, handler);
    };
  }

  off<T = any>(eventType: string, handler: (event: T) => void): void {
    const handlers = this.eventHandlers.get(eventType);
    if (handlers) {
      handlers.delete(handler as EventHandler);
    }
  }

  disconnect(): void {
    this.isManualClose = true;
    this.cleanup();
    if (this.ws) {
      this.ws.close(1000, 'manual_close');
      this.ws = null;
    }
  }

  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  private cleanup(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private dispatchEvent(event: AllWSEvent): void {
    const handlers = this.eventHandlers.get(event.type);
    if (handlers) {
      handlers.forEach((h) => h(event));
    }
  }

  private startHeartbeat(): void {
    this.cleanup();
    this.heartbeatTimer = setInterval(() => {
      if (this.isConnected()) {
        this.send('ping');
      }
    }, this.HEARTBEAT_INTERVAL);
  }

  private scheduleReconnect(): void {
    if (this.isManualClose) return;

    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts++), this.MAX_RECONNECT_DELAY);
    console.log(`[WebSocket] ${delay}ms 后尝试重连...`);

    this.reconnectTimer = setTimeout(() => {
      this.connect(this.url).catch((err) => {
        console.error('[WebSocket] 重连失败', err);
      });
    }, delay);
  }

  private getWebSocketUrl(): string {
    let baseUrl = '';
    try {
      const metaEnv = (import.meta as any).env;
      if (metaEnv?.VITE_WS_URL) {
        baseUrl = metaEnv.VITE_WS_URL;
      }
    } catch {
      // ignore
    }

    if (!baseUrl) {
      if (typeof window !== 'undefined') {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        baseUrl = `${protocol}//${window.location.host}/ws`;
      } else {
        baseUrl = 'ws://localhost:8000/ws';
      }
    } else {
      if (baseUrl.startsWith('/')) {
        if (typeof window !== 'undefined') {
          const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
          baseUrl = `${protocol}//${window.location.host}${baseUrl}`;
        } else {
          baseUrl = `ws://localhost:8000${baseUrl}`;
        }
      }

      if (typeof window !== 'undefined' && window.location.protocol === 'https:') {
        if (baseUrl.startsWith('ws://')) {
          baseUrl = baseUrl.replace(/^ws:\/\//, 'wss://');
        } else if (baseUrl.startsWith('http://')) {
          baseUrl = baseUrl.replace(/^http:\/\//, 'wss://');
        } else if (baseUrl.startsWith('https://')) {
          baseUrl = baseUrl.replace(/^https:\/\//, 'wss://');
        }
      } else {
        if (baseUrl.startsWith('http://')) {
          baseUrl = baseUrl.replace(/^http:\/\//, 'ws://');
        } else if (baseUrl.startsWith('https://')) {
          baseUrl = baseUrl.replace(/^https:\/\//, 'wss://');
        }
      }
    }

    const token = localStorage.getItem('auth_token');
    if (token) {
      const separator = baseUrl.includes('?') ? '&' : '?';
      return `${baseUrl}${separator}token=${encodeURIComponent(token)}`;
    }
    return baseUrl;
  }
}

export const wsClient = new AgentHubWSClient();
export default wsClient;
