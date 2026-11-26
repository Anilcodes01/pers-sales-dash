import type { Metadata } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/components/theme-provider";

export const metadata: Metadata = {
  title: "Persevex | Technology & Management Courses",
  description: "Explore technology and management courses from Persevex. Contact our team for program details, registration, and course access.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <html lang="en" suppressHydrationWarning><body><ThemeProvider>{children}<Toaster position="top-right" richColors closeButton/></ThemeProvider></body></html>;
}
