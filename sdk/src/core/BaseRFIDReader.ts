import { EventBus } from './EventBus';
import { SDKEvent, SDKError } from '../types/event';
import { ReaderState, ReaderInfo } from '../types/reader';
import { ITransport } from '../transports/ITransport';

export abstract class BaseRFIDReader {
  protected eventBus: EventBus;
  protected transport: ITransport;
  protected state: ReaderState = ReaderState.IDLE;
  protected info: ReaderInfo;

  constructor(info: ReaderInfo, transport: ITransport, eventBus?: EventBus) {
    this.info = info;
    this.transport = transport;
    this.eventBus = eventBus ?? new EventBus();

    this.bindTransportEvents();
  }

  private bindTransportEvents(): void {
    this.transport.onData((data) => this.handleRawData(data));
    this.transport.onError((err) => this.handleError(err));
  }

  async connect(): Promise<void> {
    try {
      this.state = ReaderState.CONNECTING;
      this.eventBus.emit(SDKEvent.CONNECTING, this.info);

      await this.transport.connect();

      this.state = ReaderState.CONNECTED;
      this.eventBus.emit(SDKEvent.CONNECTED, this.info);
    } catch (err) {
      this.handleError(err as Error);
    }
  }

  async disconnect(): Promise<void> {
    await this.transport.disconnect();
    this.state = ReaderState.DISCONNECTED;
    this.eventBus.emit(SDKEvent.DISCONNECTED, this.info);
  }

  protected handleRawData(data: Buffer): void {
    this.eventBus.emit(SDKEvent.RAW_DATA, data);
    this.parse(data);
  }

  protected handleError(err: Error): void {
    this.state = ReaderState.ERROR;

    const sdkError: SDKError = {
      code: 'READER_ERROR',
      message: err.message,
      source: this.info.model,
      raw: err,
    };

    this.eventBus.emitError(sdkError);
  }

  getState(): ReaderState {
    return this.state;
  }

  getInfo(): ReaderInfo {
    return this.info;
  }

  getEventBus(): EventBus {
    return this.eventBus;
  }

  /** Reader-specific protocol parsing */
  protected abstract parse(data: Buffer): void;
}
