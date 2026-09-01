import tls from "node:tls";

type SmtpConfig = {
  host: string;
  port: number;
  username: string;
  password: string;
  from: string;
};

function config(): SmtpConfig | null {
  const host = process.env.SMTP_HOST;
  const username = process.env.SMTP_USER;
  const password = process.env.SMTP_PASSWORD;
  if (!host || !username || !password) return null;
  return {
    host,
    port: Number(process.env.SMTP_PORT || 465),
    username,
    password,
    from: process.env.SMTP_FROM || username,
  };
}

function quoted(value: string): string {
  return `<${value.replace(/[<>\r\n]/g, "")}>`;
}

function escapeHeader(value: string): string {
  return value.replace(/[\r\n]/g, " ");
}

function readResponse(socket: tls.TLSSocket): Promise<string> {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString("utf8");
      const lines = buffer.split("\r\n");
      const last = lines.at(-2) || "";
      if (/^\d{3} /.test(last)) {
        cleanup();
        resolve(buffer);
      }
    };
    const onError = (error: Error) => { cleanup(); reject(error); };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("error", onError);
    };
    socket.on("data", onData);
    socket.once("error", onError);
  });
}

async function command(socket: tls.TLSSocket, value: string, expected: number[] = [250]): Promise<void> {
  socket.write(`${value}\r\n`);
  const response = await readResponse(socket);
  const status = Number(response.slice(0, 3));
  if (!expected.includes(status)) throw new Error(`SMTP command failed (${status})`);
}

/** Sends a one-time password email over implicit TLS SMTP (normally port 465). */
export async function sendCredentialsEmail(input: {
  to: string;
  username: string;
  password: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const smtp = config();
  if (!smtp) return { sent: false, reason: "SMTP is not configured" };

  const socket = tls.connect({ host: smtp.host, port: smtp.port, servername: smtp.host, timeout: 15000 });
  try {
    await new Promise<void>((resolve, reject) => {
      socket.once("secureConnect", resolve);
      socket.once("error", reject);
      socket.once("timeout", () => reject(new Error("SMTP connection timed out")));
    });
    await readResponse(socket);
    await command(socket, `EHLO ${escapeHeader(process.env.SMTP_EHLO || "dynamic")}`);
    await command(socket, "AUTH LOGIN", [334]);
    await command(socket, Buffer.from(smtp.username).toString("base64"), [334]);
    await command(socket, Buffer.from(smtp.password).toString("base64"));
    await command(socket, `MAIL FROM:${quoted(smtp.from)}`);
    await command(socket, `RCPT TO:${quoted(input.to)}`);
    await command(socket, "DATA", [354]);
    const body = [
      `From: DYNAMIC <${escapeHeader(smtp.from)}>`,
      `To: ${escapeHeader(input.to)}`,
      "Subject: Your DYNAMIC login credentials",
      "MIME-Version: 1.0",
      "Content-Type: text/plain; charset=UTF-8",
      "",
      "Your DYNAMIC account is ready.",
      "",
      `User ID: ${input.username}`,
      `Temporary password: ${input.password}`,
      "",
      "This password is for your first login only. Change it immediately after signing in.",
      "Please do not forward this email.",
      "",
      ".",
    ].join("\r\n").replace(/^\./gm, "..") + "\r\n";
    socket.write(body);
    const response = await readResponse(socket);
    if (Number(response.slice(0, 3)) !== 250) throw new Error("SMTP message was not accepted");
    await command(socket, "QUIT", [221]);
    return { sent: true };
  } finally {
    socket.end();
  }
}
