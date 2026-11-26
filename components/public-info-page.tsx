import Link from "next/link";
import { business } from "@/lib/business";
import { ArrowLeft } from "lucide-react";
import { Brand } from "./brand";
import { ThemeToggle } from "./theme-toggle";
export function PublicPageLinks() {
  return <nav aria-label="About and policies" className="landing-footer-links"><Link href="/about">About</Link><Link href="/contact">Contact</Link><Link href="/pricing">Pricing</Link><Link href="/terms-and-conditions">Terms and Conditions</Link><Link href="/privacy-policy">Privacy Policy</Link><Link href="/refund-policy">Refund Policy</Link></nav>;
}
export function PublicInfoPage({ title, introduction, sections }: { title: string; introduction: string; sections: { title: string; text: string }[] }) {
  return <main className="terms-page"><header className="site-header"><Brand/><div className="public-navbar-actions"><ThemeToggle/><Link href="/" className="back-link"><ArrowLeft size={14}/> Back to home</Link></div></header><article className="terms-content"><h1>{title}</h1><p className="terms-updated">Last updated: 26 November 2026</p><p>{introduction}</p>{sections.map(section => <section key={section.title}><h2>{section.title}</h2><p>{section.text}</p></section>)}<footer className="public-info-footer"><address className="business-contact"><strong>{business.name}</strong><span>{business.address}</span><span><a href={`mailto:${business.email}`}>{business.email}</a> · <a href={business.phoneHref}>{business.phone}</a></span></address><PublicPageLinks/></footer></article></main>;
}
