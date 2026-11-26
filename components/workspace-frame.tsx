"use client";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  LayoutDashboard,
  Users,
  UsersRound,
  ChartNoAxesCombined,
  Upload,
  LogOut,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
import { Button } from "./ui/button";
import { Avatar, AvatarImage, AvatarFallback } from "./ui/avatar";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuItem,
} from "./ui/dropdown-menu";
import { type Role } from "@/lib/auth/roles";
import { dashboardPath } from "@/lib/auth/dashboard-routing";

type Profile = {
  email: string;
  name: string;
  avatarUrl?: string;
  role: Role | null;
};
export function WorkspaceFrame({
  profile,
  children,
}: {
  profile: Profile;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    contentRef.current?.scrollTo({ top: 0, left: 0 });
  }, [pathname]);
  const [busy, setBusy] = useState(false);
  const initials =
    profile.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "U";
  const importsPath = profile.role === "sales_executive" ? "/sales-imports" : profile.role === "team_leader" ? "/team-imports" : null;
  const isImports = Boolean(importsPath && pathname === importsPath);
  const isUsers = pathname.startsWith("/users");
  async function signOut() {
    setBusy(true);
    
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (!response.ok) throw new Error();
      router.replace("/login");
      router.refresh();
    } catch {
      toast.error("Could not sign out. Please retry.");
      setBusy(false);
    }
  }
  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <Brand />
        <nav aria-label="Workspace navigation">
          <Link
            className={`sidebar-link${(!isUsers && !pathname.startsWith("/teams") && !isImports && pathname !== "/sales") ? " active" : ""}`}
            aria-current={(!isUsers && !pathname.startsWith("/teams") && !isImports && pathname !== "/sales") ? "page" : undefined}
            href={dashboardPath(profile.role)}
          >
            <LayoutDashboard size={17} />
            Overview
          </Link>
          {profile.role === "main_admin" && (
            <Link
              className={`sidebar-link${isUsers ? " active" : ""}`}
              aria-current={isUsers ? "page" : undefined}
              href="/users"
            >
              <Users size={17} />
              Team accounts
            </Link>
          )}
          {profile.role === "main_admin" && <Link className={`sidebar-link${pathname.startsWith("/teams") ? " active" : ""}`} aria-current={pathname.startsWith("/teams") ? "page" : undefined} href="/teams"><UsersRound size={17}/>Teams</Link>}
          {importsPath && <Link href={importsPath} className={`sidebar-link${isImports ? " active" : ""}`} aria-current={isImports ? "page" : undefined}><Upload size={17}/>My sales</Link>}
          {profile.role === "main_admin" && <Link href="/sales" className={`sidebar-link${pathname === "/sales" ? " active" : ""}`} aria-current={pathname === "/sales" ? "page" : undefined}><ChartNoAxesCombined size={17}/>Sales</Link>}
        </nav>
      </aside>
      <div className="app-main" ref={contentRef} role="region" aria-label="Workspace content" tabIndex={0}>
        <header className="dashboard-header">
          <div className="navbar-actions">
            <ThemeToggle />
            <span className="navbar-divider" />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="ghost"
                  className="profile-trigger"
                  aria-label={`Account menu for ${profile.email}`}
                >
                  <Avatar className="navbar-avatar">
                    {profile.avatarUrl && (
                      <AvatarImage
                        src={profile.avatarUrl}
                        alt=""
                        referrerPolicy="no-referrer"
                      />
                    )}
                    <AvatarFallback>{initials}</AvatarFallback>
                  </Avatar>
                  <ChevronDown size={13} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="account-menu">
                <DropdownMenuLabel>
                  <strong>{profile.name}</strong>
                  <span>{profile.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  disabled={busy}
                  onSelect={() => {
                    void signOut();
                  }}
                >
                  {busy ? <Loader2 className="animate-spin" /> : <LogOut />}{" "}
                  {busy ? "Signing out…" : "Sign out"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="workspace-scroll">
        
        {children}
        </div>
      </div>
    </div>
  );
}
