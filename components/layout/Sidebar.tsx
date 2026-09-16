"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { MailCheck, LogOut, X } from "lucide-react";
import { NAV_ITEMS } from "./nav";

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-1 flex-col gap-1 px-3">
      {NAV_ITEMS.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition " +
              (active
                ? "bg-brand-600 text-white"
                : "text-slate-500 hover:bg-slate-100 hover:text-slate-900")
            }
          >
            <Icon size={17} />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Brand() {
  return (
    <div className="flex items-center gap-2 px-5 py-5">
      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-white">
        <MailCheck size={18} />
      </div>
      <span className="text-base font-bold tracking-tight text-slate-900">MailCheck</span>
    </div>
  );
}

function LogoutButton() {
  const router = useRouter();
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-900"
    >
      <LogOut size={17} />
      Logout
    </button>
  );
}

export function Sidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white lg:flex">
      <Brand />
      <NavLinks />
      <div className="border-t border-slate-200 px-3 py-3">
        <LogoutButton />
      </div>
    </aside>
  );
}

export function MobileSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 flex lg:hidden">
      <div className="fixed inset-0 bg-slate-900/50" onClick={onClose} />
      <aside className="relative flex w-72 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center justify-between px-2">
          <Brand />
          <button
            onClick={onClose}
            aria-label="Close menu"
            className="mr-3 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-900"
          >
            <X size={18} />
          </button>
        </div>
        <NavLinks onNavigate={onClose} />
        <div className="border-t border-slate-200 px-3 py-3">
          <LogoutButton />
        </div>
      </aside>
    </div>
  );
}
