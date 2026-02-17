"use client";

import { Search, Bell, Menu } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/lib/auth";
import { createClient } from "@/lib/supabase/client";

interface TopbarProps {
  onMenuClick: () => void;
}

export function Topbar({ onMenuClick }: TopbarProps) {
  const { user, profile, isLoading } = useAuth();

  // Generate initials from name or email
  const getInitials = () => {
    if (profile?.full_name) {
      return profile.full_name
        .split(" ")
        .map((n) => n[0])
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    if (profile?.username) {
      return profile.username.slice(0, 2).toUpperCase();
    }
    if (user?.email) {
      return user.email.slice(0, 2).toUpperCase();
    }
    return "?";
  };

  // Get display name
  const getDisplayName = () => {
    if (profile?.full_name) return profile.full_name;
    if (profile?.username) return profile.username;
    if (user?.email) return user.email.split("@")[0];
    return "User";
  };

  // Get role display
  const getRoleDisplay = () => {
    if (!profile?.role) return "Loading...";
    return profile.role
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    window.location.href = "/signin";
  };

  return (
    <header className="flex h-20 items-center justify-between border-b-2 border-border bg-card px-4 md:px-6">
      {/* Left side - Menu button + Search */}
      <div className="flex flex-1 items-center gap-3">
        {/* Hamburger menu - mobile only */}
        <Button
          variant="outline"
          size="icon"
          onClick={onMenuClick}
          className="border-2 shadow-retro-sm lg:hidden"
        >
          <Menu className="h-5 w-5" strokeWidth={1.5} />
        </Button>

        {/* Search */}
        <div className="relative hidden w-full max-w-md sm:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" strokeWidth={1.5} />
          <Input
            type="search"
            placeholder="Search anything..."
            className="border-2 border-border bg-background pl-10 font-mono text-sm shadow-retro-sm transition-shadow focus:shadow-retro"
          />
        </div>

        {/* Mobile search button */}
        <Button
          variant="outline"
          size="icon"
          className="border-2 shadow-retro-sm sm:hidden"
        >
          <Search className="h-5 w-5" strokeWidth={1.5} />
        </Button>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 md:gap-3">
        {/* Notifications */}
        <Button 
          variant="outline" 
          size="icon" 
          className="relative border-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5"
        >
          <Bell className="h-5 w-5 text-muted-foreground" strokeWidth={1.5} />
          <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white">
            3
          </span>
        </Button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="flex items-center gap-2 border-2 px-2 shadow-retro-sm transition-all hover:shadow-retro hover:-translate-x-0.5 hover:-translate-y-0.5 md:gap-3 md:px-3"
            >
              <Avatar className="h-8 w-8 border-2 border-foreground">
                <AvatarFallback className="bg-background font-mono text-xs font-bold text-foreground">
                  {getInitials()}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left md:block">
                <p className="text-sm font-semibold text-foreground">
                  {getDisplayName()}
                </p>
                <p className="font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
                  {getRoleDisplay()}
                </p>
              </div>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56 border-2 shadow-retro">
            <DropdownMenuLabel>
              <div className="flex flex-col space-y-1">
                <p className="text-sm font-semibold">{getDisplayName()}</p>
                <p className="font-mono text-xs text-muted-foreground">
                  {user?.email}
                </p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="cursor-pointer font-medium">
              Profile
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer font-medium">
              Settings
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem 
              className="cursor-pointer font-medium text-muted-foreground"
              onClick={handleSignOut}
            >
              Sign out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}