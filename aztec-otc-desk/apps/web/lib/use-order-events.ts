"use client";

import { useEffect, useRef, useCallback } from "react";

export type OrderEvent = {
  type: 'order_created' | 'order_updated' | 'order_filled' | 'order_cancelled' | 'connected';
  orderId?: string;
  data?: any;
  timestamp: string;
  message?: string;
};

type OrderEventHandler = (event: OrderEvent) => void;

/**
 * Custom hook for subscribing to real-time order updates via Server-Sent Events (SSE)
 *
 * @param onEvent - Callback function that will be invoked when an order event is received
 * @param options - Configuration options for the SSE connection
 * @returns Object with connection status and manual reconnect function
 */
export function useOrderEvents(
  onEvent: OrderEventHandler,
  options: {
    autoReconnect?: boolean;
    reconnectInterval?: number;
  } = {}
) {
  const {
    autoReconnect = true,
    reconnectInterval = 3000
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const isConnectedRef = useRef(false);

  const connect = useCallback(() => {
    // Clear any existing reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close existing connection
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    try {
      const apiUrl = process.env.NEXT_PUBLIC_OTC_API_URL || 'http://localhost:3001';
      const eventSource = new EventSource(`${apiUrl}/events`);

      eventSource.onopen = () => {
        console.log('[SSE] Connected to order events');
        isConnectedRef.current = true;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onEvent(data);
        } catch (error) {
          console.error('[SSE] Failed to parse event data:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] Connection error:', error);
        isConnectedRef.current = false;
        eventSource.close();

        // Auto-reconnect if enabled
        if (autoReconnect) {
          console.log(`[SSE] Reconnecting in ${reconnectInterval}ms...`);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect();
          }, reconnectInterval);
        }
      };

      eventSourceRef.current = eventSource;
    } catch (error) {
      console.error('[SSE] Failed to create EventSource:', error);
      isConnectedRef.current = false;

      // Auto-reconnect if enabled
      if (autoReconnect) {
        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, reconnectInterval);
      }
    }
  }, [onEvent, autoReconnect, reconnectInterval]);

  const disconnect = useCallback(() => {
    // Clear reconnect timeout
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close event source
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }

    isConnectedRef.current = false;
    console.log('[SSE] Disconnected from order events');
  }, []);

  // Connect on mount
  useEffect(() => {
    connect();

    // Cleanup on unmount
    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  return {
    isConnected: isConnectedRef.current,
    reconnect: connect,
    disconnect
  };
}
