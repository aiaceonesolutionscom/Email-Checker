"use client";

import { useState } from "react";
import { Mail, Search, AlertCircle } from "lucide-react";
import { useSingleVerification } from "@/lib/hooks/useSingleVerification";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { ResultCard } from "@/components/single/ResultCard";

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function SingleCheckPage() {
  const [email, setEmail] = useState("");
  const [fieldError, setFieldError] = useState("");
  const { state, result, error, check, reset } = useSingleVerification();

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed) {
      setFieldError("Please enter an email address.");
      return;
    }
    if (!EMAIL_PATTERN.test(trimmed)) {
      setFieldError("Please enter a valid email address format.");
      return;
    }
    setFieldError("");
    check(trimmed);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">Single Email Check</h1>
        <p className="mt-1 text-sm text-slate-500">
          Verify one email address instantly — syntax, domain, MX and SMTP mailbox checks.
        </p>
      </div>

      <Card className="p-5 sm:p-6">
        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1">
            <div className="relative">
              <Mail size={16} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                type="text"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="info@example.com"
                className="w-full rounded-lg border border-slate-300 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-900 placeholder-slate-500 outline-none focus:border-brand-500"
              />
            </div>
            {fieldError && (
              <p className="mt-1.5 flex items-center gap-1 text-xs text-danger">
                <AlertCircle size={12} /> {fieldError}
              </p>
            )}
          </div>
          <Button type="submit" loading={state === "checking"} className="sm:w-auto">
            <Search size={15} /> Verify Email
          </Button>
        </form>
      </Card>

      {error && (
        <div className="rounded-lg border border-danger-border bg-danger-subtle px-4 py-3 text-sm text-danger">
          {error}
        </div>
      )}

      {result && (
        <div className="space-y-3">
          <ResultCard result={result} />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              reset();
              setEmail("");
            }}
          >
            Check another email
          </Button>
        </div>
      )}
    </div>
  );
}
