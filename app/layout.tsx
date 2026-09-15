import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Email Validator — Free CSV/XLSX Email Verification",
  description:
    "Upload a CSV or Excel file and verify thousands of emails for free. Check syntax, disposable domains, MX records and SMTP mailbox existence.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}