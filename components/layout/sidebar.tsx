"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderKanban,
  CheckSquare,
  MessageSquare,
  Mail,
  Shield,
  Settings,
  TowerControl,
  Moon,
  X,
  Users,
  ClipboardCheck,
  Activity,
  CalendarDays, 
  BarChart3,
  FileDown,
  HardDrive,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

const navigation = [
  {
    name: "Dashboard",
    href: "/",
    icon: LayoutDashboard,
  },
  {
    name: "Programmes",
    href: "/programmes",
    icon: FolderKanban,
  },
  {
    name: "Tasks",
    href: "/tasks",
    icon: CheckSquare,
  },
  {
    name: "Team",
    href: "/team",
    icon: Users,
    allowedRoles: ["manager", "admin", "super_admin"],
  },
  {
    name: "Messaging",
    href: "/messaging",
    icon: MessageSquare,
  },
  {
    name: "Check-ins",
    href: "/checkins",
    icon: ClipboardCheck,
  },
  {
    name: "Calendar",
    href: "/calendar",
    icon: CalendarDays,
  },
  {
    name: "Shared Mail",
    href: "/shared-mail",
    icon: Mail,
    requiresGroup: "shared_mail_admin",
  },
  {
    name: "Activity",
    href: "/activity",
    icon: Activity,
  },
  {
    name: "Analytics",
    href: "/analytics",
    icon: BarChart3,
  },
  {
    name: "Drive",
    href: "/drive",
    icon: HardDrive,
  },
  {
    name: "Control Tower",
    href: "/admin",
    icon: TowerControl,
  },
  {
  name: "Reports",
  href: "/reports",
  icon: FileDown,  // import from lucide-react
},

];

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function Sidebar({ isOpen, onClose }: SidebarProps) {
  const pathname = usePathname();
  const { profile, user } = useAuth();
  const [userGroups, setUserGroups] = useState<string[]>([]);

  const userRole = profile?.role || "member";

  // Fetch user's groups
  useEffect(() => {
    const fetchUserGroups = async () => {
      if (!user?.id) return;

      const supabase = createClient();
      const { data } = await supabase
        .from("group_members")
        .select("group:groups(name)")
        .eq("user_id", user.id);

      if (data) {
        const groupNames: string[] = [];
        if (data) {
          for (const gm of data) {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const group = gm.group as any;
            if (group?.name) {
              groupNames.push(group.name);
            }
          }
        }
        setUserGroups(groupNames);
      }
    };

    fetchUserGroups();
  }, [user?.id]);

  const filteredNav = navigation.filter((item) => {
    // Check role requirement
    if (item.allowedRoles && !item.allowedRoles.includes(userRole)) {
      // Admins can also access group-gated items
      if (!["admin", "super_admin"].includes(userRole)) {
        return false;
      }
    }

    // Check group requirement
    if (item.requiresGroup) {
      // Admins always have access
      if (["admin", "super_admin"].includes(userRole)) {
        return true;
      }
      // Otherwise check group membership
      return userGroups.includes(item.requiresGroup);
    }

    return true;
  });

  const handleNavClick = () => {
    onClose();
  };

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-foreground/50 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-sidebar transition-transform duration-300 ease-in-out lg:static lg:translate-x-0",
          isOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        {/* Logo / Brand */}
        <div className="flex h-20 items-center justify-between border-b-2 border-sidebar-border px-5">
          <Link href="/" className="flex items-center gap-3" onClick={handleNavClick}>
            <div className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-sidebar-border bg-sidebar-accent shadow-retro-sm">
              <Moon className="h-6 w-6 text-sidebar-foreground" strokeWidth={1.5} />
            </div>
            <div className="flex flex-col">
              <span className="font-mono text-[10px] font-medium uppercase tracking-[0.2em] text-sidebar-foreground/60">
                Tek4All
              </span>
              <span className="text-xl font-bold tracking-tight text-sidebar-foreground">
                MoonDesk
              </span>
            </div>
          </Link>

          <button
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-foreground lg:hidden"
          >
            <X className="h-5 w-5" strokeWidth={1.5} />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-6">
          <p className="mb-3 px-3 font-mono text-[10px] font-medium uppercase tracking-widest text-sidebar-foreground/40">
            Menu
          </p>
          {filteredNav.map((item) => {
            const isActive =
              pathname === item.href ||
              (item.href !== "/" && pathname.startsWith(item.href));
            return (
              <Link
                key={item.name}
                href={item.href}
                onClick={handleNavClick}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all",
                  isActive
                    ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-retro-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                )}
              >
                <item.icon className="h-5 w-5" strokeWidth={1.5} />
                {item.name}
              </Link>
            );
          })}
        </nav>

        {/* Bottom section */}
        <div className="border-t-2 border-sidebar-border p-3">
          <Link
            href="/settings"
            onClick={handleNavClick}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-all",
              pathname === "/settings"
                ? "bg-sidebar-accent text-sidebar-accent-foreground shadow-retro-sm"
                : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            )}
          >
            <Settings className="h-5 w-5" strokeWidth={1.5} />
            Settings
          </Link>
          
          <div className="mt-4 px-3 text-center">
            <p className="font-mono text-[9px] uppercase tracking-widest text-sidebar-foreground/30">
              © 2026 Tek4All
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}