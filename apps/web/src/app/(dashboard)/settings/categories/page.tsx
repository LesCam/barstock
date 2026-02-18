"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import { CountingMethod } from "@barstock/types";
import Link from "next/link";

const COUNTING_METHOD_LABELS: Record<string, string> = {
  weighable: "Weighable",
  unit_count: "Unit Count",
  keg: "Keg",
};

const COUNTING_METHOD_COLORS: Record<string, string> = {
  weighable: "bg-purple-500/10 text-purple-400",
  unit_count: "bg-blue-500/10 text-blue-400",
  keg: "bg-amber-500/10 text-amber-400",
};

export default function CategoriesSettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;
  const utils = trpc.useUtils();

  const { data: categories, isLoading } = trpc.itemCategories.list.useQuery(
    { businessId: businessId!, activeOnly: false },
    { enabled: !!businessId }
  );

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newMethod, setNewMethod] = useState<string>(CountingMethod.unit_count);
  const [newDensity, setNewDensity] = useState("");

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");

  const createMut = trpc.itemCategories.create.useMutation({
    onSuccess: () => {
      utils.itemCategories.list.invalidate();
      setShowCreate(false);
      setNewName("");
      setNewMethod(CountingMethod.unit_count);
      setNewDensity("");
    },
  });

  const updateMut = trpc.itemCategories.update.useMutation({
    onSuccess: () => {
      utils.itemCategories.list.invalidate();
      setEditingId(null);
    },
  });

  const deleteMut = trpc.itemCategories.delete.useMutation({
    onSuccess: () => utils.itemCategories.list.invalidate(),
  });

  function handleCreate() {
    if (!businessId || !newName.trim()) return;
    createMut.mutate({
      businessId,
      name: newName.trim(),
      countingMethod: newMethod as any,
      defaultDensity: newDensity ? Number(newDensity) : undefined,
      sortOrder: (categories?.length ?? 0),
    });
  }

  function startRename(cat: { id: string; name: string }) {
    setEditingId(cat.id);
    setEditName(cat.name);
  }

  function handleRename(id: string) {
    if (!editName.trim()) return;
    updateMut.mutate({ id, name: editName.trim() });
  }

  function handleToggleActive(id: string, currentlyActive: boolean) {
    updateMut.mutate({ id, active: !currentlyActive });
  }

  function handleMoveUp(id: string, index: number) {
    if (index <= 0 || !categories) return;
    const prev = categories[index - 1];
    updateMut.mutate({ id, sortOrder: prev.sortOrder });
    updateMut.mutate({ id: prev.id, sortOrder: categories[index].sortOrder });
  }

  function handleMoveDown(id: string, index: number) {
    if (!categories || index >= categories.length - 1) return;
    const next = categories[index + 1];
    updateMut.mutate({ id, sortOrder: next.sortOrder });
    updateMut.mutate({ id: next.id, sortOrder: categories[index].sortOrder });
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href="/settings"
          className="mb-2 inline-block text-sm text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
        >
          &larr; Back to Settings
        </Link>
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Item Categories</h1>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            {showCreate ? "Cancel" : "Add Category"}
          </button>
        </div>
        <p className="mt-1 text-sm text-[#EAF0FF]/60">
          Manage how your inventory is organized. Categories determine how items are counted (weighed, counted by unit, or tracked by keg).
        </p>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">New Category</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="e.g. Craft Tall Boys"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Counting Method *</label>
              <select
                value={newMethod}
                onChange={(e) => setNewMethod(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF]"
              >
                {Object.entries(COUNTING_METHOD_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            {newMethod === "weighable" && (
              <div>
                <label className="mb-1 block text-xs text-[#EAF0FF]/60">Default Density (g/mL)</label>
                <input
                  type="number"
                  step="0.01"
                  value={newDensity}
                  onChange={(e) => setNewDensity(e.target.value)}
                  className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                  placeholder="e.g. 0.95"
                />
              </div>
            )}
          </div>
          <div className="mt-3 flex items-center gap-3">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createMut.isPending}
              className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
            >
              {createMut.isPending ? "Creating..." : "Create"}
            </button>
            {createMut.error && (
              <p className="text-sm text-red-400">{createMut.error.message}</p>
            )}
          </div>
        </div>
      )}

      {/* Categories list */}
      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : (
        <div className="rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3 w-8"></th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Counting Method</th>
                <th className="px-4 py-3">Default Density</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {categories?.map((cat, idx) => (
                <tr key={cat.id} className={!cat.active ? "opacity-50" : ""}>
                  <td className="px-4 py-3">
                    <div className="flex flex-col gap-0.5">
                      <button
                        onClick={() => handleMoveUp(cat.id, idx)}
                        disabled={idx === 0 || updateMut.isPending}
                        className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF] disabled:invisible"
                      >
                        ▲
                      </button>
                      <button
                        onClick={() => handleMoveDown(cat.id, idx)}
                        disabled={idx === (categories?.length ?? 0) - 1 || updateMut.isPending}
                        className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF] disabled:invisible"
                      >
                        ▼
                      </button>
                    </div>
                  </td>
                  <td className="px-4 py-3 font-medium text-[#EAF0FF]">
                    {editingId === cat.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          value={editName}
                          onChange={(e) => setEditName(e.target.value)}
                          onKeyDown={(e) => e.key === "Enter" && handleRename(cat.id)}
                          className="rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                          autoFocus
                        />
                        <button
                          onClick={() => handleRename(cat.id)}
                          className="text-xs text-[#E9B44C] hover:text-[#C8922E]"
                        >
                          Save
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs text-[#EAF0FF]/40 hover:text-[#EAF0FF]"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      cat.name
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${COUNTING_METHOD_COLORS[cat.countingMethod] ?? ""}`}>
                      {COUNTING_METHOD_LABELS[cat.countingMethod] ?? cat.countingMethod}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-[#EAF0FF]/60">
                    {cat.defaultDensity != null ? `${Number(cat.defaultDensity)} g/mL` : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        cat.active ? "bg-green-500/10 text-green-400" : "bg-white/5 text-[#EAF0FF]/40"
                      }`}
                    >
                      {cat.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {editingId !== cat.id && (
                        <button
                          onClick={() => startRename(cat)}
                          className="text-xs text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
                        >
                          Rename
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleActive(cat.id, cat.active)}
                        disabled={updateMut.isPending}
                        className={`text-xs ${
                          cat.active ? "text-red-400/60 hover:text-red-400" : "text-green-400/60 hover:text-green-400"
                        }`}
                      >
                        {cat.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                    {deleteMut.error && (
                      <p className="mt-1 text-xs text-red-400">{deleteMut.error.message}</p>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {updateMut.error && (
        <p className="mt-2 text-sm text-red-400">{updateMut.error.message}</p>
      )}
    </div>
  );
}
