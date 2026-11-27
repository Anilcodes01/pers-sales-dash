"use client";
import { Dialog } from "radix-ui";
import { toast } from "sonner";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Menu,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  LayoutDashboard,
  Users,
  UsersRound,
  ChartNoAxesCombined,
  Upload,
  CircleCheck,
  LogOut,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { RecoveryPeriodControls } from "./recovery-period-controls";
import {
  RecoveryStatisticsButton,
  RecoveryStatisticsPanel,
} from "./recovery-statistics-panel";
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
  id: string;
  themeColor?: string;
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
  const [isMobile, setIsMobile] = useState(false);
  const [appearanceColor, setAppearanceColor] = useState(profile.themeColor);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  useEffect(() => {
    const desktop = window.matchMedia("(min-width: 751px)");
    const closeOnDesktop = () => { setIsMobile(!desktop.matches); if (desktop.matches) setMobileMenuOpen(false); };
    closeOnDesktop();
    desktop.addEventListener("change", closeOnDesktop);
    return () => desktop.removeEventListener("change", closeOnDesktop);
  }, []);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const initials =
    profile.name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((word) => word[0])
      .join("")
      .toUpperCase() || "U";
  const importsPath =
    profile.role === "sales_executive"
      ? "/sales-imports"
      : profile.role === "team_leader"
        ? "/team-imports"
        : profile.role === "recovery_admin"
          ? "/recovery-leads"
          : null;
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
  const sidebarContent = <>
        <Brand />
        <nav aria-label="Workspace navigation" onClick={event => { if ((event.target as Element).closest("a")) setMobileMenuOpen(false); }}>
          <Link
            className={`sidebar-link${!isUsers && !pathname.startsWith("/teams") && !isImports && pathname !== "/sales" && pathname !== "/allocation" && pathname !== "/recovered-leads" && pathname !== "/my-recovered-leads" ? " active" : ""}`}
            aria-current={
              !isUsers &&
              !pathname.startsWith("/teams") &&
              !isImports &&
              pathname !== "/sales" &&
              pathname !== "/allocation" &&
              pathname !== "/recovered-leads" &&
              pathname !== "/my-recovered-leads"
                ? "page"
                : undefined
            }
            title="Overview"
            aria-label="Overview"
            href={dashboardPath(profile.role)}
          >
            <LayoutDashboard size={17} />
            <span className="nav-label">Overview</span>
          </Link>
          {profile.role === "main_admin" && (
            <Link
              className={`sidebar-link${isUsers ? " active" : ""}`}
              aria-current={isUsers ? "page" : undefined}
              title="Team accounts"
              aria-label="Team accounts"
              href="/users"
            >
              <Users size={17} />
              <span className="nav-label">Team accounts</span>
            </Link>
          )}
          {profile.role === "main_admin" && (
            <Link
              className={`sidebar-link${pathname.startsWith("/teams") ? " active" : ""}`}
              aria-current={pathname.startsWith("/teams") ? "page" : undefined}
              title="Teams"
              aria-label="Teams"
              href="/teams"
            >
              <UsersRound size={17} />
              <span className="nav-label">Teams</span>
            </Link>
          )}
          {profile.role === "recovery_admin" && (
            <Link
              title="Allocation"
              aria-label="Allocation"
              href="/allocation"
              className={`sidebar-link${pathname === "/allocation" ? " active" : ""}`}
              aria-current={pathname === "/allocation" ? "page" : undefined}
            >
              <UsersRound size={17} />
              <span className="nav-label">Allocation</span>
            </Link>
          )}
          {importsPath && (
            <Link
              title={
                profile.role === "recovery_admin"
                  ? "Recovery leads"
                  : "My sales"
              }
              aria-label={
                profile.role === "recovery_admin"
                  ? "Recovery leads"
                  : "My sales"
              }
              href={importsPath}
              className={`sidebar-link${isImports ? " active" : ""}`}
              aria-current={isImports ? "page" : undefined}
            >
              <Upload size={17} />
              <span className="nav-label">
                {profile.role === "recovery_admin"
                  ? "Recovery leads"
                  : "My sales"}
              </span>
            </Link>
          )}
          {(profile.role === "recovery_admin" ||
            profile.role === "recovery_executive") && (
            <Link
              title="Recovered leads"
              aria-label="Recovered leads"
              href={
                profile.role === "recovery_admin"
                  ? "/recovered-leads"
                  : "/my-recovered-leads"
              }
              className={`sidebar-link${["/recovered-leads", "/my-recovered-leads"].includes(pathname) ? " active" : ""}`}
              aria-current={
                ["/recovered-leads", "/my-recovered-leads"].includes(pathname)
                  ? "page"
                  : undefined
              }
            >
              <CircleCheck size={17} />
              <span className="nav-label">Paid Students</span>
            </Link>
          )}
          {profile.role === "main_admin" && (
            <Link
              title="Sales"
              aria-label="Sales"
              href="/sales"
              className={`sidebar-link${pathname === "/sales" ? " active" : ""}`}
              aria-current={pathname === "/sales" ? "page" : undefined}
            >
              <ChartNoAxesCombined size={17} />
              <span className="nav-label">Sales</span>
            </Link>
          )}
        </nav>
  </>;
  return (
    <div className={`app-shell${sidebarCollapsed ? " sidebar-collapsed" : ""}`}>
      <aside id="workspace-sidebar" className="app-sidebar">
        {sidebarContent}
      </aside>
      <div
        className="app-main"
        ref={contentRef}
        role="region"
        aria-label="Workspace content"
        tabIndex={0}
      >
        <header className="dashboard-header">
          <Dialog.Root open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
            <Dialog.Trigger asChild><Button variant="ghost" className="mobile-menu-toggle" aria-label="Open navigation menu"><Menu/></Button></Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="mobile-sidebar-overlay"/>
              <Dialog.Content className="mobile-sidebar-drawer" aria-describedby={undefined}>
                <Dialog.Title className="sr-only">Workspace navigation</Dialog.Title>
                <Dialog.Close asChild><Button variant="ghost" className="mobile-menu-close" aria-label="Close navigation menu"><X/></Button></Dialog.Close>
                <div className="app-sidebar mobile-sidebar-content">{sidebarContent}</div>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
          <Button
            variant="ghost"
            className="sidebar-toggle"
            aria-label={
              sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"
            }
            aria-expanded={!sidebarCollapsed}
            aria-controls="workspace-sidebar"
            onClick={() => setSidebarCollapsed((value) => !value)}
          >
            {sidebarCollapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </Button>
          <div className="navbar-actions">
            <div className="desktop-navbar-controls">
            {profile.role === "recovery_admin" && <RecoveryPeriodControls />}
            <RecoveryStatisticsButton enabled={profile.role === "recovery_admin" || profile.role === "recovery_executive"}/>
            {!isMobile && <ThemeToggle key={profile.id} userId={profile.id} initialColor={appearanceColor} onColorChange={setAppearanceColor}/>}
            <span className="navbar-divider" />
            </div>
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
                {isMobile && <>
                  <DropdownMenuSeparator />
                  <RecoveryStatisticsButton menuItem enabled={profile.role === "recovery_admin" || profile.role === "recovery_executive"}/>
                  <ThemeToggle key={profile.id} inline userId={profile.id} initialColor={appearanceColor} onColorChange={setAppearanceColor}/>
                </>}
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
        {(profile.role === "recovery_admin" ||
          profile.role === "recovery_executive") && (
          <RecoveryStatisticsPanel
            individual={profile.role === "recovery_executive"}
          />
        )}
        <div className="workspace-scroll">{children}</div>
      </div>
    </div>
  );
}
