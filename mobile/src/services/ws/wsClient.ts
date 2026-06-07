import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { API_BASE_URL } from '@/constants/config';
import type { AllWSEvent, ConnectedEvent } from '@/types';

type EventHandler = (event: any) => void;

const isWeb = Platform.OS === 'web';

const getToken = async (): Promise<string | null> => {
  if (isWeb) {
    try {
      return localStorage.getItem('auth_token');
    } catch {
      return null;
    }
  }
  try {
    return await SecureStore.getItemAsync('auth_token');
  } catch {
    return null;
  }
};

class AgentHubWSClient {
  private ws: WebSocket | null = null;
  private eventHandlers = new Map<string, Set<EventHandler>>();
  private reconnectAttempts = 0;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
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
        console.log('[WebSocket] Already connected');
        resolve({ type: 'connected', eventId: 'already_connected', data: { clientId: '' } });
        return;
      }

      let isResolved = false;
      const timeoutTimer = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.warn('[WebSocket] Connection timeout');
          if (this.ws) {
            this.ws.close();
          }
          reject(new Error('WebSocket connection timeout'));
        }
      }, 15000);

      this.ws = new WebSocket(targetUrl);

      this.ws.onopen = () => {
        console.log('[WebSocket] Connected');
        clearTimeout(timeoutTimer);
        this.startHeartbeat();
        this.reconnectAttempts = 0;
        if (!isResolved) {
          isResolved = true;
          resolve({ type: 'connected', eventId: 'onopen', data: { clientId: '' } });
        }
      };

      this.ws.onmessage = (event: MessageEvent) => {
        try {
          const parsed = JSON.parse(event.data as string);
          this.dispatchEvent(parsed);

          if (parsed.type === 'connected' && !isResolved) {
            isResolved = true;
            clearTimeout(timeoutTimer);
            resolve(parsed as ConnectedEvent);
          }
        } catch (err) {
          console.warn('[WebSocket] Parse error', err);
        }
      };

      this.ws.onclose = (event: WebSocketCloseEvent) => {
        console.log('[WebSocket] Closed', event.code);
        clearTimeout(timeoutTimer);
        this.cleanup();
        if (!this.isManualClose) {
          this.scheduleReconnect();
        }
      };

      this.ws.onerror = (err: Event) => {
        console.error('[WebSocket] Error', err);
        clearTimeout(timeoutTimer);
        if (!isResolved) {
          isResolved = true;
          reject(err);
        }
      };
    });
  }

  send(eventType: string, data?: any, eventId?: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      console.warn('[WebSocket] Not connected, cannot send');
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
    console.log(`[WebSocket] Reconnect attempt ${this.reconnectAttempts} in ${delay}ms...`);

    this.reconnectTimer = setTimeout(async () => {
      // Re-fetch token in case it was refreshed since last connect
      let url = this.url;
      if (!url.includes('token=')) {
        const token = await getToken();
        if (token) {
          const wsUrl = this.getWebSocketUrl();
          url = `${wsUrl}?token=${encodeURIComponent(token)}`;
        }
      }
      this.connect(url).catch(() => {
        // onerror already fired; just log attempt count
        console.warn(`[WebSocket] Reconnect #${this.reconnectAttempts} failed, will retry...`);
      });
    }, delay);
  }

  private getWebSocketUrl(): string {
    // Derive WS URL from API_BASE_URL: https://test2.yeolde.fun/api/v1 -> wss://test2.yeolde.fun/ws
    let baseUrl = '';

    if (API_BASE_URL) {
      const wsProtocol = API_BASE_URL.startsWith('https://') ? 'wss:' : 'ws:';
      baseUrl = `${wsProtocol}//${this.extractHost(API_BASE_URL)}/ws`;
    }

    return baseUrl;
  }

  private extractHost(url: string): string {
    try {
      // Remove protocol prefix to get the host
      const withoutProtocol = url.replace(/^https?:\/\//, '');
      // Get host:port part (before first /)
      const host = withoutProtocol.split('/')[0];
      return host;
    } catch {
      return 'test2.yeolde.fun';
    }
  }

  // Call this after getting a fresh token to re-establish WS with auth
  async connectWithToken(token: string): Promise<ConnectedEvent> {
    const wsUrl = this.getWebSocketUrl();
    const separator = wsUrl.includes('?') ? '&' : '?';
    const urlWithToken = `${wsUrl}${separator}token=${encodeURIComponent(token)}`;
    return this.connect(urlWithToken);
  }
}

export const wsClient = new AgentHubWSClient();
export default wsClient;
