"use client";

import { useEffect } from "react";
import { startActivityTracking } from "@/lib/activity-tracker";

/** Starts reporting activity to the audit log once per page load. */
export function ActivityTracker() {
  useEffect(() => {
    startActivityTracking();
  }, []);

  return null;
}
