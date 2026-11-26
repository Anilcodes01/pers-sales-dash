import { Suspense } from "react";
import { GuestOnly } from "@/components/guest-only";
import { ThemeToggle } from "@/components/theme-toggle";
import { Brand } from "@/components/brand";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import Link from "next/link";
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={null}><GuestOnly><main className="auth-shell">
      <header className="site-header">
        <Brand />
        <div className="public-navbar-actions">
          <ThemeToggle />
          <Link href="/" className="back-link">
            <ArrowLeft size={14} /> Back to home
          </Link>
        </div>
      </header>
      <div className="auth-stage">
        <section className="auth-card">{children}</section>
        <p className="auth-security">
          <ShieldCheck size={14} /> A private workspace for your team
        </p>
      </div>
    </main></GuestOnly></Suspense>
  );
}
