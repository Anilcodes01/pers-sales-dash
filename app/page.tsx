import { PublicPageLinks } from "@/components/public-info-page";
import { Suspense } from "react";
import { GuestOnly } from "@/components/guest-only";
import { ThemeToggle } from "@/components/theme-toggle";
import Link from "next/link";
import { ArrowRight, ArrowUpRight, Code2, BriefcaseBusiness, Check } from "lucide-react";
import { Brand } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { business } from "@/lib/business";
function Landing() {
  return <main className="landing"><header className="site-header"><Brand/><div className="public-navbar-actions"><ThemeToggle/><Button asChild variant="ghost"><Link href="/login">Staff sign in <ArrowUpRight/></Link></Button></div></header><section className="hero"><div className="hero-copy"><Badge variant="secondary" className="eyebrow">PERSEVEX COURSES</Badge><h1>Explore technology.<br/><span>Discover management.</span></h1><p>Technology and management courses from Persevex. Talk to our team to find the current programs, course details, and pricing for your chosen plan.</p><Button asChild size="lg"><Link href="/contact">Enquire about a course <ArrowRight/></Link></Button><div className="hero-note"><Check size={14}/> Course access after registration payment</div></div><Card className="workspace-illustration"><CardContent><div className="illustration-heading"><div><strong>Find your program</strong><span>Choose a course with clear enrollment details</span></div></div><div className="workflow-preview">{[{ Icon: Code2, title: "Technology courses", text: "Ask for current programs, curriculum, and learning format." }, { Icon: BriefcaseBusiness, title: "Management courses", text: "Explore business and management-related learning options." }].map(({ Icon, title, text }) => <div key={title} className="workflow-row"><span className="workflow-icon"><Icon size={19}/></span><div><strong>{title}</strong><span>{text}</span></div></div>)}</div><div className="illustration-footer"><Link href="/pricing">View pricing and registration information →</Link></div></CardContent></Card></section><section className="landing-bottom"><address className="business-contact"><strong>{business.name}</strong><span>{business.address}</span><span><a href={`mailto:${business.email}`}>{business.email}</a> · <a href={business.phoneHref}>{business.phone}</a></span></address><PublicPageLinks/></section></main>;
}
export default function Home() { return <Suspense fallback={null}><GuestOnly><Landing/></GuestOnly></Suspense>; }
