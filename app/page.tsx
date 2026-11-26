import { Suspense } from "react";
import { GuestOnly } from "@/components/guest-only";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, ChartNoAxesCombined, Users, Wallet, Check, Layers2 } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function Landing() {
  return <main className="landing"><header className="site-header"><Brand/><div className="public-navbar-actions"><ThemeToggle/><Button asChild variant="ghost"><Link href="/login">Sign in <ArrowUpRight/></Link></Button></div></header><section className="hero"><div className="hero-copy"><Badge variant="secondary" className="eyebrow">YOUR TEAM, IN SYNC</Badge><h1>A clearer view.<br/><span>A stronger team.</span></h1><p>Bring sales, recovery, and your people together in one focused workspace.</p><Button asChild size="lg"><Link href="/login">Enter your workspace <ArrowRight/></Link></Button><div className="hero-note"><Check size={14}/> Secure access, managed by your administrator</div></div><Card className="workspace-illustration"><CardContent><div className="illustration-heading"><span className="icon-tile"><Layers2 size={19}/></span><div><strong>Your connected workspace</strong><span>From first sale to final payment</span></div></div><div className="workflow-preview">{[{ icon: ChartNoAxesCombined, title: "Sales", text: "Enrollments and monthly progress", number: "01" }, { icon: Wallet, title: "Recovery", text: "Follow-ups and payment progress", number: "02" }, { icon: Users, title: "Your team", text: "People, roles, and a shared view", number: "03" }].map(({icon:Icon,title,text,number})=><div key={title} className="workflow-row"><span className="workflow-icon"><Icon size={19}/></span><div><strong>{title}</strong><span>{text}</span></div><small>{number}</small></div>)}</div><div className="illustration-footer"><span className="status-mark"/> One place to move work forward</div></CardContent></Card></section><section className="landing-bottom"><span>Built around your workday.</span><p>Clear ownership. Connected updates. Room to focus.</p></section></main>;
}

export default function Home() {
  return <Suspense fallback={null}><GuestOnly><Landing/></GuestOnly></Suspense>;
}
