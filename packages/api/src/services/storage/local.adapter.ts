import { writeFile, unlink, mkdir } from "fs/promises";
import path from "path";
import type { StorageAdapter } from "./storage.interface";

export class LocalStorageAdapter implements StorageAdapter {
  private baseDir: string;
  private baseUrl: string;

  constructor(baseDir?: string, baseUrl?: string) {
    this.baseDir = baseDir ?? path.join(process.cwd(), "uploads");
    this.baseUrl = baseUrl ?? "/api/uploads";
  }

  async upload(buffer: Buffer, key: string): Promise<string> {
    const filePath = path.join(this.baseDir, key);
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(filePath, buffer);
    return this.getUrl(key);
  }

  async delete(key: string): Promise<void> {
    const filePath = path.join(this.baseDir, key);
    await unlink(filePath).catch(() => {});
  }

  getUrl(key: string): string {
    return `${this.baseUrl}/${key}`;
  }
}
