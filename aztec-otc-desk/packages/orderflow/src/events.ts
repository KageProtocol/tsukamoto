// Event broadcaster for real-time order updates using Server-Sent Events (SSE)

type OrderEvent = {
  type: 'order_created' | 'order_updated' | 'order_filled' | 'order_cancelled';
  orderId: string;
  data: any;
  timestamp: string;
};

class EventBroadcaster {
  private clients: Set<ReadableStreamDefaultController> = new Set();

  // Add a new SSE client
  addClient(controller: ReadableStreamDefaultController) {
    this.clients.add(controller);
    console.log(`[SSE] Client connected. Total clients: ${this.clients.size}`);

    // Send initial connection message
    this.sendToClient(controller, {
      type: 'connected',
      message: 'Connected to order updates',
      timestamp: new Date().toISOString()
    });
  }

  // Remove an SSE client
  removeClient(controller: ReadableStreamDefaultController) {
    this.clients.delete(controller);
    console.log(`[SSE] Client disconnected. Total clients: ${this.clients.size}`);
  }

  // Send event to a specific client
  private sendToClient(controller: ReadableStreamDefaultController, data: any) {
    try {
      const message = `data: ${JSON.stringify(data)}\n\n`;
      controller.enqueue(new TextEncoder().encode(message));
    } catch (error) {
      console.error('[SSE] Error sending to client:', error);
      this.removeClient(controller);
    }
  }

  // Broadcast event to all connected clients
  broadcast(event: OrderEvent) {
    console.log(`[SSE] Broadcasting ${event.type} to ${this.clients.size} clients`);

    const deadClients: ReadableStreamDefaultController[] = [];

    for (const controller of this.clients) {
      try {
        this.sendToClient(controller, event);
      } catch (error) {
        deadClients.push(controller);
      }
    }

    // Clean up dead connections
    deadClients.forEach(client => this.removeClient(client));
  }

  // Broadcast order created event
  orderCreated(orderId: string, orderData: any) {
    this.broadcast({
      type: 'order_created',
      orderId,
      data: orderData,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast order updated event
  orderUpdated(orderId: string, orderData: any) {
    this.broadcast({
      type: 'order_updated',
      orderId,
      data: orderData,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast order filled event
  orderFilled(orderId: string, orderData: any) {
    this.broadcast({
      type: 'order_filled',
      orderId,
      data: orderData,
      timestamp: new Date().toISOString()
    });
  }

  // Broadcast order cancelled event
  orderCancelled(orderId: string, orderData: any) {
    this.broadcast({
      type: 'order_cancelled',
      orderId,
      data: orderData,
      timestamp: new Date().toISOString()
    });
  }

  // Get client count
  getClientCount(): number {
    return this.clients.size;
  }

  // Send heartbeat to all clients (keep connections alive)
  heartbeat() {
    const deadClients: ReadableStreamDefaultController[] = [];

    for (const controller of this.clients) {
      try {
        controller.enqueue(new TextEncoder().encode(': heartbeat\n\n'));
      } catch (error) {
        deadClients.push(controller);
      }
    }

    deadClients.forEach(client => this.removeClient(client));
  }
}

// Export singleton instance
export const eventBroadcaster = new EventBroadcaster();

// Start heartbeat interval (every 30 seconds to keep connections alive)
setInterval(() => {
  eventBroadcaster.heartbeat();
}, 30000);
