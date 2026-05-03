import { useState, useEffect, useCallback, useRef } from 'react';

/**
 * Custom hook for WebSocket connection with auto-reconnect
 */
export const useWebSocket = (url) => {
  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState(null);
  const [error, setError] = useState(null);

  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const reconnectAttemptsRef = useRef(0);
  const shouldReconnectRef = useRef(false);
  const connectionIdRef = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000; // 1 second

  const connect = useCallback(() => {
    // Don't connect if URL is null (proctoring inactive)
    if (!url) {
      return;
    }

    try {
      const connectionId = connectionIdRef.current + 1;
      connectionIdRef.current = connectionId;
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (wsRef.current !== ws || connectionIdRef.current !== connectionId) return;
        console.log('WebSocket connected');
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws || connectionIdRef.current !== connectionId) return;
        try {
          const data = JSON.parse(event.data);
          setLastMessage(data);
        } catch (err) {
          console.error('Failed to parse message:', err);
        }
      };

      ws.onerror = (err) => {
        if (wsRef.current !== ws || connectionIdRef.current !== connectionId) return;
        console.error('WebSocket error:', err);
        setError('Connection error');
      };

      ws.onclose = () => {
        if (wsRef.current !== ws || connectionIdRef.current !== connectionId) return;
        console.log('WebSocket disconnected');
        setIsConnected(false);

        // Attempt to reconnect with exponential backoff
        if (shouldReconnectRef.current && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = Math.min(
            baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current),
            30000 // Max 30 seconds
          );

          console.log(`Reconnecting in ${delay}ms... (attempt ${reconnectAttemptsRef.current + 1})`);

          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current += 1;
            connect();
          }, delay);
        } else if (shouldReconnectRef.current) {
          setError('Max reconnection attempts reached');
        }
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
      setError('Failed to connect');
    }
  }, [url]);

  useEffect(() => {
    shouldReconnectRef.current = Boolean(url);
    connect();

    return () => {
      shouldReconnectRef.current = false;
      connectionIdRef.current += 1;
      // Cleanup on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.onopen = null;
        wsRef.current.onmessage = null;
        wsRef.current.onerror = null;
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  const sendMessage = useCallback((data) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof data === 'string' ? data : JSON.stringify(data));
      return true;
    }
    return false;
  }, []);

  const reconnect = useCallback(() => {
    shouldReconnectRef.current = Boolean(url);
    if (wsRef.current) {
      wsRef.current.close();
    }
    reconnectAttemptsRef.current = 0;
    connect();
  }, [connect]);

  return {
    isConnected,
    lastMessage,
    error,
    sendMessage,
    reconnect
  };
};
