import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import "./globals.css";

const industrial = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-industrial",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Project Workflow Builder",
  description: "A professional visual workflow modeling environment",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className={industrial.variable}><ThemeProvider attribute="class" defaultTheme="light">{children}</ThemeProvider></body></html>;
}
