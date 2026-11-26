import type { Metadata } from "next";
import { SalesApp } from "@/components/sales/sales-app";

export const metadata: Metadata = {
  title: "PROFAB Qualification · Sales",
  description: "Fill in the Qualification Form [1.01] for a project.",
};

export default function SalesPage() {
  return <SalesApp />;
}
