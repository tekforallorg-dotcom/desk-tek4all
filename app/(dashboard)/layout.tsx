import { AppShell } from "@/components/layout";
import { AuthProvider } from "@/lib/auth";
import { LunaProvider } from "@/lib/luna/context";
import { LunaWidget } from "@/components/luna/luna-widget";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthProvider>
      <LunaProvider>
        <AppShell>{children}</AppShell>
        <LunaWidget />
      </LunaProvider>
    </AuthProvider>
  );
}