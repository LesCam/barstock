"use client";

import { Fragment, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";

const ACTION_LABELS: Record<string, string> = {
  "auth.login":                    "Login",
  "auth.login_failed":             "Login Failed",
  "auth.login_pin":                "PIN Login",
  "auth.login_pin_failed":         "PIN Login Failed",
  "user.created":                  "User Created",
  "user.updated":                  "User Updated",
  "user.permission.updated":       "Permission Updated",
  "user.location_access.granted":  "Access Granted",
  "user.location_access.revoked":  "Access Revoked",
  "settings.updated":              "Settings Updated",
  "session.created":               "Session Started",
  "session.closed":                "Session Closed",
  "inventory_item.created":        "Item Created",
  "inventory_item.updated":        "Item Updated",
  "stock.received":                "Stock Received",
  "category.created":              "Category Created",
  "category.updated":              "Category Updated",
  "category.deleted":              "Category Deleted",
  "vendor.created":                "Vendor Created",
  "price.added":                   "Price Added",
  "adjustment.created":            "Adjustment Created",
  "recipe.created":                "Recipe Created",
  "recipe.updated":                "Recipe Updated",
  "recipe.deleted":                "Recipe Deleted",
  "transfer.created":              "Transfer Created",
  "guide_category.created":        "Menu Category Created",
  "guide_category.updated":        "Menu Category Updated",
  "guide_category.deleted":        "Menu Category Deleted",
  "guide_category.reordered":      "Menu Categories Reordered",
  "guide_item.created":            "Menu Item Created",
  "guide_item.updated":            "Menu Item Updated",
  "guide_item.deleted":            "Menu Item Deleted",
  "guide_item.reordered":          "Menu Items Reordered",
  "guide_item.image_uploaded":     "Menu Image Uploaded",
  "guide_item.image_removed":      "Menu Image Removed",
  "guide_item.bulk_created":       "Menu Items Imported",
  "artist.created":                "Artist Created",
  "artist.updated":                "Artist Updated",
  "artist.deactivated":            "Artist Deactivated",
  "art_sale.recorded":             "Art Sale Recorded",
};

const OBJECT_TYPE_LABELS: Record<string, string> = {
  user:                    "User",
  user_location:           "User Location",
  inventory_item:          "Inventory Item",
  price_history:           "Price History",
  inventory_item_category: "Category",
  inventory_session:       "Counting Session",
  consumption_event:       "Consumption Event",
  business_settings:       "Settings",
  vendor:                  "Vendor",
  recipe:                  "Recipe",
  guide_category:          "Menu Category",
  guide_item:              "Menu Item",
  transfer:                "Transfer",
  artist:                  "Artist",
  artwork:                 "Artwork",
  art_sale:                "Art Sale",
};

function getBadgeColor(actionType: string): string {
  if (actionType.startsWith("auth."))       return "bg-red-500/15 text-red-400";
  if (actionType.startsWith("stock."))      return "bg-green-500/15 text-green-400";
  if (actionType.startsWith("adjustment.")) return "bg-orange-500/15 text-orange-400";
  if (
    actionType.startsWith("inventory") ||
    actionType.startsWith("session.") ||
    actionType.startsWith("transfer.") ||
    actionType.startsWith("category.") ||
    actionType.startsWith("vendor.") ||
    actionType.startsWith("price.")
  )
    return "bg-blue-500/15 text-blue-400";
  if (actionType.startsWith("recipe."))   return "bg-[#E9B44C]/15 text-[#E9B44C]";
  if (actionType.startsWith("settings.")) return "bg-purple-500/15 text-purple-400";
  if (actionType.startsWith("user."))     return "bg-cyan-500/15 text-cyan-400";
  if (
    actionType.startsWith("guide_") ||
    actionType.startsWith("artwork.") ||
    actionType.startsWith("artist.") ||
    actionType.startsWith("art_sale.")
  )
    return "bg-amber-500/15 text-amber-400";
  return "bg-white/5 text-[#E9B44C]";
}

function formatMetadataSummary(actionType: string, meta: any): string {
  if (!meta) return "—";
  switch (actionType) {
    case "stock.received":
      return `${meta.quantity} units of item received`;
    case "price.added":
      return `Unit cost: $${Number(meta.unitCost).toFixed(2)}`;
    case "session.closed":
      return `${meta.adjustmentsCreated} adjustment(s)`;
    case "adjustment.created":
      return `${meta.itemName}: ${meta.variance > 0 ? "+" : ""}${meta.variance} (${Number(meta.variancePercent).toFixed(1)}%)`;
    case "category.created":
    case "category.updated":
    case "category.deleted":
      return meta.name ?? "";
    case "vendor.created":
      return meta.name ?? "";
    case "user.created":
      return `${meta.email} (${meta.role})`;
    case "user.permission.updated":
      return `${meta.permissionKey}: ${meta.value ? "granted" : "revoked"}`;
    case "auth.login_failed":
      return `${meta.email ?? ""} — ${meta.reason}`;
    case "settings.updated":
      return Object.keys(meta).filter(k => meta[k] != null).join(", ");
    case "recipe.created":
    case "recipe.updated":
    case "recipe.deleted":
      return meta.ingredientCount != null
        ? `${meta.name ?? "Recipe"} (${meta.ingredientCount} ingredient${meta.ingredientCount === 1 ? "" : "s"})`
        : meta.name ?? "";
    case "transfer.created":
      return meta.fromSubArea && meta.toSubArea
        ? `${meta.itemName ?? "Item"} from ${meta.fromSubArea} → ${meta.toSubArea}${meta.quantity != null ? ` (${meta.quantity})` : ""}`
        : meta.itemName ?? "";
    case "guide_category.created":
    case "guide_category.updated":
    case "guide_category.deleted":
    case "guide_category.reordered":
      return meta.name ?? "";
    case "guide_item.created":
    case "guide_item.updated":
    case "guide_item.deleted":
    case "guide_item.reordered":
    case "guide_item.image_uploaded":
    case "guide_item.image_removed":
    case "guide_item.bulk_created":
      return meta.name ?? (meta.count != null ? `${meta.count} items` : "");
    case "artist.created":
    case "artist.updated":
    case "artist.deactivated":
      return meta.name ?? "";
    case "art_sale.recorded":
      return meta.salePrice != null
        ? `$${Number(meta.salePrice).toFixed(2)}${meta.commission != null ? ` (commission: $${Number(meta.commission).toFixed(2)})` : ""}`
        : "";
    default:
      return JSON.stringify(meta).slice(0, 80);
  }
}

function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin} min ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  if (diffDays < 7) return `${diffDays} day${diffDays === 1 ? "" : "s"} ago`;
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function exportCsv(items: any[], isPlatform: boolean) {
  const headers = isPlatform
    ? ["Timestamp", "Business", "Actor", "Action", "Object Type", "Object ID", "Metadata"]
    : ["Timestamp", "Actor", "Action", "Object Type", "Object ID", "Metadata"];
  const rows = items.map((entry) => {
    const actor = entry.actorUser
      ? entry.actorUser.firstName || entry.actorUser.lastName
        ? [entry.actorUser.firstName, entry.actorUser.lastName].filter(Boolean).join(" ")
        : entry.actorUser.email
      : "System";
    const metadata = entry.metadataJson ? JSON.stringify(entry.metadataJson) : "";
    const base = [
      new Date(entry.createdAt).toISOString(),
      actor,
      entry.actionType,
      entry.objectType ?? "",
      entry.objectId ?? "",
      metadata,
    ];
    if (isPlatform) base.splice(1, 0, entry.business?.name ?? "");
    return base;
  });

  const csvContent = [headers, ...rows]
    .map((row) => row.map((cell: string) => `"${cell.replace(/"/g, '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export default function AuditPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId as string | undefined;
  const isPlatform = user?.highestRole === "platform_admin";

  const [filterBusinessId, setFilterBusinessId] = useState("");
  const [actionType, setActionType] = useState("");
  const [actorUserId, setActorUserId] = useState("");
  const [objectType, setObjectType] = useState("");
  const [objectId, setObjectId] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // The businessId sent to API: platform admins use filter (empty = all), regular admins use their own
  const queryBusinessId = isPlatform
    ? filterBusinessId || undefined
    : businessId;

  const { data: businesses } = trpc.audit.businesses.useQuery(
    undefined,
    { enabled: isPlatform }
  );

  const { data: actionTypes } = trpc.audit.actionTypes.useQuery(
    { businessId: queryBusinessId },
    { enabled: isPlatform || !!businessId }
  );

  const { data: objectTypes } = trpc.audit.objectTypes.useQuery(
    { businessId: queryBusinessId },
    { enabled: isPlatform || !!businessId }
  );

  const { data: actors } = trpc.audit.actors.useQuery(
    { businessId: queryBusinessId },
    { enabled: isPlatform || !!businessId }
  );

  const { data, isLoading } = trpc.audit.list.useQuery(
    {
      businessId: queryBusinessId,
      ...(actionType && { actionType }),
      ...(actorUserId && { actorUserId }),
      ...(objectType && { objectType }),
      ...(objectType && objectId && { objectId }),
      ...(fromDate && { fromDate: new Date(fromDate) }),
      ...(toDate && { toDate: new Date(toDate + "T23:59:59") }),
      cursor,
      limit: 50,
    },
    { enabled: isPlatform || !!businessId }
  );

  // Accumulate pages
  const [allItems, setAllItems] = useState<any[]>([]);
  const items = cursor ? [...allItems, ...(data?.items ?? [])] : (data?.items ?? []);

  function handleLoadMore() {
    if (data?.nextCursor) {
      setAllItems(items);
      setCursor(data.nextCursor);
    }
  }

  function handleFilterChange() {
    setAllItems([]);
    setCursor(undefined);
  }

  function actorName(actor: { firstName?: string | null; lastName?: string | null; email: string } | null) {
    if (!actor) return "System";
    if (actor.firstName || actor.lastName) return [actor.firstName, actor.lastName].filter(Boolean).join(" ");
    return actor.email;
  }

  const hasFilters = filterBusinessId || actionType || actorUserId || objectType || objectId || fromDate || toDate;

  if (!isPlatform && !businessId) {
    return <div className="text-[#EAF0FF]/60">No business selected.</div>;
  }

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">
        {isPlatform ? "Platform Audit Log" : "Audit Log"}
      </h1>

      {/* Filter bar */}
      <div className="mb-4 flex flex-wrap gap-3">
        {isPlatform && (
          <select
            value={filterBusinessId}
            onChange={(e) => { setFilterBusinessId(e.target.value); handleFilterChange(); }}
            className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          >
            <option value="">All businesses</option>
            {businesses?.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        )}

        <select
          value={actionType}
          onChange={(e) => { setActionType(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All actions</option>
          {actionTypes?.map((at) => (
            <option key={at} value={at}>{ACTION_LABELS[at] ?? at}</option>
          ))}
        </select>

        <select
          value={actorUserId}
          onChange={(e) => { setActorUserId(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All actors</option>
          {actors?.map((a) => (
            <option key={a.id} value={a.id}>{actorName(a)}</option>
          ))}
        </select>

        <select
          value={objectType}
          onChange={(e) => {
            setObjectType(e.target.value);
            if (!e.target.value) setObjectId("");
            handleFilterChange();
          }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
        >
          <option value="">All object types</option>
          {objectTypes?.map((ot) => (
            <option key={ot} value={ot}>{OBJECT_TYPE_LABELS[ot] ?? ot}</option>
          ))}
        </select>

        {objectType && (
          <input
            type="text"
            value={objectId}
            onChange={(e) => { setObjectId(e.target.value); handleFilterChange(); }}
            placeholder="Object ID"
            className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
          />
        )}

        <input
          type="date"
          value={fromDate}
          onChange={(e) => { setFromDate(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          placeholder="From"
        />

        <input
          type="date"
          value={toDate}
          onChange={(e) => { setToDate(e.target.value); handleFilterChange(); }}
          className="rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
          placeholder="To"
        />

        {hasFilters && (
          <button
            onClick={() => {
              setFilterBusinessId("");
              setActionType("");
              setActorUserId("");
              setObjectType("");
              setObjectId("");
              setFromDate("");
              setToDate("");
              handleFilterChange();
            }}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-[#EAF0FF]/60 hover:bg-white/5"
          >
            Clear filters
          </button>
        )}

        {items.length > 0 && (
          <button
            onClick={() => exportCsv(items, isPlatform)}
            className="rounded-md border border-white/10 px-3 py-2 text-sm text-[#EAF0FF]/60 hover:bg-white/5"
          >
            Export CSV
          </button>
        )}
      </div>

      {isLoading && !items.length ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : items.length === 0 ? (
        <p className="text-[#EAF0FF]/60">No audit log entries found.</p>
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-white/10 bg-[#16283F]">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
                <tr>
                  <th className="px-4 py-3">Timestamp</th>
                  {isPlatform && <th className="px-4 py-3">Business</th>}
                  <th className="px-4 py-3">Actor</th>
                  <th className="px-4 py-3">Action</th>
                  <th className="px-4 py-3">Object Type</th>
                  <th className="px-4 py-3">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {items.map((entry: any) => (
                  <Fragment key={entry.id}>
                    <tr
                      className="cursor-pointer hover:bg-[#0B1623]/40"
                      onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
                    >
                      <td
                        className="px-4 py-3 text-xs text-[#EAF0FF]/70"
                        title={new Date(entry.createdAt).toLocaleString()}
                      >
                        {formatRelativeTime(new Date(entry.createdAt))}
                      </td>
                      {isPlatform && (
                        <td className="px-4 py-3 text-[#EAF0FF]/70">
                          {entry.business?.name ?? "—"}
                        </td>
                      )}
                      <td className="px-4 py-3 text-[#EAF0FF]/80">
                        {actorName(entry.actorUser)}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${getBadgeColor(entry.actionType)}`} title={entry.actionType}>
                          {ACTION_LABELS[entry.actionType] ?? entry.actionType}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-[#EAF0FF]/70">
                        {OBJECT_TYPE_LABELS[entry.objectType] ?? entry.objectType}
                      </td>
                      <td className="max-w-[250px] truncate px-4 py-3 text-xs text-[#EAF0FF]/50">
                        {formatMetadataSummary(entry.actionType, entry.metadataJson)}
                      </td>
                    </tr>
                    {expandedId === entry.id && entry.metadataJson && (
                      <tr>
                        <td colSpan={isPlatform ? 6 : 5} className="px-4 py-3 bg-[#0B1623]">
                          <pre className="max-h-60 overflow-auto text-xs text-[#EAF0FF]/70">
                            {JSON.stringify(entry.metadataJson, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>

          {data?.nextCursor && (
            <div className="mt-4 text-center">
              <button
                onClick={handleLoadMore}
                className="rounded-md border border-white/10 px-4 py-2 text-sm text-[#EAF0FF]/80 hover:bg-white/5"
              >
                Load More
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
