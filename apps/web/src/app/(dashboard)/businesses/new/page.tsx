"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { trpc } from "@/lib/trpc";

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export default function NewBusinessPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const user = session?.user as any;

  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [address, setAddress] = useState("");
  const [error, setError] = useState("");

  const createMutation = trpc.businesses.create.useMutation({
    onSuccess: () => router.push("/businesses"),
    onError: (err) => setError(err.message),
  });

  if (user && user.highestRole !== "platform_admin") {
    router.replace("/");
    return null;
  }

  function handleNameChange(value: string) {
    setName(value);
    if (!slugTouched) {
      setSlug(slugify(value));
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    createMutation.mutate({
      name,
      slug,
      contactEmail: contactEmail || undefined,
      contactPhone: contactPhone || undefined,
      address: address || undefined,
    });
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-6 text-2xl font-bold text-[#EAF0FF]">
        Create Business
      </h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
            Name *
          </label>
          <input
            type="text"
            required
            value={name}
            onChange={(e) => handleNameChange(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
            Slug *
          </label>
          <input
            type="text"
            required
            value={slug}
            onChange={(e) => {
              setSlugTouched(true);
              setSlug(e.target.value);
            }}
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
          />
          <p className="mt-1 text-xs text-[#EAF0FF]/40">
            Lowercase, hyphens allowed. Auto-generated from name.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
            Contact Email
          </label>
          <input
            type="email"
            value={contactEmail}
            onChange={(e) => setContactEmail(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
            Contact Phone
          </label>
          <input
            type="tel"
            value={contactPhone}
            onChange={(e) => setContactPhone(e.target.value)}
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-[#EAF0FF]/80">
            Address
          </label>
          <textarea
            value={address}
            onChange={(e) => setAddress(e.target.value)}
            rows={2}
            className="w-full rounded-md border border-white/10 bg-[#0B1623] px-3 py-2 text-sm text-[#EAF0FF] focus:border-[#E9B44C] focus:outline-none focus:ring-1 focus:ring-[#E9B44C]"
          />
        </div>

        {error && (
          <p className="text-sm text-red-600">{error}</p>
        )}

        <div className="flex gap-3">
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="rounded-md bg-[#E9B44C] px-4 py-2 text-sm font-medium text-[#0B1623] hover:bg-[#C8922E] disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Create Business"}
          </button>
          <button
            type="button"
            onClick={() => router.push("/businesses")}
            className="rounded-md border border-white/10 px-4 py-2 text-sm font-medium text-[#EAF0FF]/80 hover:bg-[#16283F]/60"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
