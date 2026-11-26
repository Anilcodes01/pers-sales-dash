import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Collective | Sales & Recovery",
  description: "One connected workspace for sales, recovery, and your team.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider>{children}<Toaster position="top-right" richColors closeButton/></ThemeProvider></body></html>;
}
