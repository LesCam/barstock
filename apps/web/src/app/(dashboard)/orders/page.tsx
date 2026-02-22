"use client";

import { useState, useMemo } from "react";
import { useSession } from "next-auth/react";
import { useLocation } from "@/components/location-context";
import { trpc } from "@/lib/trpc";
import Link from "next/link";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return "—";
  return `$${Number(value).toFixed(2)}`;
}

function statusBadge(status: string) {
  if (status === "open") return "bg-blue-500/20 text-blue-400 border-blue-500/30";
  if (status === "partially_fulfilled") return "bg-amber-500/20 text-amber-400 border-amber-500/30";
  if (status === "closed") return "bg-green-500/20 text-green-400 border-green-500/30";
  return "bg-white/10 text-[#EAF0FF]/60";
}

function statusLabel(status: string) {
  if (status === "open") return "Open";
  if (status === "partially_fulfilled") return "Partial";
  if (status === "closed") return "Closed";
  return status;
}

type ViewMode = "orders" | "trends";

export default function OrdersPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const { selectedLocationId: locationId } = useLocation();

  const [viewMode, setViewMode] = useState<ViewMode>("orders");
  const [filterStatus, setFilterStatus] = useState<string>("");
  const [filterVendor, setFilterVendor] = useState<string>("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [monthsBack, setMonthsBack] = useState(6);

  const { data: orders, isLoading } = trpc.purchaseOrders.list.useQuery(
    {
      locationId: locationId!,
      status: (filterStatus as any) || undefined,
      vendorId: filterVendor || undefined,
    },
    { enabled: !!locationId && viewMode === "orders" }
  );

  const { data: trends, isLoading: trendsLoading } = trpc.purchaseOrders.orderTrends.useQuery(
    { locationId: locationId!, monthsBack },
    { enabled: !!locationId && viewMode === "trends" }
  );

  // Derive vendor list from orders
  const vendors = useMemo(() => {
    if (!orders) return [];
    const map = new Map<string, string>();
    for (const o of orders) {
      if (o.vendor) map.set(o.vendor.id, o.vendor.name);
    }
    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orders]);

  const monthlyChartData = useMemo(() => {
    if (!trends?.monthlySpend) return [];
    return trends.monthlySpend.map((m) => ({
      label: new Date(m.month).toLocaleDateString("en-US", { month: "short", year: "2-digit" }),
      spend: m.totalSpend,
      orders: m.orderCount,
    }));
  }, [trends]);

  if (!locationId) {
    return <div className="text-[#EAF0FF]/60">No location selected.</div>;
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-[#EAF0FF]">Purchase Orders</h1>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg bg-[#0B1623] p-1">
            <button
              onClick={() => setViewMode("orders")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === "orders"
                  ? "bg-[#16283F] text-[#E9B44C]"
                  : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
              }`}
            >
              Orders
            </button>
            <button
              onClick={() => setViewMode("trends")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                viewMode === "trends"
                  ? "bg-[#16283F] text-[#E9B44C]"
                  : "text-[#EAF0FF]/60 hover:text-[#EAF0FF]/80"
              }`}
            >
              Trends
            </button>
          </div>
          <Link
            href="/par"
            className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/80 hover:bg-white/5"
          >
            Par Levels
          </Link>
        </div>
      </div>

      {viewMode === "trends" ? (
        <TrendsView
          trends={trends}
          isLoading={trendsLoading}
          monthsBack={monthsBack}
          setMonthsBack={setMonthsBack}
          chartData={monthlyChartData}
        />
      ) : (
        <>
          {/* Filters */}
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            >
              <option value="">All Statuses</option>
              <option value="open">Open</option>
              <option value="partially_fulfilled">Partially Fulfilled</option>
              <option value="closed">Closed</option>
            </select>
            <select
              value={filterVendor}
              onChange={(e) => setFilterVendor(e.target.value)}
              className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
            >
              <option value="">All Vendors</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>

          {/* Orders list */}
          {isLoading ? (
            <p className="text-[#EAF0FF]/60">Loading...</p>
          ) : !orders || orders.length === 0 ? (
            <div className="rounded-lg border border-white/10 bg-[#16283F] p-8 text-center">
              <p className="text-[#EAF0FF]/60">No purchase orders found.</p>
              <p className="mt-2 text-sm text-[#EAF0FF]/40">
                Create orders from the{" "}
                <Link href="/par" className="text-[#E9B44C] hover:underline">Par Levels</Link>{" "}
                Generate Order view.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {orders.map((order: any) => {
                const isExpanded = expandedId === order.id;
                const lineCount = order.lines?.length ?? 0;
                const orderedTotal = order.lines?.reduce(
                  (sum: number, l: any) => sum + Number(l.orderedQty),
                  0
                ) ?? 0;
                const receivedTotal = order.lines?.reduce(
                  (sum: number, l: any) => sum + Number(l.pickedUpQty),
                  0
                ) ?? 0;

                return (
                  <div key={order.id} className="rounded-lg border border-white/10 bg-[#16283F]">
                    {/* Summary row */}
                    <button
                      onClick={() => setExpandedId(isExpanded ? null : order.id)}
                      className="flex w-full items-center justify-between px-4 py-3 text-left hover:bg-[#0B1623]/30"
                    >
                      <div className="flex items-center gap-4">
                        <span className="text-sm font-medium text-[#EAF0FF]">
                          {new Date(order.createdAt).toLocaleDateString("en-US", {
                            month: "short",
                            day: "numeric",
                            year: "numeric",
                          })}
                        </span>
                        <span className="text-sm text-[#EAF0FF]/70">
                          {order.vendor?.name ?? "Unknown Vendor"}
                        </span>
                        <span className={`rounded border px-2 py-0.5 text-xs font-medium ${statusBadge(order.status)}`}>
                          {statusLabel(order.status)}
                        </span>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-[#EAF0FF]/50">
                        <span>{lineCount} items</span>
                        <span>Ordered: {orderedTotal.toFixed(0)}</span>
                        <span>Received: {receivedTotal.toFixed(0)}</span>
                        <span className="text-[#EAF0FF]/30">{isExpanded ? "▲" : "▼"}</span>
                      </div>
                    </button>

                    {/* Expanded detail */}
                    {isExpanded && (
                      <OrderDetail orderId={order.id} />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TrendsView({
  trends,
  isLoading,
  monthsBack,
  setMonthsBack,
  chartData,
}: {
  trends: any;
  isLoading: boolean;
  monthsBack: number;
  setMonthsBack: (n: number) => void;
  chartData: { label: string; spend: number; orders: number }[];
}) {
  if (isLoading) {
    return (
      <div className="space-y-4">
        <div className="h-24 animate-pulse rounded-lg bg-white/5" />
        <div className="h-64 animate-pulse rounded-lg bg-white/5" />
      </div>
    );
  }

  if (!trends) {
    return <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No trend data available.</p>;
  }

  return (
    <div>
      {/* Period selector */}
      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm text-[#EAF0FF]/60">Period:</label>
        <select
          value={monthsBack}
          onChange={(e) => setMonthsBack(Number(e.target.value))}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          {[3, 6, 12, 24].map((m) => (
            <option key={m} value={m}>{m} months</option>
          ))}
        </select>
      </div>

      {/* Summary Cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Total Spend</p>
          <p className="text-2xl font-bold">${(trends.totalSpend ?? 0).toFixed(2)}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Orders Created</p>
          <p className="text-2xl font-bold">{trends.totalOrders ?? 0}</p>
        </div>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          <p className="text-sm text-[#EAF0FF]/60">Avg Fulfillment</p>
          <p className="text-2xl font-bold">
            {trends.avgFulfillmentDays != null ? `${trends.avgFulfillmentDays.toFixed(1)}d` : "—"}
          </p>
        </div>
        <div className="rounded-lg border border-[#E9B44C]/30 bg-[#16283F] p-4">
          <p className="text-sm text-[#E9B44C]">Top Vendor</p>
          <p className="text-lg font-bold text-[#E9B44C]">{trends.topVendor ?? "—"}</p>
        </div>
      </div>

      {/* Monthly Spend Chart */}
      <div className="mb-8">
        <h3 className="mb-3 text-base font-semibold">Monthly Spend</h3>
        <div className="rounded-lg border border-white/10 bg-[#16283F] p-4">
          {chartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={chartData}>
                <XAxis dataKey="label" tick={{ fill: "#EAF0FF", fontSize: 12 }} axisLine={{ stroke: "#ffffff1a" }} tickLine={false} />
                <YAxis tick={{ fill: "#EAF0FF99", fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#0B1623", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 8, color: "#EAF0FF" }}
                  formatter={(value, name) => [
                    name === "spend" ? `$${Number(value ?? 0).toFixed(2)}` : value,
                    name === "spend" ? "Spend" : "Orders",
                  ]}
                />
                <Bar dataKey="spend" fill="#E9B44C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="py-8 text-center text-sm text-[#EAF0FF]/40">No monthly spend data.</p>
          )}
        </div>
      </div>

      {/* Vendor Breakdown */}
      <div className="mb-8">
        <h3 className="mb-3 text-base font-semibold">Vendor Breakdown</h3>
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Vendor</th>
                <th className="px-4 py-3">Orders</th>
                <th className="px-4 py-3">Total Spend</th>
                <th className="px-4 py-3">Last Order</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(trends.byVendor ?? []).map((v: any) => (
                <tr key={v.vendorId} className="hover:bg-[#0B1623]/60">
                  <td className="px-4 py-3 font-medium">{v.vendorName}</td>
                  <td className="px-4 py-3">{v.orderCount}</td>
                  <td className="px-4 py-3">${v.totalSpend.toFixed(2)}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(v.lastOrder).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                  </td>
                </tr>
              ))}
              {(trends.byVendor ?? []).length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-[#EAF0FF]/40">No vendor data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Top Ordered Items */}
      <div>
        <h3 className="mb-3 text-base font-semibold">Top Ordered Items</h3>
        <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Item</th>
                <th className="px-4 py-3">Total Ordered</th>
                <th className="px-4 py-3">Times Ordered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {(trends.topItems ?? []).map((item: any) => (
                <tr key={item.itemId} className="hover:bg-[#0B1623]/60">
                  <td className="px-4 py-3 font-medium">{item.itemName}</td>
                  <td className="px-4 py-3">{item.totalOrdered.toFixed(1)}</td>
                  <td className="px-4 py-3">{item.timesOrdered}</td>
                </tr>
              ))}
              {(trends.topItems ?? []).length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-[#EAF0FF]/40">No item data.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function OrderDetail({ orderId }: { orderId: string }) {
  const { data: order, isLoading } = trpc.purchaseOrders.getById.useQuery(
    { id: orderId },
    { enabled: !!orderId }
  );
  const utils = trpc.useUtils();

  const [pickupQtys, setPickupQtys] = useState<Map<string, number>>(new Map());
  const [copiedText, setCopiedText] = useState(false);

  const recordPickupMutation = trpc.purchaseOrders.recordPickup.useMutation({
    onSuccess: () => {
      utils.purchaseOrders.getById.invalidate({ id: orderId });
      utils.purchaseOrders.list.invalidate();
      setPickupQtys(new Map());
    },
  });

  const closeMutation = trpc.purchaseOrders.close.useMutation({
    onSuccess: () => {
      utils.purchaseOrders.getById.invalidate({ id: orderId });
      utils.purchaseOrders.list.invalidate();
    },
  });

  const { data: textOrder } = trpc.purchaseOrders.textOrder.useQuery(
    { id: orderId },
    { enabled: !!orderId }
  );

  function handleCopyText() {
    if (!textOrder) return;
    navigator.clipboard.writeText(textOrder).then(() => {
      setCopiedText(true);
      setTimeout(() => setCopiedText(false), 2000);
    });
  }

  function getPickupQty(lineId: string, remaining: number): number {
    return pickupQtys.get(lineId) ?? remaining;
  }

  function handleRecordPickup() {
    if (!order) return;
    const lines = order.lines
      .filter((l: any) => {
        const remaining = Number(l.orderedQty) - Number(l.pickedUpQty);
        const qty = getPickupQty(l.id, remaining);
        return qty > 0;
      })
      .map((l: any) => ({
        lineId: l.id,
        pickedUpQty: getPickupQty(l.id, Number(l.orderedQty) - Number(l.pickedUpQty)),
      }));
    if (lines.length === 0) return;
    recordPickupMutation.mutate({ purchaseOrderId: orderId, lines });
  }

  if (isLoading || !order) {
    return <div className="border-t border-white/10 px-4 py-4 text-sm text-[#EAF0FF]/60">Loading...</div>;
  }

  const isClosed = order.status === "closed";

  return (
    <div className="border-t border-white/10">
      {/* Order info */}
      <div className="flex flex-wrap items-center gap-4 border-b border-white/5 px-4 py-3 text-xs text-[#EAF0FF]/50">
        <span>Vendor: <strong className="text-[#EAF0FF]/80">{order.vendor?.name}</strong></span>
        <span>Created by: <strong className="text-[#EAF0FF]/80">{order.creator?.email ?? "—"}</strong></span>
        <span>Created: {new Date(order.createdAt).toLocaleString()}</span>
        {order.closedAt && <span>Closed: {new Date(order.closedAt).toLocaleString()}</span>}
        {order.notes && <span className="text-[#EAF0FF]/70">Notes: {order.notes}</span>}
        <div className="ml-auto flex gap-2">
          <button
            onClick={handleCopyText}
            className="rounded-md border border-white/10 px-3 py-1 text-xs text-[#EAF0FF]/70 hover:bg-white/5"
          >
            {copiedText ? "Copied!" : "Copy as Text"}
          </button>
        </div>
      </div>

      {/* Lines table */}
      <table className="w-full text-left text-sm">
        <thead className="border-b border-white/5 text-xs uppercase text-[#EAF0FF]/50">
          <tr>
            <th className="px-4 py-2 font-medium">Item</th>
            <th className="px-4 py-2 font-medium">SKU</th>
            <th className="px-4 py-2 font-medium">UOM</th>
            <th className="px-4 py-2 font-medium text-right">Ordered</th>
            <th className="px-4 py-2 font-medium text-right">Received</th>
            <th className="px-4 py-2 font-medium text-right">Remaining</th>
            <th className="px-4 py-2 font-medium">Progress</th>
            {!isClosed && <th className="px-4 py-2 font-medium text-right">Receive</th>}
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {order.lines.map((line: any) => {
            const ordered = Number(line.orderedQty);
            const received = Number(line.pickedUpQty);
            const remaining = Math.max(0, ordered - received);
            const pct = ordered > 0 ? (received / ordered) * 100 : 0;

            return (
              <tr key={line.id} className="hover:bg-[#0B1623]/40">
                <td className="px-4 py-2.5 font-medium text-[#EAF0FF]">
                  {line.inventoryItem?.name ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-[#EAF0FF]/60">
                  {line.inventoryItem?.vendorSku ?? "—"}
                </td>
                <td className="px-4 py-2.5 text-[#EAF0FF]/60">
                  {line.orderedUom === "package" ? "cases" : "units"}
                </td>
                <td className="px-4 py-2.5 text-right text-[#EAF0FF]/80">{ordered}</td>
                <td className="px-4 py-2.5 text-right text-[#EAF0FF]/80">{received}</td>
                <td className="px-4 py-2.5 text-right text-[#EAF0FF]/80">{remaining}</td>
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <div className="h-1.5 w-20 rounded-full bg-white/10">
                      <div
                        className={`h-full rounded-full ${pct >= 100 ? "bg-green-500" : pct > 0 ? "bg-amber-500" : "bg-white/20"}`}
                        style={{ width: `${Math.min(100, pct)}%` }}
                      />
                    </div>
                    <span className="text-xs text-[#EAF0FF]/40">{pct.toFixed(0)}%</span>
                  </div>
                </td>
                {!isClosed && (
                  <td className="px-4 py-2.5 text-right">
                    <input
                      type="number"
                      min={0}
                      max={remaining}
                      step="any"
                      value={getPickupQty(line.id, remaining)}
                      onChange={(e) => {
                        const next = new Map(pickupQtys);
                        next.set(line.id, Number(e.target.value));
                        setPickupQtys(next);
                      }}
                      disabled={remaining === 0}
                      className="w-20 rounded border border-white/10 bg-[#0B1623] px-2 py-1 text-right text-sm text-[#EAF0FF] disabled:opacity-30"
                    />
                  </td>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Actions */}
      {!isClosed && (
        <div className="flex items-center gap-3 border-t border-white/10 px-4 py-3">
          <button
            onClick={handleRecordPickup}
            disabled={recordPickupMutation.isPending}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-white hover:bg-[#D4A43C] disabled:opacity-50"
          >
            {recordPickupMutation.isPending ? "Recording..." : "Record Pickup"}
          </button>
          <button
            onClick={() => closeMutation.mutate({ purchaseOrderId: orderId })}
            disabled={closeMutation.isPending}
            className="rounded-md border border-red-500/30 px-4 py-2 text-sm font-medium text-red-400 hover:bg-red-500/10 disabled:opacity-50"
          >
            {closeMutation.isPending ? "Closing..." : "Close PO"}
          </button>
          {recordPickupMutation.error && (
            <p className="text-sm text-red-400">{recordPickupMutation.error.message}</p>
          )}
          {closeMutation.error && (
            <p className="text-sm text-red-400">{closeMutation.error.message}</p>
          )}
          {recordPickupMutation.isSuccess && (
            <p className="text-sm text-green-400">Pickup recorded successfully</p>
          )}
        </div>
      )}
    </div>
  );
}
