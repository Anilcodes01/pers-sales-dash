import { AuthForm } from "@/components/auth-form";
import { authConfigured } from "@/lib/supabase/config";
import { LogIn } from "lucide-react";
export const metadata = { title: "Sign in | Collective" };
export default function Login() {
  return <><div className="auth-icon"><LogIn size={23}/></div><span className="section-number">WELCOME TO COLLECTIVE</span><h1>Good to see you.</h1><p className="auth-intro">Sign in to your team workspace with the credentials provided by your administrator.</p><AuthForm configured={authConfigured()}/></>;
}
