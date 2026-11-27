"use client";
import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, Palette, Check } from "lucide-react";
import { toast } from "sonner";
import { themeColors, isThemeColor } from "@/lib/theme-colors";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
export function ThemeToggle({ userId, initialColor, inline = false, onColorChange }: { userId?: string; initialColor?: string; inline?: boolean; onColorChange?: (color: string) => void }) {
  const { theme, setTheme } = useTheme();
  const [color, setColor] = useState<string>(isThemeColor(initialColor) ? initialColor : "green");
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    document.documentElement.setAttribute("data-theme-color", color);
    // Appearance remains applied when the mobile account menu unmounts.
  }, [color]);
  async function choose(next: string) {
    const previous = color; setColor(next); onColorChange?.(next);
    if (!userId) return;
    setSaving(true);
    try {
      const response = await fetch("/api/account/appearance", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ color: next }) });
      if (!response.ok) throw new Error();
    } catch {
      setColor(previous); onColorChange?.(previous); toast.error("Could not save your theme color. Please retry.");
    } finally { setSaving(false); }
  }
  const controls = <><DropdownMenuLabel>Appearance</DropdownMenuLabel><div className="appearance-modes" role="group" aria-label="Appearance mode">{[{ id: "light", label: "Light", Icon: Sun }, { id: "dark", label: "Dark", Icon: Moon }, { id: "system", label: "System", Icon: Monitor }].map(({ id, label, Icon }) => <Button key={id} variant="ghost" title={label} aria-label={label} aria-pressed={(theme || "system") === id} onClick={() => setTheme(id)}><Icon size={21}/></Button>)}</div><DropdownMenuSeparator/><DropdownMenuLabel>Theme color</DropdownMenuLabel><div className="appearance-colors" role="group" aria-label="Theme color">{themeColors.map(option => <button key={option.id} type="button" title={option.label} aria-label={`${option.label} theme`} aria-pressed={color === option.id} disabled={saving} style={{ backgroundColor: option.color }} onClick={() => void choose(option.id)}>{color === option.id && <Check size={20}/>}</button>)}</div></>;
  if (inline) return <div className="appearance-menu mobile-account-appearance">{controls}</div>;
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Change appearance" title="Appearance"><Palette size={17}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="theme-menu appearance-menu">{controls}</DropdownMenuContent></DropdownMenu>;
}
