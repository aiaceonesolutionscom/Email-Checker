import { NextResponse } from "next/server";

const SESSION_COOKIE = "ev_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8 hours
const REMEMBER_MAX_AGE = 60 * 60 * 24 * 30; // 30 days

function demoUser() {
  return process.env.DEMO_USER || "admin";
}
function demoPass() {
  return process.env.DEMO_PASS || "admin123";
}

export async function POST(req: Request) {
  let body: { username?: string; password?: string; remember?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const username = (body.username ?? "").trim();
  const password = body.password ?? "";

  if (!username || !password) {
    return NextResponse.json({ error: "Username and password are required." }, { status: 400 });
  }

  if (username.toLowerCase() !== demoUser().toLowerCase() || password !== demoPass()) {
    return NextResponse.json({ error: "Invalid username or password." }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "1", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: body.remember ? REMEMBER_MAX_AGE : SESSION_MAX_AGE,
  });
  return res;
}
