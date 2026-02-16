export type { StorageAdapter } from "./storage.interface";
export { LocalStorageAdapter } from "./local.adapter";
export { S3StorageAdapter } from "./s3.adapter";

import { LocalStorageAdapter } from "./local.adapter";
import { S3StorageAdapter } from "./s3.adapter";
import type { StorageAdapter } from "./storage.interface";

export function createStorageAdapter(): StorageAdapter {
  const provider = process.env.STORAGE_PROVIDER ?? "local";

  switch (provider) {
    case "s3":
      return new S3StorageAdapter();
    case "local":
    default:
      return new LocalStorageAdapter();
  }
}
