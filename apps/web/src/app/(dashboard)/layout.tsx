import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="flex h-screen">
      <Sidebar user={session.user as any} />
      <main className="flex-1 overflow-y-auto bg-[var(--navy-bg)] text-[var(--text-primary)] p-6">{children}</main>
    </div>
  );
}
