import net from "net";
import tls from "tls";
import dns from "dns/promises";
import type { VerifyStatus } from "./types";

const EHLO_NAMES = ["verify-mail.net", "mx-check.org", "smtp-probe.com", "mailtest.io"];
const SENDER_DOMAIN = "verify-resolution.com";

function randomEhlo(): string {
  return EHLO_NAMES[Math.floor(Math.random() * EHLO_NAMES.length)];
}

function randomSender(domain: string): string {
  const names = ["user", "verify", "check", "probe", "mail", "inbox"];
  const name = names[Math.floor(Math.random() * names.length)];
  const num = Math.floor(Math.random() * 90000 + 10000);
  return `${name}${num}@${domain}`;
}

interface SmtpOutcome {
  ok: boolean;
  code: number;
  msg: string;
  blocked: boolean;
}

interface AttemptConfig {
  port: number;
  mode: "plain" | "starttls" | "tls";
}

function classify(text: string, code: number): Pick<SmtpOutcome, "blocked"> {
  const msg = (text || "").toLowerCase();
  const blocked =
    msg.includes("permanently deferred") ||
    msg.includes("deferred") ||
    msg.includes("tss0") ||
    msg.includes("tss09") ||
    msg.includes("postmaster.yahoo") ||
    msg.includes("all messages from") ||
    msg.includes("blocked") ||
    msg.includes("policy") ||
    msg.includes("5.7") ||
    msg.includes("security") ||
    msg.includes("harvest") ||
    msg.includes("not allowed") ||
    msg.includes("your ip") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("spam") ||
    msg.includes("blacklist") ||
    msg.includes("verify email") ||
    (code === 553 && msg.includes("from"));
  return { blocked };
}

function rawSmtpCheck(
  host: string,
  port: number,
  email: string,
  ehlo: string,
  cfg: AttemptConfig
): Promise<SmtpOutcome> {
  return new Promise((resolve) => {
    let socket: net.Socket | tls.TLSSocket | null = null;
    let buffer = "";
    let step = 0;
    let finished = false;
    let upgraded = false;
    let lastLines = "";
    let tHandle: NodeJS.Timeout | null = null;
    let gHandle: NodeJS.Timeout | null = null;

    const finish = (out: SmtpOutcome) => {
      if (finished) return;
      finished = true;
      if (tHandle) clearTimeout(tHandle);
      if (gHandle) clearTimeout(gHandle);
      try { socket?.destroy(); } catch {}
      resolve(out);
    };

    tHandle = setTimeout(() => {
      finish({ ok: false, code: 0, msg: "timeout", blocked: false });
    }, 9000);

    gHandle = setTimeout(() => {
      finish({ ok: false, code: 0, msg: "silent-drop", blocked: false });
    }, 3000);

    const onData = (data: Buffer | string) => {
      if (gHandle) {
        clearTimeout(gHandle);
        gHandle = null;
      }
      buffer += data.toString("utf8");
      const lines = buffer.split(/\r?\n/);
      buffer = lines.pop() as string;

      for (const line of lines) {
        if (line.trim() === "" || line.trim() === "\0") continue;
        const code = parseInt(line.slice(0, 3), 10);
        const isFinal = line.length < 3 || line[3] === " " || line[3] === "";
        if (!isFinal) continue;

        if (step === 0) {
          if (!socket) return;
          socket.write(`EHLO ${ehlo}\r\n`);
          step = 1;
        } else if (step === 1) {
          lastLines += line + "\n";
          if (cfg.mode === "starttls" && !upgraded && /starttls/i.test(lastLines)) {
            if (!socket) return;
            socket.write("STARTTLS\r\n");
            step = 2;
            lastLines = "";
          } else {
            doMailFrom();
          }
        } else if (step === 2) {
          if (code === 220) {
            if (!socket) return;
            const rawSocket = socket as net.Socket;
            rawSocket.removeAllListeners("data");
            buffer = "";
            const tlsSocket = new tls.TLSSocket(rawSocket, {
              rejectUnauthorized: false,
            });
            socket = tlsSocket;
            upgraded = true;
            tlsSocket.write(`EHLO ${ehlo}\r\n`);
            lastLines = "";
            tlsSocket.on("data", onData);
            step = 1;
          } else {
            finish({ ok: false, code, msg: line, blocked: false });
          }
        } else if (step === 3) {
          doRcptTo();
        } else if (step === 4) {
          const { blocked } = classify(line, code);
          if (socket) socket.write("QUIT\r\n");
          finish({ ok: code >= 200 && code < 300, code, msg: line, blocked });
          return;
        }
      }
    };

    function doMailFrom() {
      if (!socket) return;
      const senderDomain = email.split("@")[1] || SENDER_DOMAIN;
      socket.write(`MAIL FROM:<${randomSender(senderDomain)}>\r\n`);
      step = 3;
    }

    function doRcptTo() {
      if (!socket) return;
      socket.write(`RCPT TO:<${email}>\r\n`);
      step = 4;
    }

    if (cfg.mode === "tls") {
      try {
        socket = tls.connect({
          host,
          port,
          rejectUnauthorized: false,
          servername: host,
        });
      } catch {
        finish({ ok: false, code: 0, msg: "tls connect error", blocked: false });
        return;
      }
    } else {
      socket = net.createConnection({ host, port });
    }

    socket.setTimeout(9000);
    socket.on("data", onData);

    socket.on("timeout", () => {
      finish({ ok: false, code: 0, msg: "socket timeout", blocked: false });
    });

    socket.on("error", (err: any) => {
      finish({ ok: false, code: 0, msg: (err.message || "error").toLowerCase(), blocked: false });
    });
  });
}

async function getAllMxHosts(domain: string): Promise<string[]> {
  try {
    const mx = await dns.resolveMx(domain);
    return mx
      .filter((r) => r.exchange && r.exchange.trim() !== "")
      .sort((a, b) => a.priority - b.priority)
      .map((r) => r.exchange.replace(/\.$/, ""));
  } catch {
    return [];
  }
}

function evaluateResult(result: SmtpOutcome): "VALID" | "INVALID" | "RETRY" | "CONTINUE" {
  const code = result.code;
  const msg = result.msg.toLowerCase();

  if (result.ok) return "VALID";
  if (result.blocked) return "CONTINUE";

  if (
    code === 550 || code === 553 || code === 501 || code === 504 ||
    code === 554 || code === 551 ||
    msg.includes("does not exist") || msg.includes("unknown user") ||
    msg.includes("no such user") || msg.includes("mailbox unavailable") ||
    msg.includes("recipient rejected") || msg.includes("account that you tried") ||
    msg.includes("mailbox not found") || msg.includes("no user") ||
    msg.includes("not exist") || msg.includes("address is invalid") ||
    msg.includes("no such recipient") || msg.includes("rejected")
  ) {
    return "INVALID";
  }

  if (
    (code >= 421 && code <= 459) ||
    (code >= 471 && code <= 479) ||
    msg.includes("greylist") || msg.includes("try again later") ||
    msg.includes("too many") || msg.includes("rate limited") ||
    msg.includes("throttl") || msg.includes("temporarily")
  ) {
    return "RETRY";
  }

  return "CONTINUE";
}

export interface SmtpVerifyResult {
  status: VerifyStatus;
  attempt?: { host: string; cfg: AttemptConfig };
}

export async function verifySmtp(
  email: string,
  mxHost: string
): Promise<SmtpVerifyResult> {
  const domain = email.split("@")[1]?.toLowerCase() || "";
  const allMx = await getAllMxHosts(domain);
  const hosts = [mxHost, ...allMx.filter((h) => h !== mxHost)]
    .filter((h): h is string => typeof h === "string" && h.length > 0)
    .slice(0, 2);
  const start = Date.now();
  const BUDGET_MS = 25000;

  let retryable: { host: string; cfg: AttemptConfig } | null = null;
  let winning: { host: string; cfg: AttemptConfig } | null = null;
  let blockedCount = 0;
  let silentCount = 0;
  const totalHosts = hosts.length;

  for (const h of hosts) {
    let hostSilent = false;
    const cfgs: AttemptConfig[] = [
      { port: 25, mode: "plain" },
      { port: 25, mode: "starttls" },
      { port: 587, mode: "starttls" },
    ];
    if (typeof h === "string" && h === hosts[0]) cfgs.push({ port: 465, mode: "tls" });

    for (const cfg of cfgs) {
      if (Date.now() - start > BUDGET_MS) break;
      if (hostSilent) break;

      const ehlo = Math.random() > 0.5 ? domain : randomEhlo();
      const result = await rawSmtpCheck(h, cfg.port, email, ehlo, cfg);

      if (result.code === 0) {
        const silent = result.msg === "silent-drop" || result.msg === "timeout" || result.msg === "socket timeout";
        if (silent && cfg.port === 25 && cfg.mode === "plain") {
          hostSilent = true;
          silentCount++;
        }
      }

      const evalRes = evaluateResult(result);
      if (evalRes === "VALID") {
        winning = { host: h, cfg };
        return { status: "VALID", attempt: winning };
      }
      if (evalRes === "INVALID") return { status: "INVALID" };
      if (evalRes === "RETRY") {
        if (!retryable) retryable = { host: h, cfg };
      } else if (evalRes === "CONTINUE" && result.blocked) {
        blockedCount++;
        if (blockedCount >= 3) break;
      }
    }

    if (silentCount >= totalHosts) break;
  }

  if (retryable && Date.now() - start < BUDGET_MS - 8000) {
    await new Promise((r) => setTimeout(r, 8000));
    if (Date.now() - start < BUDGET_MS) {
      const ehlo = Math.random() > 0.5 ? domain : randomEhlo();
      const result = await rawSmtpCheck(
        retryable.host,
        retryable.cfg.port,
        email,
        ehlo,
        retryable.cfg
      );
      const evalRes = evaluateResult(result);
      if (evalRes === "VALID") return { status: "VALID", attempt: retryable };
      if (evalRes === "INVALID") return { status: "INVALID" };
    }
  }

  return { status: "UNKNOWN", attempt: winning ?? undefined };
}

function randomFakeLocal(): string {
  const rnd = Date.now().toString(36) + Math.floor(Math.random() * 1e9).toString(36);
  return `no.such.user.${rnd}`;
}

export async function probeCatchAll(
  mxHost: string,
  domain: string,
  attempt?: { host: string; cfg: AttemptConfig }
): Promise<boolean> {
  const probe = async (): Promise<boolean | "reject"> => {
    const fakeEmail = `${randomFakeLocal()}@${domain}`;
    const start = Date.now();
    const BUDGET_MS = 9000;

    const attempts: Array<{ host: string; cfg: AttemptConfig }> = attempt
      ? [attempt]
      : [
          { host: mxHost, cfg: { port: 25, mode: "plain" } },
          { host: mxHost, cfg: { port: 25, mode: "starttls" } },
          { host: mxHost, cfg: { port: 587, mode: "starttls" } },
          { host: mxHost, cfg: { port: 465, mode: "tls" } },
        ];

    for (const { host, cfg } of attempts) {
      if (Date.now() - start > BUDGET_MS) break;
      const result = await rawSmtpCheck(host, cfg.port, fakeEmail, randomEhlo(), cfg);
      if (result.ok) return true;
      if (
        result.code === 550 || result.code === 553 || result.code === 501 ||
        result.code === 551 || result.code === 554 || result.code === 507 ||
        result.msg.includes("does not exist") || result.msg.includes("unknown user") ||
        result.msg.includes("no such user") || result.msg.includes("not exist") ||
        result.msg.includes("mailbox unavailable") || result.msg.includes("recipient rejected")
      ) {
        return "reject";
      }
    }
    return false;
  };

  const first = await probe();
  if (first === "reject") return false;
  if (first !== true) return false;
  const second = await probe();
  return second === true;
}