import { BaseRFIDReader } from '../core/BaseRFIDReader';
import { ITransport } from '../transports/ITransport';
import { ReaderInfo } from '../types/reader';
import { SDKEvent } from '../types/event';

/**
 * UF3-S Reader Protocol:
 * - Sends tag data as fixed-length packets
 * - Each tag usually ends with \r\n
 * - Example: "E2000017221101441890\r\n"
 */


export class UF3SReader extends BaseRFIDReader {
  private buffer = '';

  protected parse(data: Buffer): void {
    // Append incoming data to buffer
    this.buffer += data.toString('utf-8');

    // Check for full packets (ending with \r\n)
    let index: number;
    while ((index = this.buffer.indexOf('\r\n')) >= 0) {
      const rawTag = this.buffer.slice(0, index).trim();
      this.buffer = this.buffer.slice(index + 2);

      if (rawTag) {
        // Emit TAG_DETECTED event
        this.getEventBus().emit(SDKEvent.TAG_DETECTED, {
          tagId: rawTag,
          reader: this.getInfo(),
          timestamp: new Date(),
        });
      }
    }
  }
}
