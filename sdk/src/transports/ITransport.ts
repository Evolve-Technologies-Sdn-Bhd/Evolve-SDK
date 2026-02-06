export interface TransportOptions {
    timeout?: number;
    //baudRate?: number;
}

export interface ITransport {
    connect(): Promise<void>;
    disconnect(): Promise<void>;
    send(data: Buffer): Promise<void>;
    onData(callback: (data: Buffer) => void): void;
    onError(callback: (error: Error) => void): void;

    isConnected(): boolean;
}