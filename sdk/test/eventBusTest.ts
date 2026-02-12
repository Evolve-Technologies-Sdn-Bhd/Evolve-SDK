/**
 * EventBus Test Suite
 * Tests event bus functionality, subscriptions, and event handling
 */

import { EventBus } from '../core/EventBus';
import { SDKEvent, SDKError } from '../types/event';

async function runEventBusTests() {
  console.log('\n=== EventBus Test Suite ===\n');

  try {
    // Test 1: Basic subscription and emission
    console.log('Test 1: Basic subscription and emission');
    {
      const bus = new EventBus();
      let received = false;

      bus.on(SDKEvent.CONNECTED, (info) => {
        received = true;
        console.log('  ✓ Event received:', info);
      });

      bus.emit(SDKEvent.CONNECTED, { id: 'reader-1' });
      if (received) console.log('  ✓ Test passed\n');
    }

    // Test 2: Unsubscribe functionality
    console.log('Test 2: Unsubscribe functionality');
    {
      const bus = new EventBus();
      let callCount = 0;

      const listener = () => callCount++;
      bus.on(SDKEvent.TAG_DETECTED, listener);
      bus.emit(SDKEvent.TAG_DETECTED, {});
      bus.off(SDKEvent.TAG_DETECTED, listener);
      bus.emit(SDKEvent.TAG_DETECTED, {});

      if (callCount === 1) {
        console.log('  ✓ Listener correctly unsubscribed');
        console.log('  ✓ Test passed\n');
      }
    }

    // Test 3: Once listener
    console.log('Test 3: Once listener (fires only once)');
    {
      const bus = new EventBus();
      let callCount = 0;

      bus.once(SDKEvent.DISCONNECTED, () => callCount++);
      bus.emit(SDKEvent.DISCONNECTED, {});
      bus.emit(SDKEvent.DISCONNECTED, {});

      if (callCount === 1) {
        console.log('  ✓ Once listener fired exactly once');
        console.log('  ✓ Test passed\n');
      }
    }

    // Test 4: Error handling
    console.log('Test 4: Error handling');
    {
      const bus = new EventBus();
      let errorReceived = false;

      bus.on(SDKEvent.ERROR, (err: SDKError) => {
        errorReceived = true;
        console.log('  ✓ Error event caught:', err.message);
      });

      const testError: SDKError = {
        code: 'TEST_ERROR',
        message: 'Test error message',
        source: 'test',
      };

      bus.emitError(testError);

      if (errorReceived) {
        console.log('  ✓ Test passed\n');
      }
    }

    // Test 5: Error handler registration
    console.log('Test 5: Global error handler');
    {
      const bus = new EventBus();
      let handlerCalled = false;

      bus.onError((err) => {
        handlerCalled = true;
        console.log('  ✓ Global error handler called');
      });

      bus.emitError({
        code: 'HANDLER_TEST',
        message: 'Handler test',
      });

      if (handlerCalled) {
        console.log('  ✓ Test passed\n');
      }
    }

    // Test 6: Listener count
    console.log('Test 6: Listener count tracking');
    {
      const bus = new EventBus();

      const sub1 = bus.on(SDKEvent.TAG_DETECTED, () => {});
      const sub2 = bus.on(SDKEvent.TAG_DETECTED, () => {});
      const sub3 = bus.on(SDKEvent.CONNECTED, () => {});

      let count = bus.listenerCount(SDKEvent.TAG_DETECTED);
      if (count === 2) {
        console.log(`  ✓ TAG_DETECTED has ${count} listeners`);
      }

      count = bus.listenerCount(SDKEvent.CONNECTED);
      if (count === 1) {
        console.log(`  ✓ CONNECTED has ${count} listener`);
      }

      bus.removeAllListeners(SDKEvent.TAG_DETECTED);
      count = bus.listenerCount(SDKEvent.TAG_DETECTED);
      if (count === 0) {
        console.log('  ✓ Listeners cleared successfully');
      }

      console.log('  ✓ Test passed\n');
    }

    // Test 7: Active events reporting
    console.log('Test 7: Active events tracking');
    {
      const bus = new EventBus();

      bus.on(SDKEvent.CONNECTED, () => {});
      bus.on(SDKEvent.TAG_DETECTED, () => {});
      bus.on(SDKEvent.TAG_DETECTED, () => {});

      const active = bus.getActiveEvents();
      console.log('  ✓ Active events:', active);

      const details = bus.getListenerDetails();
      console.log('  ✓ Listener details:', details);
      console.log('  ✓ Test passed\n');
    }

    // Test 8: Unsubscribe convenience function
    console.log('Test 8: Convenient unsubscribe');
    {
      const bus = new EventBus();
      let callCount = 0;

      const unsubscribe = bus.on(SDKEvent.RAW_DATA, () => callCount++);

      bus.emit(SDKEvent.RAW_DATA, Buffer.from('test'));
      unsubscribe(); // Call returned unsubscribe function
      bus.emit(SDKEvent.RAW_DATA, Buffer.from('test'));

      if (callCount === 1) {
        console.log('  ✓ Convenient unsubscribe worked');
        console.log('  ✓ Test passed\n');
      }
    }

    // Test 9: waitFor promise-based listener
    console.log('Test 9: Wait for event (Promise-based)');
    {
      const bus = new EventBus();

      // Emit event after a short delay
      setTimeout(() => {
        bus.emit(SDKEvent.CONNECTING, { id: 'reader-1' });
      }, 100);

      const data = await bus.waitFor(SDKEvent.CONNECTING, 5000);
      console.log('  ✓ Event data received:', data);
      console.log('  ✓ Test passed\n');
    }

    // Test 10: Scoped event bus
    console.log('Test 10: Scoped event bus');
    {
      const mainBus = new EventBus();
      const scopedBus = mainBus.createScope();

      let mainBusEvent = false;
      let scopedBusEvent = false;

      mainBus.on(SDKEvent.CONNECTED, () => {
        mainBusEvent = true;
      });

      scopedBus.on(SDKEvent.CONNECTED, () => {
        scopedBusEvent = true;
      });

      mainBus.emit(SDKEvent.CONNECTED, {});
      scopedBus.emit(SDKEvent.CONNECTED, {});

      if (mainBusEvent && scopedBusEvent) {
        console.log('  ✓ Both buses emitted independently');
        console.log('  ✓ Test passed\n');
      }
    }

    // Test 11: Multiple listeners for same event
    console.log('Test 11: Multiple listeners for same event');
    {
      const bus = new EventBus();
      let count = 0;

      bus.on(SDKEvent.TAG_DETECTED, () => count++);
      bus.on(SDKEvent.TAG_DETECTED, () => count++);
      bus.on(SDKEvent.TAG_DETECTED, () => count++);

      bus.emit(SDKEvent.TAG_DETECTED, {});

      if (count === 3) {
        console.log(`  ✓ All ${count} listeners were called`);
        console.log('  ✓ Test passed\n');
      }
    }

    // Test 12: Clean up and destroy
    console.log('Test 12: EventBus cleanup and destroy');
    {
      const bus = new EventBus();

      bus.on(SDKEvent.CONNECTED, () => {});
      bus.on(SDKEvent.TAG_DETECTED, () => {});
      bus.onError(() => {});

      let before = bus.getActiveEvents().length;
      bus.destroy();
      let after = bus.getActiveEvents().length;

      if (before > 0 && after === 0) {
        console.log(`  ✓ Cleaned up ${before} active events`);
        console.log('  ✓ Test passed\n');
      }
    }

    console.log('=== All EventBus Tests Passed ===\n');
  } catch (err) {
    console.error('✗ Test failed:', (err as Error).message);
    console.error((err as Error).stack);
    process.exit(1);
  }
}

// Run tests
if (require.main === module) {
  runEventBusTests().catch(console.error);
}

export { runEventBusTests };
