import {
  LayoutDashboard,
  Mail,
  UploadCloud,
  History,
  Table2,
  Settings,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

export const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/single-check", label: "Single Email Check", icon: Mail },
  { href: "/bulk", label: "Bulk Verification", icon: UploadCloud },
  { href: "/history", label: "Verification History", icon: History },
  { href: "/results", label: "Results", icon: Table2 },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function pageTitle(pathname: string): string {
  const item = NAV_ITEMS.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
  return item?.label ?? "MailCheck";
}
