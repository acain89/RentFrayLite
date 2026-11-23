"use client";
import { useEffect } from "react";
import { verifyDeviceNotifications } from "@/lib/managerPushDevice";
// Reconnect an existing, enabled device after login. Never enroll or prompt here.
export default function ManagerPushSessionSync() {
  useEffect(() => { void verifyDeviceNotifications().catch(() => {}); }, []);
  return null;
}
