"use client";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  on_wall: { label: "On Wall", className: "bg-green-100 text-green-700" },
  reserved: { label: "Reserved", className: "bg-yellow-100 text-yellow-700" },
  reserved_pending_payment: { label: "Reserved (Pending)", className: "bg-yellow-100 text-yellow-700" },
  sold: { label: "Sold", className: "bg-blue-100 text-blue-700" },
  removed: { label: "Removed", className: "bg-gray-100 text-gray-500" },
  removed_not_sold: { label: "Removed (Not Sold)", className: "bg-gray-100 text-gray-500" },
  pending_payment_issue: { label: "Payment Issue", className: "bg-red-100 text-red-700" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-gray-100 text-gray-500" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
