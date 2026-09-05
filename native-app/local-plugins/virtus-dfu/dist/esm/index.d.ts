export interface DfuOptions {
  /** iOS: the peripheral UUID (same id used to connect). */
  deviceAddress: string;
  /** Local path to the signed Nordic DFU .zip. file:// is accepted. */
  filePath: string;
}
export interface DfuStateEvent {
  state: string;      // 'uploading' | 'completed' | 'error' | Nordic's own states
  percent?: number;
  error?: string;
}
export interface VirtusDfuPlugin {
  startDFU(options: DfuOptions): Promise<{ completed: boolean }>;
  abortDFU(): Promise<{ aborted: boolean }>;
  addListener(eventName: 'DFUStateChanged', handler: (e: DfuStateEvent) => void): Promise<any>;
}
export declare const VirtusDfu: VirtusDfuPlugin;
