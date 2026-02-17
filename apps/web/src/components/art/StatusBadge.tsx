"use client";

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  on_wall: { label: "On Wall", className: "bg-green-500/10 text-green-400" },
  reserved: { label: "Reserved", className: "bg-yellow-500/10 text-yellow-400" },
  reserved_pending_payment: { label: "Reserved (Pending)", className: "bg-yellow-500/10 text-yellow-400" },
  sold: { label: "Sold", className: "bg-[#E9B44C]/10 text-[#E9B44C]" },
  removed: { label: "Removed", className: "bg-white/5 text-[#EAF0FF]/40" },
  removed_not_sold: { label: "Removed (Not Sold)", className: "bg-white/5 text-[#EAF0FF]/40" },
  pending_payment_issue: { label: "Payment Issue", className: "bg-red-500/10 text-red-400" },
};

export function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] ?? { label: status, className: "bg-white/5 text-[#EAF0FF]/40" };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
