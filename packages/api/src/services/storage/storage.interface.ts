export interface StorageAdapter {
  upload(buffer: Buffer, key: string): Promise<string>;
  delete(key: string): Promise<void>;
  getUrl(key: string): string;
}
