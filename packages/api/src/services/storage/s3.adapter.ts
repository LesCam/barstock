import type { StorageAdapter } from "./storage.interface";

export class S3StorageAdapter implements StorageAdapter {
  async upload(_buffer: Buffer, _key: string): Promise<string> {
    throw new Error("S3StorageAdapter not implemented");
  }

  async delete(_key: string): Promise<void> {
    throw new Error("S3StorageAdapter not implemented");
  }

  getUrl(_key: string): string {
    throw new Error("S3StorageAdapter not implemented");
  }
}
