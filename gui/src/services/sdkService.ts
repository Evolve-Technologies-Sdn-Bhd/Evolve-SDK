// gui/src/services/sdkService.ts
export const sdkService = {
  connect: async (ip: string, port: number) => {
    // @ts-ignore
    return await window.electronAPI.connectReader({ type: 'tcp', ip, port });
  },
  disconnect: async () => {
    // @ts-ignore
    return await window.electronAPI.disconnectReader();
  },
  onTagRead: (callback: (tag: any) => void) => {
    // @ts-ignore
    window.electronAPI.onTagRead(callback);
  }
};