/**
 * Toast POS Adapter
 * Fetches sales data via SFTP CSV export and transforms to canonical SalesLines.
 *
 * Configuration is read from environment:
 *   TOAST_SFTP_HOST, TOAST_SFTP_PORT, TOAST_SFTP_USER, TOAST_SFTP_PASS, TOAST_SFTP_PATH
 */

import type { POSAdapter } from "./base.adapter";
import type { CanonicalSalesLine } from "./canonical";

export class ToastAdapter implements POSAdapter {
  readonly sourceSystem = "toast";

  private host: string;
  private port: number;
  private username: string;
  private password: string;
  private remotePath: string;

  constructor() {
    this.host = process.env.TOAST_SFTP_HOST || "";
    this.port = parseInt(process.env.TOAST_SFTP_PORT || "22");
    this.username = process.env.TOAST_SFTP_USER || "";
    this.password = process.env.TOAST_SFTP_PASS || "";
    this.remotePath = process.env.TOAST_SFTP_PATH || "/exports";
  }

  async fetchSalesLines(
    sourceLocationId: string,
    fromDate: Date,
    toDate: Date
  ): Promise<CanonicalSalesLine[]> {
    // Dynamic import ssh2 — only needed when actually running imports
    const { Client } = await import("ssh2");
    const csvData = await this.downloadCSV(Client, fromDate);
    return this.parseCSV(csvData, sourceLocationId);
  }

  async testConnection(): Promise<{ ok: boolean; error?: string }> {
    try {
      const { Client } = await import("ssh2");
      return new Promise((resolve) => {
        const conn = new Client();
        conn
          .on("ready", () => {
            conn.end();
            resolve({ ok: true });
          })
          .on("error", (err: Error) => {
            resolve({ ok: false, error: err.message });
          })
          .connect({
            host: this.host,
            port: this.port,
            username: this.username,
            password: this.password,
          });
      });
    } catch (err: any) {
      return { ok: false, error: err.message };
    }
  }

  private downloadCSV(SshClient: any, date: Date): Promise<string> {
    const dateStr = date.toISOString().split("T")[0];
    const filePath = `${this.remotePath}/sales_${dateStr}.csv`;

    return new Promise((resolve, reject) => {
      const conn = new SshClient();
      conn
        .on("ready", () => {
          conn.sftp((err: Error | null, sftp: any) => {
            if (err) {
              conn.end();
              return reject(err);
            }
            let data = "";
            const stream = sftp.createReadStream(filePath, { encoding: "utf8" });
            stream.on("data", (chunk: string) => (data += chunk));
            stream.on("end", () => {
              conn.end();
              resolve(data);
            });
            stream.on("error", (e: Error) => {
              conn.end();
              reject(e);
            });
          });
        })
        .on("error", reject)
        .connect({
          host: this.host,
          port: this.port,
          username: this.username,
          password: this.password,
        });
    });
  }

  private parseCSV(
    csv: string,
    sourceLocationId: string
  ): CanonicalSalesLine[] {
    const lines = csv.trim().split("\n");
    if (lines.length < 2) return [];

    const headers = lines[0].split(",").map((h) => h.trim());
    const results: CanonicalSalesLine[] = [];

    for (let i = 1; i < lines.length; i++) {
      const values = lines[i].split(",").map((v) => v.trim());
      const row: Record<string, string> = {};
      headers.forEach((h, idx) => (row[h] = values[idx] || ""));

      results.push({
        sourceSystem: "toast",
        sourceLocationId,
        businessDate: new Date(row.businessDate || row.business_date),
        soldAt: new Date(row.soldAt || row.sold_at),
        receiptId: row.receiptId || row.receipt_id || "",
        lineId: row.lineId || row.line_id || "",
        posItemId: row.posItemId || row.pos_item_id || "",
        posItemName: row.posItemName || row.pos_item_name || "",
        quantity: parseFloat(row.quantity || "0"),
        isVoided: row.isVoided === "true" || row.is_voided === "true",
        isRefunded: row.isRefunded === "true" || row.is_refunded === "true",
        sizeModifierId: row.sizeModifierId || row.size_modifier_id || undefined,
        sizeModifierName: row.sizeModifierName || row.size_modifier_name || undefined,
        rawPayloadJson: row,
      });
    }

    return results;
  }
}
