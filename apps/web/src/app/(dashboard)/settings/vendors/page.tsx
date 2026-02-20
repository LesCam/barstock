"use client";

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useSession } from "next-auth/react";
import Link from "next/link";

function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)})${digits.slice(3)}`;
  return `(${digits.slice(0, 3)})${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export default function VendorsSettingsPage() {
  const { data: session } = useSession();
  const user = session?.user as any;
  const businessId = user?.businessId;
  const utils = trpc.useUtils();

  const { data: vendors, isLoading } = trpc.vendors.list.useQuery(
    { businessId: businessId!, activeOnly: false },
    { enabled: !!businessId }
  );

  // Create form state
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newStreet, setNewStreet] = useState("");
  const [newCity, setNewCity] = useState("");
  const [newProvince, setNewProvince] = useState("");
  const [newPostalCode, setNewPostalCode] = useState("");

  // Inline edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editAddress, setEditAddress] = useState("");
  const [editCity, setEditCity] = useState("");
  const [editProvince, setEditProvince] = useState("");
  const [editPostalCode, setEditPostalCode] = useState("");

  const createMut = trpc.vendors.create.useMutation({
    onSuccess: () => {
      utils.vendors.list.invalidate();
      setShowCreate(false);
      setNewName("");
      setNewEmail("");
      setNewPhone("");
      setNewStreet("");
      setNewCity("");
      setNewProvince("");
      setNewPostalCode("");
    },
  });

  const updateMut = trpc.vendors.update.useMutation({
    onSuccess: () => {
      utils.vendors.list.invalidate();
      setEditingId(null);
    },
  });

  const deleteMut = trpc.vendors.delete.useMutation({
    onSuccess: () => utils.vendors.list.invalidate(),
  });

  function handleCreate() {
    if (!businessId || !newName.trim()) return;
    createMut.mutate({
      businessId,
      name: newName.trim(),
      contactEmail: newEmail.trim() || undefined,
      contactPhone: newPhone.trim() || undefined,
      address: newStreet.trim() || undefined,
      city: newCity.trim() || undefined,
      province: newProvince.trim() || undefined,
      postalCode: newPostalCode.trim() || undefined,
    });
  }

  function startEdit(v: any) {
    setEditingId(v.id);
    setEditName(v.name);
    setEditEmail(v.contactEmail ?? "");
    setEditPhone(v.contactPhone ?? "");
    setEditAddress(v.address ?? "");
    setEditCity(v.city ?? "");
    setEditProvince(v.province ?? "");
    setEditPostalCode(v.postalCode ?? "");
  }

  function handleSaveEdit(id: string) {
    if (!editName.trim()) return;
    updateMut.mutate({
      id,
      name: editName.trim(),
      contactEmail: editEmail.trim() || null,
      contactPhone: editPhone.trim() || null,
      address: editAddress.trim() || null,
      city: editCity.trim() || null,
      province: editProvince.trim() || null,
      postalCode: editPostalCode.trim() || null,
    });
  }

  function handleToggleActive(id: string, currentlyActive: boolean) {
    if (currentlyActive) {
      deleteMut.mutate({ id });
    } else {
      updateMut.mutate({ id, active: true });
    }
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
          <h1 className="text-2xl font-bold text-[#EAF0FF]">Vendors</h1>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E]"
          >
            {showCreate ? "Cancel" : "Add Vendor"}
          </button>
        </div>
        <p className="mt-1 text-sm text-[#EAF0FF]/60">
          Manage your suppliers. Vendors can be assigned to inventory items for ordering and tracking.
        </p>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="mb-4 rounded-lg border border-white/10 bg-[#16283F] p-4">
          <h2 className="mb-3 text-sm font-semibold text-[#EAF0FF]">New Vendor</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Name *</label>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="e.g. Charton Hobbs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Email</label>
              <input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="contact@example.com"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Phone</label>
              <input
                type="tel"
                value={newPhone}
                onChange={(e) => setNewPhone(formatPhone(e.target.value))}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="(555)555-5555"
              />
            </div>
          </div>
          <div className="mt-3">
            <label className="mb-1 block text-xs text-[#EAF0FF]/60">Street Address</label>
            <input
              type="text"
              value={newStreet}
              onChange={(e) => setNewStreet(e.target.value)}
              className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
              placeholder="123 Main St"
            />
          </div>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">City</label>
              <input
                type="text"
                value={newCity}
                onChange={(e) => setNewCity(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="City"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Province</label>
              <input
                type="text"
                value={newProvince}
                onChange={(e) => setNewProvince(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="ON"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-[#EAF0FF]/60">Postal Code</label>
              <input
                type="text"
                value={newPostalCode}
                onChange={(e) => setNewPostalCode(e.target.value)}
                className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] placeholder:text-[#EAF0FF]/30"
                placeholder="A1B 2C3"
              />
            </div>
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

      {/* Vendors list */}
      {isLoading ? (
        <p className="text-[#EAF0FF]/60">Loading...</p>
      ) : !vendors?.length ? (
        <p className="text-[#EAF0FF]/40 text-sm">No vendors yet. Add one to start tracking suppliers.</p>
      ) : (
        <div className="rounded-lg border border-white/10 bg-[#16283F]">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-white/10 bg-[#0B1623] text-xs uppercase text-[#EAF0FF]/60">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Address</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {vendors.map((v) => (
                <tr key={v.id} className={!v.active ? "opacity-50" : ""}>
                  <td className="px-4 py-3 font-medium text-[#EAF0FF]">
                    {editingId === v.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && handleSaveEdit(v.id)}
                        className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                        autoFocus
                      />
                    ) : (
                      v.name
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#EAF0FF]/70">
                    {editingId === v.id ? (
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                      />
                    ) : (
                      v.contactEmail ?? "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#EAF0FF]/70">
                    {editingId === v.id ? (
                      <input
                        type="tel"
                        value={editPhone}
                        onChange={(e) => setEditPhone(formatPhone(e.target.value))}
                        className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                      />
                    ) : (
                      v.contactPhone ? formatPhone(v.contactPhone) : "—"
                    )}
                  </td>
                  <td className="px-4 py-3 text-[#EAF0FF]/70">
                    {editingId === v.id ? (
                      <div className="space-y-1">
                        <input
                          type="text"
                          value={editAddress}
                          onChange={(e) => setEditAddress(e.target.value)}
                          placeholder="Street"
                          className="w-full rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                        />
                        <div className="flex gap-1">
                          <input
                            type="text"
                            value={editCity}
                            onChange={(e) => setEditCity(e.target.value)}
                            placeholder="City"
                            className="w-1/2 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                          />
                          <input
                            type="text"
                            value={editProvince}
                            onChange={(e) => setEditProvince(e.target.value)}
                            placeholder="Prov"
                            className="w-1/4 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                          />
                          <input
                            type="text"
                            value={editPostalCode}
                            onChange={(e) => setEditPostalCode(e.target.value)}
                            placeholder="Postal"
                            className="w-1/4 rounded-md border border-white/10 bg-[#0B1623] px-2 py-1 text-sm text-[#EAF0FF]"
                          />
                        </div>
                      </div>
                    ) : (
                      (() => {
                        const parts = [v.address, v.city, v.province, v.postalCode].filter(Boolean);
                        return parts.length > 0 ? parts.join(", ") : "—";
                      })()
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        v.active ? "bg-green-500/10 text-green-400" : "bg-white/5 text-[#EAF0FF]/40"
                      }`}
                    >
                      {v.active ? "Active" : "Inactive"}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      {editingId === v.id ? (
                        <>
                          <button
                            onClick={() => handleSaveEdit(v.id)}
                            disabled={updateMut.isPending}
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
                        </>
                      ) : (
                        <button
                          onClick={() => startEdit(v)}
                          className="text-xs text-[#EAF0FF]/60 hover:text-[#EAF0FF]"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        onClick={() => handleToggleActive(v.id, v.active)}
                        disabled={updateMut.isPending || deleteMut.isPending}
                        className={`text-xs ${
                          v.active ? "text-red-400/60 hover:text-red-400" : "text-green-400/60 hover:text-green-400"
                        }`}
                      >
                        {v.active ? "Deactivate" : "Reactivate"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(updateMut.error || deleteMut.error) && (
        <p className="mt-2 text-sm text-red-400">{(updateMut.error || deleteMut.error)?.message}</p>
      )}
    </div>
  );
}
