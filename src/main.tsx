import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  Plus,
  Search,
  X,
} from "lucide-react";
import "@fontsource-variable/geist";
import "@fontsource-variable/geist-mono";
import "./styles.css";
import { api, ApiError, setCSRF } from "./api";
import { References } from "./references";
import { translate, type Message } from "./i18n";
import type {
  Account,
  Automation,
  Config,
  Connection,
  Language,
  User,
} from "./types";
import { spreadHours } from "../engine/panel/generator.js";

type Workspace = {
  user: User;
  language: Language;
  t: (key: Message) => string;
  notify: (message: string) => void;
  reload: () => Promise<void>;
};
const WorkspaceContext = createContext<Workspace>(null!);
const useWorkspace = () => useContext(WorkspaceContext);
function Mark() {
  return (
    <svg
      aria-hidden="true"
      width="30"
      height="30"
      viewBox="0 0 32 32"
      fill="none"
    >
      <path
        d="M7 10a10 10 0 0 1 17-2M25 22a10 10 0 0 1-17 2M24 3v6h-6M8 29v-6h6"
        stroke="currentColor"
        strokeWidth="2.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function External({
  href,
  children,
  className = "button",
}: {
  href: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <a
      className={className}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
      <ExternalLink size={15} />
    </a>
  );
}
function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}
function Notice({ children }: { children: React.ReactNode }) {
  return (
    <div className="notice" role="status">
      {children}
    </div>
  );
}
function Empty({
  title,
  children,
}: {
  title: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-mark">
        <Mark />
      </div>
      <h2>{title}</h2>
      {children}
    </div>
  );
}
function Status({ status }: { status: string }) {
  const { t } = useWorkspace();
  const key: Message = [
    "draft",
    "running",
    "paused",
    "starting",
    "applying",
  ].includes(status)
    ? (status as Message)
    : "problem";
  return (
    <span className={`status ${status}`}>
      <i />
      {t(key)}
    </span>
  );
}
function ErrorBox({ error, retry }: { error: unknown; retry?: () => void }) {
  const { language, t } = useWorkspace();
  const { id } = useParams();
  return (
    <div className="error" role="alert">
      {language === "en" && error instanceof Error ? error.message : t("error")}
      {error instanceof ApiError && error.code === "sign_in" ? (
        <a className="button" href="/auth/start">
          {t("signIn")}
        </a>
      ) : error instanceof ApiError && error.code === "reconnect" && id ? (
        <Link className="button" to={`/automations/${id}/setup?reconnect=1`}>
          {t("connect")}
        </Link>
      ) : (
        retry && <button onClick={retry}>{t("retry")}</button>
      )}
    </div>
  );
}
function Modal({
  title,
  open,
  onOpenChange,
  children,
}: {
  title: string;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  children: React.ReactNode;
}) {
  const { t } = useWorkspace();
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="overlay" />
        <Dialog.Content className="dialog">
          <div className="dialog-head">
            <Dialog.Title>{title}</Dialog.Title>
            <Dialog.Close aria-label={t("cancel")}>
              <X size={20} />
            </Dialog.Close>
          </div>
          <Dialog.Description asChild>
            <div className="sr-only">{title}</div>
          </Dialog.Description>
          <div className="dialog-body">{children}</div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
function App() {
  const [user, setUser] = useState<User | null>(null),
    [loading, setLoading] = useState(true),
    [language, setLanguage] = useState<Language>(() => {
      const v = localStorage.getItem("automation-language");
      return v === "fr" || v === "ar" ? v : "en";
    }),
    [theme, setTheme] = useState(
      () => localStorage.getItem("automation-theme") || "system",
    ),
    [toast, setToast] = useState(""),
    [local, setLocal] = useState(false),
    [error, setError] = useState<unknown>(null);
  const location = useLocation();
  const t = (key: Message) => translate(language, key);
  const reload = async () => {
    try {
      const result = await api("/api/me");
      setCSRF(result.csrf);
      setUser(result.user);
      setError(null);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) setUser(null);
      else setError(e);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    void reload();
    api("/api/environment")
      .then((e) => setLocal(e.local))
      .catch(() => {});
  }, []);
  useEffect(() => {
    document.documentElement.lang = language;
    document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    localStorage.setItem("automation-language", language);
  }, [language]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("automation-theme", theme);
  }, [theme]);
  useEffect(() => {
    window.scrollTo(0, 0);
    document.title = "Automation";
  }, [location.pathname]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(""), 5000);
    return () => clearTimeout(timer);
  }, [toast]);
  return (
    <WorkspaceContext.Provider
      value={{ user: user!, language, t, notify: setToast, reload }}
    >
      <header className="top">
        <Link to="/" className="brand" aria-label="Automation">
          <Mark />
          <span>Automation</span>
        </Link>
        <span className="slash">/</span>
        <Link to="/" className="workspace-name">
          {user ? user.name : t("automations")}
        </Link>
        <div className="top-actions">
          <select
            aria-label={t("language")}
            value={language}
            onChange={(e) => setLanguage(e.target.value as Language)}
          >
            <option value="en">English</option>
            <option value="fr">Français</option>
            <option value="ar">العربية</option>
          </select>
          <select
            aria-label={t("appearance")}
            value={theme}
            onChange={(e) => setTheme(e.target.value)}
          >
            {(["system", "light", "dark"] as const).map((v) => (
              <option key={v} value={v}>
                {t(v)}
              </option>
            ))}
          </select>
          {user && (
            <Link
              className="avatar"
              to="/account"
              title={t("accountTitle")}
              aria-label={t("accountTitle")}
            >
              {user.name[0]}
            </Link>
          )}
        </div>
      </header>
      {user && (
        <nav className="global-tabs">
          <NavLink to="/" end>
            {t("automations")}
          </NavLink>
          {user.admin && <NavLink to="/members">{t("admin")}</NavLink>}
        </nav>
      )}
      {loading ? (
        <main>
          <Empty title={t("loading")} />
        </main>
      ) : error ? (
        <main>
          <ErrorBox error={error} retry={() => void reload()} />
        </main>
      ) : location.pathname === "/privacy" ? (
        <main className="readable">
          <h1>{t("privacy")}</h1>
          <p>{t("privacyText")}</p>
          <Link className="button" to="/">
            {t("back")}
          </Link>
        </main>
      ) : !user ? (
        <main className="welcome">
          <div className="welcome-mark">
            <Mark />
          </div>
          <h1>{t("welcome")}</h1>
          <p>{t("welcomeCopy")}</p>
          {location.search.includes("signin=") && (
            <div className="error" role="alert">
              {t(
                location.search.includes("access_denied")
                  ? "accessDenied"
                  : "signInError",
              )}
            </div>
          )}
          <a className="button primary" href="/auth/start">
            <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
              <path
                fill="currentColor"
                d="M21.6 12.2c0-.7-.1-1.5-.2-2.2H12v4.3h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.8 3-4.3 3-7.6ZM12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5a6 6 0 0 1-9-3H3.1v2.6A10 10 0 0 0 12 22ZM6.4 14a6 6 0 0 1 0-4V7.3H3.1a10 10 0 0 0 0 9.4L6.4 14ZM12 6c1.5 0 2.9.5 4 1.6l3-3A10 10 0 0 0 3.1 7.3L6.4 10A6 6 0 0 1 12 6Z"
              />
            </svg>
            {t("signIn")}
          </a>
          <Link className="text-link" to="/privacy">
            {t("privacy")}
          </Link>
          {local && (
            <details className="local-login">
              <summary>{t("localLogin")}</summary>
              {["owner", "member-a", "member-b"].map((account) => (
                <button
                  key={account}
                  onClick={async () => {
                    await api("/auth/dev", "POST", { account });
                    await reload();
                  }}
                >
                  {account === "owner"
                    ? t("owner")
                    : t("testMember") + " " + account.slice(-1)}
                </button>
              ))}
            </details>
          )}
        </main>
      ) : (
        <Routes>
          <Route path="/" element={<Home />} />
          <Route
            path="/automations/:id/*"
            element={<AutomationPage key={location.pathname.split("/")[2]} />}
          />
          <Route path="/members" element={<Members />} />
          <Route path="/account" element={<WebsiteAccount />} />
          <Route
            path="*"
            element={
              <main>
                <Link to="/">{t("all")}</Link>
              </main>
            }
          />
        </Routes>
      )}
      <footer>
        <Link to="/privacy">{t("privacy")}</Link>
        <span>Automation</span>
      </footer>
      {toast && (
        <div className="toast" role="status">
          <Check size={18} />
          {toast}
          <button aria-label={t("cancel")} onClick={() => setToast("")}>
            <X size={16} />
          </button>
        </div>
      )}
    </WorkspaceContext.Provider>
  );
}
function WebsiteAccount() {
  const { user, t, reload } = useWorkspace();
  const [error, setError] = useState<unknown>(null),
    [deleting, setDeleting] = useState(false),
    [busy, setBusy] = useState(false);
  return (
    <main className="readable">
      <Link className="back-link" to="/">
        <ArrowLeft size={15} />
        {t("all")}
      </Link>
      <h1>{t("accountTitle")}</h1>
      <section className="panel history-section">
        <h2>{user.name}</h2>
        <p>
          <bdi>{user.email}</bdi>
        </p>
        {error != null && <ErrorBox error={error} />}
        <div className="button-row">
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/logout", "POST", {});
                await reload();
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("signOut")}
          </button>
          {!user.admin && (
            <button className="danger" onClick={() => setDeleting(true)}>
              {t("deleteAccount")}
            </button>
          )}
        </div>
      </section>
      <Modal
        title={t("deleteAccount")}
        open={deleting}
        onOpenChange={setDeleting}
      >
        <p>{t("deleteConfirm")}</p>
        <div className="button-row">
          <button onClick={() => setDeleting(false)}>{t("cancel")}</button>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await api("/api/me", "DELETE", { confirm: true });
                await reload();
              } catch (e) {
                setError(e);
                setDeleting(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t("deleteAccount")}
          </button>
        </div>
      </Modal>
    </main>
  );
}
function Home() {
  const { t } = useWorkspace();
  const [items, setItems] = useState<Automation[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<unknown>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const load = () => {
    api("/api/automations")
      .then((r) => {
        setItems(r.automations);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const creationId = useRef(crypto.randomUUID());
  const create = async () => {
    setBusy(true);
    try {
      const r = await api("/api/automations", "POST", {
        name: t("automation"),
        requestId: creationId.current,
      });
      navigate(`/automations/${r.automation.id}/setup`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const filtered = items.filter((a) =>
    (a.name + " " + (a.config.accounts || []).map((a) => a.username).join(" "))
      .toLowerCase()
      .includes(query.toLowerCase()),
  );
  return (
    <main>
      <div className="page-heading">
        <div>
          <h1>{t("automations")}</h1>
        </div>
        <button className="primary" onClick={create} disabled={busy}>
          <Plus size={18} />
          {t("create")}
        </button>
      </div>
      {error != null && <ErrorBox error={error} retry={load} />}
      {loading ? (
        <Empty title={t("loading")} />
      ) : !items.length ? (
        <Empty title={t("empty")}>
          <p>{t("emptyCopy")}</p>
          <button className="primary" onClick={create} disabled={busy}>
            <Plus size={18} />
            {t("create")}
          </button>
        </Empty>
      ) : (
        <>
          <label className="search">
            <Search size={18} />
            <input
              aria-label={t("search")}
              placeholder={t("search")}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="grid">
            {filtered.map((a) => (
              <article className="automation-card" key={a.id}>
                <div className="card-main">
                  <span className="eyebrow">{t("automation")}</span>
                  <Link
                    to={`/automations/${a.id}/${a.status === "draft" ? "setup" : "summary"}`}
                  >
                    <h2>
                      {a.name}
                      <ChevronRight size={18} />
                    </h2>
                  </Link>
                  <Status status={a.status} />
                  <div className="profile-list">
                    <span>
                      {t("accounts")} · {a.config.accounts?.length || 0}
                    </span>
                    {(a.config.accounts || []).map((account) => (
                      <div key={account.id}>
                        <span className="pinterest-mark">P</span>
                        <bdi>@{account.username}</bdi>
                      </div>
                    ))}
                  </div>
                </div>
                <Link
                  className="card-action"
                  to={`/automations/${a.id}/accounts?add=1`}
                >
                  <Plus size={16} />
                  {t("addAccount")}
                </Link>
              </article>
            ))}
          </div>
          {!filtered.length && <Empty title={t("noResults")} />}
        </>
      )}
    </main>
  );
}
const defaults = (user: User): Config => ({
  emailTo: user.email,
  botEmail: "",
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  reportHour: 22,
  notifyEmail: true,
  notifyTelegram: false,
  emailEveryPin: false,
  lowQueue: 10,
  google: "",
  gmail: "",
  telegram: "",
  accounts: [],
});
function AutomationPage() {
  const { id } = useParams(),
    location = useLocation();
  const { user, t } = useWorkspace();
  const [automation, setAutomation] = useState<Automation | null>(null),
    [draft, setDraft] = useState<Config>(defaults(user)),
    [error, setError] = useState<unknown>(null),
    [saving, setSaving] = useState(false),
    [saveError, setSaveError] = useState<unknown>(null),
    [connections, setConnections] = useState<Connection[]>([]),
    [connectionsUrl, setConnectionsUrl] = useState(
      "https://cloud.activepieces.com/",
    ),
    [busy, setBusy] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pending = useRef<Config | null>(null),
    inFlight = useRef<Promise<void> | null>(null),
    current = useRef<Automation | null>(null);
  const load = async () => {
    try {
      const r = await api(`/api/automations/${id}`);
      setAutomation(r.automation);
      current.current = r.automation;
      setDraft({ ...defaults(user), ...r.automation.config });
      setError(null);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    void load();
    return () => clearTimeout(timer.current);
  }, [id]);
  const flush = async (): Promise<void> => {
    clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (!pending.current || !current.current) return;
    const next = pending.current;
    pending.current = null;
    setSaving(true);
    setSaveError(null);
    const task = (async () => {
      try {
        const r = await api(`/api/automations/${id}`, "PUT", {
          name: current.current!.name,
          revision: current.current!.revision,
          config: next,
        });
        current.current = r.automation;
        setAutomation(r.automation);
      } catch (e) {
        pending.current = pending.current || next;
        setSaveError(e);
        throw e;
      } finally {
        setSaving(false);
        inFlight.current = null;
      }
    })();
    inFlight.current = task;
    await task;
    if (pending.current) await flush();
  };
  const edit = (next: Config) => {
    setDraft(next);
    pending.current = next;
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      void flush().catch(() => {});
    }, 700);
  };
  const refreshConnections = async () => {
    if (!current.current?.connected) return;
    try {
      const r = await api(`/api/automations/${id}/connections?refresh=1`);
      setConnections(r.connections);
      setConnectionsUrl(r.connectionsUrl);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    if (automation?.connected) void refreshConnections();
  }, [automation?.connected]);
  const action = async (name: string) => {
    setBusy(true);
    try {
      await flush();
      await api(
        `/api/automations/${id}/${name}`,
        "POST",
        name === "run" ? { requestId: crypto.randomUUID() } : {},
      );
      await load();
      return true;
    } catch (e) {
      setError(e);
      return false;
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!automation || !["starting", "applying"].includes(automation.status))
      return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible")
        api(`/api/automations/${id}/reconcile`, "POST", {})
          .then(() => api(`/api/automations/${id}`))
          .then((r) => {
            setAutomation(r.automation);
            current.current = r.automation;
          })
          .catch(setError);
    }, 10000);
    return () => clearInterval(timer);
  }, [automation?.status, id]);
  if (error && !automation)
    return (
      <main>
        <ErrorBox error={error} retry={() => void load()} />
      </main>
    );
  if (!automation)
    return (
      <main>
        <Empty title={t("loading")} />
      </main>
    );
  const base = `/automations/${id}`,
    tab = location.pathname.split("/")[3] || "summary";
  return (
    <>
      <div className="automation-header">
        <div className="breadcrumb">
          <Link to="/">{t("automations")}</Link>
          <span>/</span>
          <b>{automation.name}</b>
        </div>
        <nav className="local-tabs">
          {(
            [
              "summary",
              "accounts",
              "newPins",
              "runs",
              "history",
              "settings",
            ] as const
          ).map((key) => (
            <NavLink
              key={key}
              to={`${base}/${key === "newPins" ? "pins" : key}`}
            >
              {t(key)}
            </NavLink>
          ))}
        </nav>
      </div>
      <main>
        <Link className="back-link" to="/">
          <ArrowLeft size={15} />
          {t("all")}
        </Link>
        {error != null && (
          <ErrorBox
            error={error}
            retry={() => {
              setError(null);
              void refreshConnections();
            }}
          />
        )}
        {saveError != null && (
          <ErrorBox
            error={saveError}
            retry={() => void flush().catch(() => {})}
          />
        )}
        {tab === "setup" ? (
          <Setup
            key={location.search}
            automation={automation}
            draft={draft}
            edit={edit}
            flush={flush}
            load={load}
            connections={connections}
            refresh={refreshConnections}
            connectionsUrl={connectionsUrl}
            action={action}
            busy={busy}
          />
        ) : (
          <>
            <div className="page-heading">
              <h1>{automation.name}</h1>
              <div className="heading-actions">
                <span className="muted" role="status">
                  {saving ? t("saving") : pending.current ? "" : t("saved")}
                </span>
                <Status status={automation.status} />
              </div>
            </div>
            {automation.revision > automation.appliedRevision &&
              automation.status !== "draft" && (
                <div className="apply-bar">
                  <span>{t("readyChanges")}</span>
                  <button
                    className="primary"
                    disabled={busy || saving}
                    onClick={() => void action("deploy")}
                  >
                    {t("apply")}
                  </button>
                </div>
              )}
            {tab === "summary" ? (
              <>
                <section className="panel summary-panel">
                  <div>
                    <Status status={automation.status} />
                    <h2>
                      {automation.config.accounts?.length || 0} {t("accounts")}
                    </h2>
                    {automation.status === "draft" && (
                      <Link className="button primary" to={`${base}/setup`}>
                        {t("draft")}
                        <ArrowRight size={16} />
                      </Link>
                    )}
                    {["starting", "applying"].includes(automation.status) && (
                      <p>{t("firstRun")}</p>
                    )}
                  </div>
                  <div className="button-row">
                    {automation.status !== "draft" && (
                      <>
                        <button
                          disabled={busy || automation.status !== "running"}
                          onClick={() => void action("run")}
                        >
                          {t("runNow")}
                        </button>
                        <button
                          disabled={busy}
                          onClick={() =>
                            void action(
                              automation.status === "paused"
                                ? "resume"
                                : "pause",
                            )
                          }
                        >
                          {t(
                            automation.status === "paused" ? "resume" : "pause",
                          )}
                        </button>
                      </>
                    )}
                    <Link className="button primary" to={`${base}/pins`}>
                      {t("newPins")}
                    </Link>
                    {automation.sheetUrl && (
                      <External href={automation.sheetUrl}>
                        {t("sheet")}
                      </External>
                    )}
                  </div>
                </section>
                <Accounts
                  flush={flush}
                  draft={draft}
                  edit={edit}
                  connections={connections}
                  refresh={refreshConnections}
                  connectionsUrl={connectionsUrl}
                  compact
                />
              </>
            ) : tab === "accounts" ? (
              <Accounts
                flush={flush}
                draft={draft}
                edit={edit}
                connections={connections}
                refresh={refreshConnections}
                connectionsUrl={connectionsUrl}
              />
            ) : tab === "settings" ? (
              <Settings
                draft={draft}
                edit={edit}
                automation={automation}
                load={load}
              />
            ) : tab === "runs" ? (
              <Runs id={id!} />
            ) : tab === "history" ? (
              <History id={id!} flush={flush} load={load} />
            ) : (
              <Pins automation={automation} draft={draft} flush={flush} />
            )}
          </>
        )}
      </main>
    </>
  );
}
function ConnectionSelect({
  service,
  value,
  onChange,
  connections,
}: {
  service: string;
  value: string;
  onChange: (id: string) => void;
  connections: Connection[];
}) {
  const { t } = useWorkspace();
  return (
    <Field label={t(service as Message)}>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">{t("select")}</option>
        {connections
          .filter((c) => c.service === service && c.status === "ACTIVE")
          .map((c) => (
            <option key={c.id} value={c.id}>
              {c.identity || c.label}
            </option>
          ))}
      </select>
    </Field>
  );
}
function Setup({
  automation,
  draft,
  edit,
  flush,
  load,
  connections,
  refresh,
  connectionsUrl,
  action,
  busy,
}: any) {
  const { t } = useWorkspace(),
    navigate = useNavigate(),
    location = useLocation();
  const [step, setStep] = useState(
      location.search.includes("reconnect=1")
        ? 0
        : location.search.includes("connections=1")
          ? 2
          : automation.connected
            ? 1
            : 0,
    ),
    [key, setKey] = useState(""),
    [projects, setProjects] = useState<{ choice: string; name: string }[]>([]),
    [project, setProject] = useState(""),
    [working, setWorking] = useState(false),
    [error, setError] = useState<unknown>(null),
    [token, setToken] = useState(""),
    [botUrl, setBotUrl] = useState("");
  useEffect(() => {
    if (!connections.length) return;
    const next = { ...draft };
    let changed = false;
    for (const service of ["google", "gmail"]) {
      const matches = connections.filter(
        (c: Connection) => c.service === service && c.status === "ACTIVE",
      );
      if (!next[service] && matches.length === 1) {
        next[service] = matches[0].id;
        changed = true;
        if (service === "google" && matches[0].identity.includes("@"))
          next.botEmail = matches[0].identity;
      }
    }
    if (!next.accounts.length) {
      const profiles = connections.filter(
        (c: Connection) =>
          c.service === "pinterest" &&
          c.status === "ACTIVE" &&
          /^[a-zA-Z0-9_]+$/.test(c.identity),
      );
      if (profiles.length) {
        next.accounts = profiles.map((c: Connection) => ({
          id: crypto.randomUUID(),
          name: c.identity,
          username: c.identity,
          connection: c.id,
          niche: "",
          general: true,
          category: "crochet",
          source: "niche",
          website: "",
          pinsPerProduct: 6,
          pinsPerDay: 5,
          hours: spreadHours(5),
          on: true,
        }));
        changed = true;
      }
    }
    if (changed) edit(next);
  }, [connections]);
  useEffect(() => {
    if (step !== 2) return;
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void refresh();
    }, 12000);
    const focus = () => void refresh();
    window.addEventListener("focus", focus);
    return () => {
      clearInterval(poll);
      window.removeEventListener("focus", focus);
    };
  }, [step]);
  const connectKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorking(true);
    setError(null);
    try {
      const r = await api(`/api/automations/${automation.id}/connect`, "POST", {
        key,
        project: project || undefined,
      });
      if (r.projects) {
        setProjects(r.projects);
        return;
      }
      setKey("");
      await load();
      setStep(1);
    } catch (e) {
      setError(e);
    } finally {
      setWorking(false);
    }
  };
  const next = async () => {
    try {
      await flush();
      setStep(step + 1);
    } catch (e) {
      setError(e);
    }
  };
  const ready = Boolean(
    draft.google &&
    (!draft.notifyEmail || draft.gmail) &&
    (!draft.notifyTelegram || draft.telegram) &&
    draft.accounts.length,
  );
  return (
    <section className="wizard">
      <div className="wizard-progress">
        <span>
          {t("step")} {step + 1} {t("of")} 4
        </span>
        <div>
          {[0, 1, 2, 3].map((n) => (
            <i key={n} className={n <= step ? "done" : ""} />
          ))}
        </div>
      </div>
      <h1>
        {t((["connect", "notifications", "logins", "review"] as const)[step])}
      </h1>
      {error != null && <ErrorBox error={error} />}
      {step === 0 ? (
        <form onSubmit={connectKey}>
          <p>{t("connectCopy")}</p>
          <ol className="short-steps">
            <li>
              <External href="https://cloud.activepieces.com/platform/api-keys">
                {t("openKeys")}
              </External>
            </li>
            <li>{t("keyGuide")}</li>
          </ol>
          <Field label={t("pasteKey")}>
            <input
              autoComplete="off"
              type="password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              minLength={16}
            />
          </Field>
          {projects.length > 0 && (
            <Field label={t("chooseProject")}>
              <select
                required
                value={project}
                onChange={(e) => setProject(e.target.value)}
              >
                <option value="">{t("select")}</option>
                {projects.map((p) => (
                  <option key={p.choice} value={p.choice}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <button className="primary" disabled={working || key.length < 16}>
            {working ? t("loading") : t("verify")}
          </button>
        </form>
      ) : step === 1 ? (
        <>
          <Field label={t("email")}>
            <input
              type="email"
              value={draft.emailTo}
              onChange={(e) => edit({ ...draft, emailTo: e.target.value })}
            />
          </Field>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.notifyEmail}
              onChange={(e) =>
                edit({ ...draft, notifyEmail: e.target.checked })
              }
            />
            {t("gmail")}
          </label>
          <label className="check-row">
            <input
              type="checkbox"
              checked={draft.notifyTelegram}
              onChange={(e) =>
                edit({ ...draft, notifyTelegram: e.target.checked })
              }
            />
            {t("telegramOptional")}
          </label>
          {draft.notifyTelegram && (
            <>
              <Field label={t("botToken")}>
                <input
                  type="password"
                  autoComplete="off"
                  value={token}
                  onChange={(e) => setToken(e.target.value)}
                />
              </Field>
              <button
                disabled={!token || working}
                onClick={async () => {
                  setWorking(true);
                  try {
                    const r = await api(
                      `/api/automations/${automation.id}/telegram`,
                      "POST",
                      { token },
                    );
                    setToken("");
                    edit({ ...draft, telegram: r.connection });
                    setBotUrl(r.botUrl);
                    await refresh();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                {t("connectBot")}
              </button>
              {botUrl && <External href={botUrl}>{t("openBot")}</External>}
            </>
          )}
        </>
      ) : step === 2 ? (
        <>
          <p>{t("loginsCopy")}</p>
          <External href={connectionsUrl}>{t("openConnections")}</External>
          <p className="muted">{t("connectionGuide")}</p>
          <div className="connection-list">
            {[
              "google",
              ...(draft.notifyEmail ? ["gmail"] : []),
              "pinterest",
            ].map((service) => (
              <div className="connection-row" key={service}>
                <span>{t(service as Message)}</span>
                {connections.some(
                  (c: Connection) =>
                    c.service === service && c.status === "ACTIVE",
                ) ? (
                  <span className="positive">
                    <Check size={16} />
                    {t("connected")}
                  </span>
                ) : (
                  <span className="muted">{t("waiting")}</span>
                )}
              </div>
            ))}
          </div>
          <ConnectionSelect
            service="google"
            value={draft.google}
            connections={connections}
            onChange={(google) => {
              const c = connections.find((c: Connection) => c.id === google);
              edit({
                ...draft,
                google,
                botEmail: c?.identity?.includes("@")
                  ? c.identity
                  : draft.botEmail,
              });
            }}
          />
          {draft.notifyEmail && (
            <ConnectionSelect
              service="gmail"
              value={draft.gmail}
              connections={connections}
              onChange={(gmail) => edit({ ...draft, gmail })}
            />
          )}
          <button onClick={refresh}>{t("refresh")}</button>
          <Accounts
            flush={flush}
            draft={draft}
            edit={edit}
            connections={connections}
            refresh={refresh}
            connectionsUrl={connectionsUrl}
          />
        </>
      ) : (
        <>
          <p>{t("reviewCopy")}</p>
          <div className="review-row">
            <Check size={17} />
            {t("readiness")}
          </div>
          {draft.accounts.map((a: Account) => (
            <div className="review-row" key={a.id}>
              <span className="pinterest-mark">P</span>
              <bdi>@{a.username}</bdi>
              <span>
                {a.pinsPerDay} · {t("daily")}
              </span>
            </div>
          ))}
          <Notice>{t("firstRun")}</Notice>
          <button
            className="primary"
            disabled={busy || !ready}
            onClick={async () => {
              if (await action("deploy"))
                navigate(`/automations/${automation.id}/summary`);
            }}
          >
            {busy ? t("loading") : t("deploy")}
            <ArrowRight size={16} />
          </button>
        </>
      )}
      <div className="wizard-actions">
        {step > 0 && (
          <button onClick={() => setStep(step - 1)}>{t("back")}</button>
        )}
        {step > 0 && step < 3 && (
          <button
            className="primary"
            disabled={
              step === 1 ? !draft.notifyEmail && !draft.notifyTelegram : !ready
            }
            onClick={() => void next()}
          >
            {t("continue")}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    </section>
  );
}
function Accounts({
  draft,
  edit,
  connections,
  refresh,
  connectionsUrl,
  compact = false,
  flush,
}: {
  draft: Config;
  edit: (v: Config) => void;
  connections: Connection[];
  refresh: () => void;
  connectionsUrl: string;
  compact?: boolean;
  flush: () => Promise<void>;
}) {
  const { t } = useWorkspace(),
    location = useLocation();
  const [adding, setAdding] = useState(location.search.includes("add=1")),
    [chosen, setChosen] = useState("");
  const pins = connections.filter(
    (c) => c.service === "pinterest" && c.status === "ACTIVE",
  );
  const available = pins.filter(
    (c) => !draft.accounts.some((a) => a.connection === c.id),
  );
  const add = () => {
    const c = available.find((c) => c.id === chosen);
    if (!c) return;
    const username = (c.identity || c.label)
      .replace(/^@/, "")
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 40);
    const account: Account = {
      id: crypto.randomUUID(),
      name: username || "pinterest",
      username,
      connection: c.id,
      niche: "",
      general: true,
      category: "crochet",
      source: "niche",
      website: "",
      pinsPerProduct: 6,
      pinsPerDay: 5,
      hours: spreadHours(5),
      on: true,
    };
    edit({ ...draft, accounts: [...draft.accounts, account] });
    setAdding(false);
    setChosen("");
  };
  return (
    <section>
      <div className="section-heading">
        <h2>
          {t("accounts")} <span className="muted">{draft.accounts.length}</span>
        </h2>
        <button onClick={() => setAdding(true)}>
          <Plus size={17} />
          {t("addAccount")}
        </button>
      </div>
      {draft.accounts.map((account) => (
        <AccountCard
          flush={flush}
          key={account.id}
          account={account}
          compact={compact}
          update={(next) =>
            edit({
              ...draft,
              accounts: draft.accounts.map((a) =>
                a.id === account.id ? next : a,
              ),
            })
          }
        />
      ))}
      <Modal title={t("addAccount")} open={adding} onOpenChange={setAdding}>
        <p>{t("loginsCopy")}</p>
        <External href={connectionsUrl}>{t("openConnections")}</External>
        <p className="muted">{t("connectionGuide")}</p>
        <button onClick={refresh}>{t("refresh")}</button>
        {available.length > 0 && (
          <>
            <Field label={t("select")}>
              <select
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
              >
                <option value="">{t("select")}</option>
                {available.map((c) => (
                  <option value={c.id} key={c.id}>
                    {c.identity || c.label}
                  </option>
                ))}
              </select>
            </Field>
            <button className="primary" onClick={add} disabled={!chosen}>
              {t("continue")}
            </button>
          </>
        )}
      </Modal>
    </section>
  );
}
function AccountCard({
  account,
  update,
  compact,
  flush,
}: {
  account: Account;
  update: (a: Account) => void;
  compact: boolean;
  flush: () => Promise<void>;
}) {
  const { t } = useWorkspace();
  const [expanded, setExpanded] = useState(!compact);
  return (
    <article className="panel account-card">
      <div className="account-heading">
        <span className="pinterest-mark">P</span>
        <div>
          <bdi>
            <h3>@{account.username}</h3>
          </bdi>
          <span className="muted">
            {account.pinsPerDay} · {t("daily")}
          </span>
        </div>
        <button onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
          {t("settings")}
        </button>
      </div>
      {expanded && (
        <div className="account-body">
          <div className="form-grid">
            <Field label={t("category")}>
              <select
                value={account.category}
                onChange={(e) =>
                  update({
                    ...account,
                    category: e.target.value as Account["category"],
                  })
                }
              >
                {(
                  [
                    "crochet",
                    "food",
                    "home",
                    "printables",
                    "diy",
                    "other",
                  ] as const
                ).map((c) => (
                  <option key={c} value={c}>
                    {t(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t("daily")}>
              <select
                value={account.pinsPerDay}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  update({ ...account, pinsPerDay: n, hours: spreadHours(n) });
                }}
              >
                {Array.from({ length: 18 }, (_, i) => (
                  <option key={i} value={i + 1}>
                    {i + 1}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label={t("niche")}>
            <input
              value={account.niche}
              onChange={(e) =>
                update({
                  ...account,
                  niche: e.target.value,
                  general: !e.target.value.trim(),
                })
              }
              maxLength={300}
            />
          </Field>
          <fieldset className="hours">
            <legend>{t("times")}</legend>
            {Array.from({ length: 18 }, (_, i) => i + 6).map((hour) => (
              <button
                type="button"
                key={hour}
                aria-pressed={account.hours.includes(hour)}
                onClick={() => {
                  const hours = account.hours.includes(hour)
                    ? account.hours.filter((h) => h !== hour)
                    : [...account.hours, hour].sort((a, b) => a - b);
                  if (hours.length)
                    update({ ...account, hours, pinsPerDay: hours.length });
                }}
              >
                {String(hour).padStart(2, "0")}:00
              </button>
            ))}
          </fieldset>
          <Field label={t("source")}>
            <select
              value={account.source}
              onChange={(e) =>
                update({
                  ...account,
                  source: e.target.value as Account["source"],
                })
              }
            >
              <option value="niche">{t("withoutLinks")}</option>
              <option value="website">{t("website")}</option>
            </select>
          </Field>
          {account.source === "website" && (
            <Field label={t("websiteAddress")}>
              <input
                type="url"
                value={account.website}
                onChange={(e) =>
                  update({ ...account, website: e.target.value })
                }
                placeholder="https://"
              />
            </Field>
          )}
          <label className="check-row">
            <input
              type="checkbox"
              checked={account.on}
              onChange={(e) => update({ ...account, on: e.target.checked })}
            />
            {t(account.on ? "on" : "off")}
          </label>
          <References accountId={account.id} flush={flush} t={t} />
        </div>
      )}
    </article>
  );
}
function Settings({ draft, edit, automation, load }: any) {
  const { t } = useWorkspace();
  const navigate = useNavigate();
  const [deleting, setDeleting] = useState(false),
    [deleteBusy, setDeleteBusy] = useState(false);
  const [name, setName] = useState(automation.name),
    [error, setError] = useState<unknown>(null);
  return (
    <section className="panel form-panel">
      {error != null && <ErrorBox error={error} />}
      <Field label={t("name")}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
        />
      </Field>
      <button
        disabled={!name.trim() || name === automation.name}
        onClick={async () => {
          try {
            await api(`/api/automations/${automation.id}`, "PUT", {
              name,
              revision: automation.revision,
              config: draft,
            });
            await load();
          } catch (e) {
            setError(e);
          }
        }}
      >
        {t("save")}
      </button>
      <Field label={t("email")}>
        <input
          type="email"
          value={draft.emailTo}
          onChange={(e) => edit({ ...draft, emailTo: e.target.value })}
        />
      </Field>
      <Field label={t("timezone")}>
        <select
          value={draft.timeZone}
          onChange={(e) => edit({ ...draft, timeZone: e.target.value })}
        >
          {Array.from(
            new Set([draft.timeZone, ...Intl.supportedValuesOf("timeZone")]),
          ).map((zone) => (
            <option value={zone} key={zone}>
              {zone}
            </option>
          ))}
        </select>
      </Field>
      <Link
        className="button"
        to={`/automations/${automation.id}/setup?reconnect=1`}
      >
        {t("connect")}
      </Link>
      <div className="history-section">
        <button className="danger" onClick={() => setDeleting(true)}>
          {t("deleteAutomation")}
        </button>
      </div>
      <Modal title={automation.name} open={deleting} onOpenChange={setDeleting}>
        <p>{t("deleteAutomationConfirm")}</p>
        <div className="button-row">
          <button onClick={() => setDeleting(false)}>{t("cancel")}</button>
          <button
            className="danger"
            disabled={deleteBusy}
            onClick={async () => {
              setDeleteBusy(true);
              try {
                await api(`/api/automations/${automation.id}`, "DELETE", {
                  confirm: true,
                });
                navigate("/");
              } catch (e) {
                setError(e);
                setDeleting(false);
              } finally {
                setDeleteBusy(false);
              }
            }}
          >
            {t("deleteAutomation")}
          </button>
        </div>
      </Modal>
    </section>
  );
}
function Runs({ id }: { id: string }) {
  const { t } = useWorkspace();
  const [runs, setRuns] = useState<any[] | null>(null),
    [error, setError] = useState<unknown>(null);
  const load = () =>
    api(`/api/automations/${id}/runs`)
      .then((r) => setRuns(r.runs))
      .catch(setError);
  useEffect(() => {
    void load();
  }, [id]);
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{t("runs")}</h2>
        <button onClick={() => void load()}>{t("refresh")}</button>
      </div>
      {error != null && <ErrorBox error={error} />}
      <div className="rows">
        {runs === null ? (
          t("loading")
        ) : !runs.length ? (
          <Empty title={t("noRuns")} />
        ) : (
          runs.map((r) => (
            <div className="review-row" key={r.id}>
              <span>
                {r.startedAt ? new Date(r.startedAt).toLocaleString() : ""}
              </span>
              <span>
                {r.status === "SUCCEEDED" ? (
                  <Check size={18} />
                ) : r.status === "RUNNING" ? (
                  t("starting")
                ) : (
                  t("problem")
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
function History({
  id,
  flush,
  load,
}: {
  id: string;
  flush: () => Promise<void>;
  load: () => Promise<void>;
}) {
  const { t, language, notify } = useWorkspace();
  const [versions, setVersions] = useState<any[]>([]),
    [batches, setBatches] = useState<any[]>([]),
    [selected, setSelected] = useState<any>(null),
    [error, setError] = useState<unknown>(null);
  const refresh = async () => {
    try {
      const [v, b] = await Promise.all([
        api(`/api/automations/${id}/versions`),
        api(`/api/automations/${id}/batches`),
      ]);
      setVersions(v.versions);
      setBatches(b.batches);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    void refresh();
  }, [id]);
  return (
    <section className="panel">
      <h2>{t("history")}</h2>
      {error != null && <ErrorBox error={error} />}
      {!versions.length && !batches.length && <Empty title={t("noHistory")} />}
      {batches.map((batch) => (
        <div className="batch-row" key={batch.id}>
          <div>
            <strong>
              <bdi>@{batch.username}</bdi> · {batch.total}
            </strong>
            <p>
              {new Date(batch.createdAt * 1000).toLocaleString(language)} ·{" "}
              {batch.copies} {t("copies")}
            </p>
          </div>
          <div className="button-row">
            <button
              onClick={async () => {
                try {
                  const r = await api(
                    `/api/automations/${id}/batches/${batch.id}`,
                  );
                  setSelected(r.batch);
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t("copy")}
            </button>
            <button
              onClick={async () => {
                try {
                  await api(
                    `/api/automations/${id}/batches/${batch.id}/sent`,
                    "POST",
                    {},
                  );
                  notify(t("saved"));
                  await refresh();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t("sent")}
            </button>
          </div>
        </div>
      ))}
      {versions.length > 0 && (
        <div className="history-section">
          <h3>{t("settings")}</h3>
          {versions.map((v) => (
            <div className="review-row" key={v.id}>
              <span>
                {new Date(v.created_at * 1000).toLocaleString(language)}
              </span>
              <button
                onClick={async () => {
                  if (!window.confirm(t("confirmRestore"))) return;
                  try {
                    await flush();
                    await api(`/api/automations/${id}/restore`, "POST", {
                      version: v.id,
                    });
                    await load();
                    await refresh();
                  } catch (e) {
                    setError(e);
                  }
                }}
              >
                {t("restore")}
              </button>
            </div>
          ))}
        </div>
      )}
      <Modal
        title={t("getPrompt")}
        open={Boolean(selected)}
        onOpenChange={(open) => {
          if (!open) setSelected(null);
        }}
      >
        {selected && (
          <>
            <p>{t("promptHelp")}</p>
            {selected.referenceCount > 0 && (
              <Notice>{t("referenceLinks")}</Notice>
            )}
            <pre className="prompt-preview">{selected.prompt}</pre>
            <button
              className="primary"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(selected.prompt);
                  await api(
                    `/api/automations/${id}/batches/${selected.id}/copy`,
                    "POST",
                    {},
                  );
                  notify(t("copied"));
                  await refresh();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t("copy")}
            </button>
          </>
        )}
      </Modal>
    </section>
  );
}
function Pins({
  automation,
  draft,
  flush,
}: {
  automation: Automation;
  draft: Config;
  flush: () => Promise<void>;
}) {
  const { t, notify } = useWorkspace();
  const [accountId, setAccountId] = useState(draft.accounts[0]?.id || ""),
    [mode, setMode] = useState("free"),
    [count, setCount] = useState(10),
    [url, setUrl] = useState(""),
    [prompt, setPrompt] = useState(""),
    [batchId, setBatchId] = useState(""),
    [error, setError] = useState<unknown>(null),
    [busy, setBusy] = useState(false);
  return (
    <section className="readable">
      <h2>{t("newPins")}</h2>
      {!draft.accounts.length ? (
        <Empty title={t("noAccounts")} />
      ) : (
        <>
          <Field label={t("accounts")}>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {draft.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  @{a.username}
                </option>
              ))}
            </select>
          </Field>
          <div className="segmented" role="group" aria-label={t("source")}>
            {(["link", "free", "next"] as const).map((m, i) => (
              <button
                key={m}
                aria-pressed={mode === m}
                onClick={() => {
                  setMode(m);
                  if (m === "next") setCount(1);
                }}
              >
                {t((["pageLinks", "withoutLinks", "website"] as const)[i])}
              </button>
            ))}
          </div>
          {mode === "link" && (
            <Field label={t("url")}>
              <input
                type="url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://"
              />
            </Field>
          )}
          <Field label={t(mode === "next" ? "rounds" : "count")}>
            <input
              type="number"
              min={1}
              max={mode === "next" ? 5 : 30}
              value={count}
              onChange={(e) => setCount(Number(e.target.value))}
            />
          </Field>
          <p className="muted">{t("promptHelp")}</p>
          {error != null && <ErrorBox error={error} />}
          <button
            className="primary"
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await flush();
                const r = await api(
                  `/api/automations/${automation.id}/batches`,
                  "POST",
                  {
                    accountId,
                    lines: [
                      { kind: mode, count, url: mode === "link" ? url : "" },
                    ],
                  },
                );
                setPrompt(r.batch.prompt);
                setBatchId(r.batch.id);
              } catch (e) {
                setError(e);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? t("loading") : t("getPrompt")}
          </button>
          <Modal
            title={t("getPrompt")}
            open={Boolean(prompt)}
            onOpenChange={(open) => {
              if (!open) setPrompt("");
            }}
          >
            <p>{t("promptHelp")}</p>
            <pre className="prompt-preview">{prompt}</pre>
            <button
              className="primary"
              onClick={async () => {
                await navigator.clipboard.writeText(prompt);
                await api(
                  `/api/automations/${automation.id}/batches/${batchId}/copy`,
                  "POST",
                  {},
                );
                notify(t("copied"));
              }}
            >
              {t("copy")}
            </button>
          </Modal>
        </>
      )}
    </section>
  );
}
function Members() {
  const { user, t, language } = useWorkspace();
  const [members, setMembers] = useState<any[]>([]),
    [error, setError] = useState<unknown>(null);
  const load = () =>
    api("/api/admin/users")
      .then((r) => setMembers(r.users))
      .catch(setError);
  useEffect(() => {
    if (user.admin) void load();
  }, []);
  if (!user.admin) return null;
  return (
    <main>
      <h1>{t("members")}</h1>
      {error != null && <ErrorBox error={error} />}
      <div className="panel member-list">
        {members.map((m) => (
          <div className="member" key={m.id}>
            <div>
              <strong>{m.name}</strong>
              <span>
                <bdi>{m.email}</bdi>
              </span>
              <small>
                {m.automations} · {t("automations")} ·{" "}
                {new Date(m.last_active * 1000).toLocaleString(language)}
              </small>
            </div>
            {m.id !== user.id && (
              <div className="button-row">
                {[m.status === "active" ? "block" : "unblock", "remove"].map(
                  (action) => (
                    <button
                      key={action}
                      onClick={async () => {
                        if (!window.confirm(t("memberConfirm"))) return;
                        try {
                          await api(`/api/admin/users/${m.id}`, "POST", {
                            action,
                          });
                          await load();
                        } catch (e) {
                          setError(e);
                        }
                      }}
                    >
                      {t(action as Message)}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
createRoot(document.getElementById("root")!).render(
  <BrowserRouter>
    <App />
  </BrowserRouter>,
);
