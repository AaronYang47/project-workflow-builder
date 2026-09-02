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
  title: "Falcon Workflow System",
  description: "Industrial workflow modeling and gate governance",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en" suppressHydrationWarning><body className={industrial.variable}><ThemeProvider attribute="class" defaultTheme="dark">{children}</ThemeProvider></body></html>;
}
