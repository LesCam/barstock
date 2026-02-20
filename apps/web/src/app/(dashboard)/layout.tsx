import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { NotificationBell } from "@/components/notification-bell";

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
      <div className="flex flex-1 flex-col">
        <header className="flex items-center justify-end border-b border-white/10 px-6 py-3">
          <NotificationBell />
        </header>
        <main className="flex-1 overflow-y-auto bg-[var(--navy-bg)] text-[var(--text-primary)] p-6">{children}</main>
      </div>
    </div>
  );
}
