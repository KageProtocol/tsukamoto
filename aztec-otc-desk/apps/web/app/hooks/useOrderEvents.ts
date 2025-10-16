import { useEffect, useRef } from 'react';

interface OrderEvent {
  type: 'order_created' | 'order_updated' | 'order_filled' | 'order_cancelled' | 'connected';
  orderId?: string;
  data?: any;
  timestamp: string;
  message?: string;
}

interface UseOrderEventsOptions {
  onOrderCreated?: (orderId: string, data: any) => void;
  onOrderUpdated?: (orderId: string, data: any) => void;
  onOrderFilled?: (orderId: string, data: any) => void;
  onOrderCancelled?: (orderId: string, data: any) => void;
  onConnected?: () => void;
  onError?: (error: Event) => void;
  apiUrl?: string;
}

export function useOrderEvents(options: UseOrderEventsOptions) {
  const {
    onOrderCreated,
    onOrderUpdated,
    onOrderFilled,
    onOrderCancelled,
    onConnected,
    onError,
    apiUrl = process.env.NEXT_PUBLIC_OTC_API_URL || 'http://localhost:3001'
  } = options;

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Only run on client-side
    if (typeof window === 'undefined') return;

    let isActive = true;

    const connect = () => {
      if (!isActive) return;

      const eventSource = new EventSource(`${apiUrl}/events`);
      eventSourceRef.current = eventSource;

      eventSource.onopen = () => {
        console.log('[SSE] Connected to order events');
      };

      eventSource.onmessage = (event) => {
        try {
          const data: OrderEvent = JSON.parse(event.data);

          console.log('[SSE] Received event:', data.type, data.orderId);

          switch (data.type) {
            case 'connected':
              onConnected?.();
              break;
            case 'order_created':
              if (data.orderId) onOrderCreated?.(data.orderId, data.data);
              break;
            case 'order_updated':
              if (data.orderId) onOrderUpdated?.(data.orderId, data.data);
              break;
            case 'order_filled':
              if (data.orderId) onOrderFilled?.(data.orderId, data.data);
              break;
            case 'order_cancelled':
              if (data.orderId) onOrderCancelled?.(data.orderId, data.data);
              break;
          }
        } catch (error) {
          console.error('[SSE] Error parsing event:', error);
        }
      };

      eventSource.onerror = (error) => {
        console.error('[SSE] Error:', error);
        onError?.(error);

        // Close and attempt reconnect after 5 seconds
        eventSource.close();
        eventSourceRef.current = null;

        if (isActive && !reconnectTimeoutRef.current) {
          console.log('[SSE] Attempting to reconnect in 5 seconds...');
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectTimeoutRef.current = null;
            connect();
          }, 5000);
        }
      };
    };

    connect();

    // Cleanup on unmount
    return () => {
      isActive = false;
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
    };
  }, [apiUrl, onOrderCreated, onOrderUpdated, onOrderFilled, onOrderCancelled, onConnected, onError]);

  return {
    connected: typeof window !== 'undefined' && eventSourceRef.current?.readyState === 1 // EventSource.OPEN = 1
  };
}
