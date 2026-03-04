import { useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { downloadCsv } from "@/lib/download-csv";

/**
 * Wraps downloadCsv with fire-and-forget audit logging.
 * The download always proceeds immediately; audit is best-effort.
 */
export function useAuditedDownload() {
  const logExport = trpc.audit.logExport.useMutation();

  const auditedDownload = useCallback(
    (
      headers: string[],
      rows: string[][],
      filename: string,
      reportType: string,
    ) => {
      downloadCsv(headers, rows, filename);
      logExport.mutate({ reportType, rowCount: rows.length, filename });
    },
    [logExport],
  );

  return auditedDownload;
}
