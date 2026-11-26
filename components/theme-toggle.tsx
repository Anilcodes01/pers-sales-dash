"use client";
import { useTheme } from "next-themes";
import { Monitor, Moon, Sun, Palette } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu";
export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return <DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Change appearance" title="Appearance"><Palette size={17}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end" className="theme-menu"><DropdownMenuLabel>Appearance</DropdownMenuLabel><DropdownMenuSeparator/><DropdownMenuRadioGroup value={theme || "system"} onValueChange={setTheme}><DropdownMenuRadioItem value="light"><Sun size={15}/> Light</DropdownMenuRadioItem><DropdownMenuRadioItem value="dark"><Moon size={15}/> Dark</DropdownMenuRadioItem><DropdownMenuRadioItem value="system"><Monitor size={15}/> System</DropdownMenuRadioItem></DropdownMenuRadioGroup></DropdownMenuContent></DropdownMenu>;
}
