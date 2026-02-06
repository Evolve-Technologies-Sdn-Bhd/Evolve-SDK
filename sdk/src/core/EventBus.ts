import EventEmitter from "eventemitter3";
import { SDKEvent, SDKError } from "../types/event";

/**
 * Type-safe event listener signatures
 */
export interface EventListeners {
  [SDKEvent.CONNECTED]: (info: any) => void;
  [SDKEvent.CONNECTING]: (info: any) => void;
  [SDKEvent.DISCONNECTED]: (info: any) => void;
  [SDKEvent.ERROR]: (error: SDKError) => void;
  [SDKEvent.TAG_DETECTED]: (data: any) => void;
  [SDKEvent.TAG_LOST]: (data: any) => void;
  [SDKEvent.RAW_DATA]: (data: Buffer) => void;
  [SDKEvent.DIAGNOSTIC]: (data: any) => void;
}

/**
 * Enhanced EventBus with proper event handling
 * Provides type-safe event emission and subscription
 */
export class EventBus {
  private emitter = new EventEmitter();
  private listeners: Map<SDKEvent, Set<Function>> = new Map();
  private errorHandlers: Set<(error: SDKError) => void> = new Set();
  private maxListeners = 100;

  constructor(maxListeners = 100) {
    this.maxListeners = maxListeners;
  }

  /**
   * Subscribe to an event
   * @param event - The event to listen to
   * @param listener - The callback function
   * @returns Unsubscribe function for convenience
   */
  on<E extends SDKEvent>(
    event: E,
    listener: EventListeners[E]
  ): () => void {
    this.emitter.on(event, listener);

    // Track listener for debugging/cleanup
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(listener);

    // Return unsubscribe function
    return () => this.off(event, listener);
  }

  /**
   * Subscribe to an event only once
   * @param event - The event to listen to
   * @param listener - The callback function
   */
  once<E extends SDKEvent>(
    event: E,
    listener: EventListeners[E]
  ): void {
    this.emitter.once(event, listener);
  }

  /**
   * Unsubscribe from an event
   * @param event - The event to unsubscribe from
   * @param listener - The callback function to remove
   */
  off<E extends SDKEvent>(
    event: E,
    listener: EventListeners[E]
  ): void {
    this.emitter.off(event, listener);

    // Remove from tracking
    if (this.listeners.has(event)) {
      this.listeners.get(event)!.delete(listener);
    }
  }

  /**
   * Emit an event
   * @param event - The event to emit
   * @param payload - The data to send with the event
   */
  emit<E extends SDKEvent>(event: E, payload?: any): boolean {
    return this.emitter.emit(event, payload);
  }

  /**
   * Emit an error event
   * @param error - The error to emit
   */
  emitError(error: SDKError): void {
    // Emit to error event listeners
    this.emitter.emit(SDKEvent.ERROR, error);

    // Also call specialized error handlers
    for (const handler of this.errorHandlers) {
      try {
        handler(error);
      } catch (err) {
        console.error('Error in error handler:', err);
      }
    }

    // Log warning if no error listeners
    if (this.listenerCount(SDKEvent.ERROR) === 0 && this.errorHandlers.size === 0) {
      console.warn('Unhandled SDK error:', error);
    }
  }

  /**
   * Register a global error handler
   * @param handler - The error handler function
   */
  onError(handler: (error: SDKError) => void): () => void {
    this.errorHandlers.add(handler);
    return () => this.errorHandlers.delete(handler);
  }

  /**
   * Remove all listeners for an event or all events
   * @param event - The specific event to clear, or undefined to clear all
   */
  removeAllListeners(event?: SDKEvent): void {
    if (event) {
      this.emitter.removeAllListeners(event);
      this.listeners.delete(event);
    } else {
      this.emitter.removeAllListeners();
      this.listeners.clear();
    }
  }

  /**
   * Get the number of listeners for an event
   * @param event - The event to check
   */
  listenerCount(event: SDKEvent): number {
    return this.emitter.listenerCount(event);
  }

  /**
   * Get all events with active listeners
   */
  getActiveEvents(): SDKEvent[] {
    const active: SDKEvent[] = [];
    for (const [event, listeners] of this.listeners.entries()) {
      if (listeners.size > 0) {
        active.push(event);
      }
    }
    return active;
  }

  /**
   * Get listener details for debugging
   */
  getListenerDetails(): Record<string, number> {
    const details: Record<string, number> = {};
    for (const [event, listeners] of this.listeners.entries()) {
      if (listeners.size > 0) {
        details[event] = listeners.size;
      }
    }
    return details;
  }

  /**
   * Wait for a specific event to be emitted
   * @param event - The event to wait for
   * @param timeout - Optional timeout in ms
   */
  waitFor<E extends SDKEvent>(
    event: E,
    timeout?: number
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      let timeoutHandle: NodeJS.Timeout | null = null;

      const listener = (payload: any) => {
        if (timeoutHandle) clearTimeout(timeoutHandle);
        this.off(event, listener);
        resolve(payload);
      };

      if (timeout) {
        timeoutHandle = setTimeout(() => {
          this.off(event, listener);
          reject(new Error(`Timeout waiting for event: ${event}`));
        }, timeout);
      }

      this.on(event, listener);
    });
  }

  /**
   * Create a scoped event bus for a specific context
   * Useful for isolated event handling
   */
  createScope(): EventBus {
    return new EventBus(this.maxListeners);
  }

  /**
   * Clean up and destroy the event bus
   */
  destroy(): void {
    this.errorHandlers.clear();
    this.removeAllListeners();
    this.listeners.clear();
  }
}

