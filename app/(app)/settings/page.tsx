"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { LogOut, User, Shield, Sliders } from "lucide-react";
import { Card, CardHeader } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";

const PREFS_KEY = "ev.prefs.v1";

interface Prefs {
  showAdvancedColumns: boolean;
  compactTables: boolean;
  autoRedirectAfterBulk: boolean;
}

const DEFAULT_PREFS: Prefs = {
  showAdvancedColumns: false,
  compactTables: false,
  autoRedirectAfterBulk: true,
};

function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-3">
      <div>
        <p className="text-sm font-medium text-slate-900">{label}</p>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        onClick={() => onChange(!checked)}
        className={
          "relative h-6 w-11 shrink-0 rounded-full transition " + (checked ? "bg-brand-600" : "bg-slate-300")
        }
      >
        <span
          className={
            "absolute top-0.5 h-5 w-5 rounded-full bg-white transition " + (checked ? "left-5" : "left-0.5")
          }
        />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(PREFS_KEY);
      if (raw) setPrefs({ ...DEFAULT_PREFS, ...JSON.parse(raw) });
    } catch {
      // ignore malformed prefs
    }
    setLoaded(true);
  }, []);

  useEffect(() => {
    if (!loaded) return;
    try {
      window.localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore quota errors — preferences are non-critical
    }
  }, [prefs, loaded]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Settings</h1>
        <p className="mt-1 text-sm text-slate-500">Manage your account and preferences.</p>
      </div>

      <Card>
        <CardHeader title="Account Information" subtitle="Demo session details" action={<User size={16} className="text-slate-500" />} />
        <div className="space-y-3 p-5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-500">Username</span>
            <span className="font-medium text-slate-900">admin</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Email</span>
            <span className="font-medium text-slate-900">admin@mailcheck.demo</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Plan</span>
            <span className="font-medium text-slate-900">Demo</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader title="Verification Preferences" subtitle="Display defaults for verification screens" action={<Shield size={16} className="text-slate-500" />} />
        <div className="divide-y divide-slate-200 px-5">
          <Toggle
            label="Show advanced columns by default"
            description="Display syntax, disposable, role and reason columns without toggling."
            checked={prefs.showAdvancedColumns}
            onChange={(v) => setPrefs((p) => ({ ...p, showAdvancedColumns: v }))}
          />
          <Toggle
            label="Jump to results after bulk verification"
            description="Automatically show the results table when a bulk job finishes."
            checked={prefs.autoRedirectAfterBulk}
            onChange={(v) => setPrefs((p) => ({ ...p, autoRedirectAfterBulk: v }))}
          />
        </div>
      </Card>

      <Card>
        <CardHeader title="UI Preferences" subtitle="Personalize how tables are displayed" action={<Sliders size={16} className="text-slate-500" />} />
        <div className="divide-y divide-slate-200 px-5">
          <Toggle
            label="Compact tables"
            description="Reduce row height in data tables to fit more rows on screen."
            checked={prefs.compactTables}
            onChange={(v) => setPrefs((p) => ({ ...p, compactTables: v }))}
          />
        </div>
      </Card>

      <Button variant="danger" onClick={logout}>
        <LogOut size={15} /> Logout
      </Button>
    </div>
  );
}
