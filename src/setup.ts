import type { Config, Connection, Account } from "./types";
export function detectedConfig(
  config: Config,
  connections: Connection[],
): Config {
  const next = { ...config, accounts: [...config.accounts] };
  const active = connections.filter((c) => c.status === "ACTIVE");
  const sheets = active.filter((c) => c.service === "google");
  const mail = active.filter((c) => c.service === "gmail");
  if (!active.some((c) => c.id === next.google) && sheets.length === 1)
    next.google = sheets[0].id;
  const google = active.find((c) => c.id === next.google);
  const matching = mail.filter(
    (c) =>
      c.identity && c.identity.toLowerCase() === google?.identity.toLowerCase(),
  );
  if (!active.some((c) => c.id === next.gmail)) {
    if (matching.length === 1) next.gmail = matching[0].id;
    else if (
      mail.length === 1 &&
      (!google?.identity ||
        !mail[0].identity ||
        mail[0].identity.toLowerCase() === google.identity.toLowerCase())
    )
      next.gmail = mail[0].id;
  }
  if (google?.identity.includes("@")) next.botEmail = google.identity;
  const bots = active.filter((c) => c.service === "telegram");
  if (!active.some((c) => c.id === next.telegram) && bots.length === 1)
    next.telegram = bots[0].id;
  return next;
}
export function newPinterestAccount(connection: Connection): Account {
  const username = connection.identity.replace(/^@/, "");
  return {
    id: crypto.randomUUID(),
    name: username,
    username,
    connection: connection.id,
    niche: "",
    general: true,
    category: /crochet|knit/i.test(username) ? "crochet" : "other",
    source: "niche",
    website: "",
    pinsPerProduct: 3,
    pinsPerDay: 3,
    schedule: {
      mode: "varied",
      start: "09:00",
      end: "21:00",
      minSpacing: 120,
      times: [],
    },
    hours: [9, 15, 21],
    on: true,
  };
}
export function connectionsReady(
  config: Config,
  connections: Connection[],
  botReady: boolean,
) {
  const active = (id: string, service: string) =>
    connections.some(
      (c) => c.id === id && c.service === service && c.status === "ACTIVE",
    );
  const google = connections.find((c) => c.id === config.google),
    gmail = connections.find((c) => c.id === config.gmail);
  return Boolean(
    (config.notifyEmail || config.notifyTelegram) &&
    active(config.google, "google") &&
    (!config.notifyEmail ||
      (active(config.gmail, "gmail") &&
        config.emailTo &&
        (!google?.identity ||
          !gmail?.identity ||
          google.identity.toLowerCase() === gmail.identity.toLowerCase()))) &&
    (!config.notifyTelegram ||
      (active(config.telegram, "telegram") && botReady)) &&
    config.accounts.length &&
    config.accounts.every((a) => active(a.connection, "pinterest")),
  );
}
