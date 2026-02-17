export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div
      className="relative flex min-h-screen items-center justify-center bg-cover bg-center bg-no-repeat"
      style={{
        backgroundImage: "url('/assets/bg/bar-shelves.jpg')",
        backgroundColor: "var(--navy-bg)",
        fontFamily: "var(--font-primary)",
      }}
    >
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60" />
      <div className="relative z-10 w-full">{children}</div>
    </div>
  );
}
