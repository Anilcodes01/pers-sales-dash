"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, Palette, Check } from "lucide-react";
import { toast } from "sonner";
import { themeColors, isThemeColor } from "@/lib/theme-colors";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
export function ThemeToggle({ userId, initialColor }: { userId?: string; initialColor?: string }) {
  const { theme, setTheme } = useTheme();
  const [color, setColor] = useState<string>(isThemeColor(initialColor) ? initialColor : "green");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme-color", color);
    return () => { document.documentElement.removeAttribute("data-theme-color"); };
  }, [color]);
  async function choose(next: string) {
    const previous = color; setColor(next);
    if (!userId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/account/appearance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color: next }) });
      if (!response.ok) throw new Error();
    } catch {
      setColor(previous); toast.error("Could not save your theme color. Please retry.");
    } finally { setSaving(false); }
  }
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Change appearance" title="Appearance"><Palette size={17}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="theme-menu appearance-menu"><DropdownMenuLabel>Appearance</DropdownMenuLabel><div className="appearance-modes" role="group" aria-label="Appearance mode">{[{ id: "light", label: "Light", Icon: Sun }, { id: "dark", label: "Dark", Icon: Moon }, { id: "system", label: "System", Icon: Monitor }].map(({ id, label, Icon }) => <Button key={id} variant="ghost" title={label} aria-label={label} aria-pressed={(theme || "system") === id} onClick={() => setTheme(id)}><Icon size={21}/></Button>)}</div><DropdownMenuSeparator/><DropdownMenuLabel>Theme color</DropdownMenuLabel><div className="appearance-colors" role="group" aria-label="Theme color">{themeColors.map(option => <button key={option.id} type="button" title={option.label} aria-label={`${option.label} theme`} aria-pressed={color === option.id} disabled={saving} style={{ backgroundColor: option.color }} onClick={() => void choose(option.id)}>{color === option.id && <Check size={20}/>}</button>)}</div></DropdownMenuContent></DropdownMenu>;
}
