import type { Metadata } from "next";
import { IBM_Plex_Mono } from "next/font/google";
import { ThemeProvider } from "next-themes";
import { PwaServiceWorker } from "@/components/pwa-service-worker";
import { CollaborationPageFollow } from "@/components/workflow/collaboration-page-follow";
import { RemoteReleaseConditionDrag } from "@/components/workflow/remote-release-condition-drag";
import "./globals.css";

const industrial = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-industrial",
  display: "swap",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "Falcon Process Building System",
  description: "Industrial workflow modeling and gate governance",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className={industrial.variable}><ThemeProvider attribute="class" defaultTheme="dark">{children}<CollaborationPageFollow /><RemoteReleaseConditionDrag /></ThemeProvider><PwaServiceWorker /></body></html>;
}
