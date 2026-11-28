"use client";
import { useState } from "react";
import { Copy, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "./ui/button";

export function EmployeePasswordCell({ savedPassword, name }: { savedPassword: string | null; name: string }) {
  const [visible, setVisible] = useState(false);
  function available() {
    if (savedPassword !== null) return true;
    toast.info("No current password is saved. Reset this employee’s password to save it.");
    return false;
  }
  async function copy() {
    if (!available()) return;
    try {
      await navigator.clipboard.writeText(savedPassword!);
      toast.success("Password copied.");
    } catch { toast.error("Could not copy password. Check clipboard permission and try again."); }
  }
  return <div className="employee-password-cell"><span>{visible ? savedPassword : "••••••••"}</span><Button type="button" variant="ghost" size="icon" onClick={() => { if (available()) setVisible(value => !value); }} aria-label={`${visible ? "Hide" : "Show"} password for ${name}`}>{visible ? <EyeOff/> : <Eye/>}</Button><Button type="button" variant="ghost" size="icon" onClick={copy} aria-label={`Copy password for ${name}`} title="Copy password"><Copy/></Button></div>;
}
