import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  createBrowserRouter,
  RouterProvider,
  useBlocker,
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
import { Queue } from "./queue";
import { References } from "./references";
import { detectedConfig, connectionsReady, newPinterestAccount } from "./setup";
import { downloadBatch } from "./batch-package.mjs";
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
const AccountEditsContext = createContext<
  React.Dispatch<React.SetStateAction<Record<string, boolean>>>
>(() => {});
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
    [toast, setToast] = useState(""),
    [local, setLocal] = useState(false),
    [error, setError] = useState<unknown>(null);
  const location = useLocation();
  const language: Language = "en";
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
    document.documentElement.lang = "en";
    document.documentElement.dir = "ltr";
    document.documentElement.dataset.theme = "dark";
    localStorage.removeItem("automation-language");
    localStorage.removeItem("automation-theme");
  }, []);
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
    [removedDrafts, setRemovedDrafts] = useState<Automation[]>([]),
    [removing, setRemoving] = useState<Automation | null>(null),
    [creating, setCreating] = useState(false),
    [createMode, setCreateMode] = useState<"choice" | "existing">("choice"),
    [savedFlows, setSavedFlows] = useState<any[]>([]),
    [finding, setFinding] = useState(false),
    [needsKey, setNeedsKey] = useState(false),
    [loading, setLoading] = useState(true),
    [error, setError] = useState<unknown>(null),
    [query, setQuery] = useState(""),
    [busy, setBusy] = useState(false);
  const navigate = useNavigate();
  const load = () => {
    api("/api/automations")
      .then((r) => {
        setItems(r.automations);
        setRemovedDrafts(r.removedDrafts || []);
        setError(null);
      })
      .catch(setError)
      .finally(() => setLoading(false));
  };
  useEffect(load, []);
  const creationId = useRef(crypto.randomUUID());
  const create = async (intent: "new" | "existing" = "new") => {
    setBusy(true);
    try {
      const r = await api("/api/automations", "POST", {
        name: t("automation"),
        requestId: creationId.current,
        intent,
      });
      navigate(`/automations/${r.automation.id}/setup`);
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  };
  const findExisting = async () => {
    setCreateMode("existing");
    setFinding(true);
    try {
      const r = await api("/api/existing-automations");
      setSavedFlows(r.flows);
      setNeedsKey(r.needsKey);
    } catch (e) {
      setError(e);
      setCreating(false);
    } finally {
      setFinding(false);
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
        <button
          className="primary"
          onClick={() => {
            setCreateMode("choice");
            setCreating(true);
          }}
          disabled={busy}
        >
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
          <button
            className="primary"
            onClick={() => {
              setCreateMode("choice");
              setCreating(true);
            }}
            disabled={busy}
          >
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
                    className="card-open"
                    aria-label={`Open ${a.name}`}
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
                <div className="card-management">
                  <Link
                    className="button"
                    to={`/automations/${a.id}/${a.deployed ? "settings" : "setup"}`}
                  >
                    {t("edit")}
                  </Link>
                  <button className="danger" onClick={() => setRemoving(a)}>
                    {t(a.deployed ? "deleteAutomation" : "removeDraft")}
                  </button>
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
      {removedDrafts.length > 0 && (
        <details className="history-section removed-drafts">
          <summary>
            {t("removedDrafts")} · {removedDrafts.length}
          </summary>
          {removedDrafts.map((a) => (
            <div className="review-row" key={a.id}>
              <span>{a.name}</span>
              <button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api(
                      `/api/automations/${a.id}/restore-draft`,
                      "POST",
                      {},
                    );
                    load();
                  } catch (e) {
                    setError(e);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {t("restore")}
              </button>
            </div>
          ))}
        </details>
      )}
      <Modal
        title={removing?.name || t("automation")}
        open={Boolean(removing)}
        onOpenChange={(v) => !v && setRemoving(null)}
      >
        <p>
          {t(
            removing?.deployed
              ? "deleteAutomationConfirm"
              : "removeDraftConfirm",
          )}
        </p>
        <div className="button-row">
          <button onClick={() => setRemoving(null)}>{t("cancel")}</button>
          <button
            className="danger"
            disabled={busy}
            onClick={async () => {
              if (!removing) return;
              setBusy(true);
              try {
                await api(`/api/automations/${removing.id}`, "DELETE", {
                  confirm: true,
                });
                setRemoving(null);
                load();
              } catch (e) {
                setError(e);
                setRemoving(null);
              } finally {
                setBusy(false);
              }
            }}
          >
            {t(removing?.deployed ? "deleteAutomation" : "removeDraft")}
          </button>
        </div>
      </Modal>
      <Modal title={t("create")} open={creating} onOpenChange={setCreating}>
        {createMode === "choice" ? (
          <>
            <p>{t("createChoice")}</p>
            <div className="choice-buttons">
              <button className="primary" onClick={() => void findExisting()}>
                {t("editExisting")}
              </button>
              <button disabled={busy} onClick={() => void create("new")}>
                {t("startEmpty")}
              </button>
            </div>
          </>
        ) : finding ? (
          <p role="status">{t("findingSetup")}</p>
        ) : (
          <>
            {savedFlows.map((f) => (
              <button
                className="existing-setup flow-choice"
                key={f.choice}
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    const r = await api(
                      "/api/existing-automations/open",
                      "POST",
                      { choice: f.choice },
                    );
                    navigate(`/automations/${r.id}/summary`);
                  } catch (e) {
                    setError(e);
                    setCreating(false);
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <span>
                  <strong>{f.name}</strong>
                  <small>
                    {f.profiles.map((u: string) => "@" + u).join(" · ")}
                  </small>
                  <small>
                    {f.project} · {t(f.status)}
                  </small>
                </span>
                <ChevronRight size={18} />
              </button>
            ))}
            {!savedFlows.length && (
              <>
                <p>{t(needsKey ? "connectToFind" : "noExistingSetup")}</p>
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => void create(needsKey ? "existing" : "new")}
                >
                  {t(needsKey ? "connect" : "startEmpty")}
                </button>
              </>
            )}
            <button onClick={() => setCreateMode("choice")}>{t("back")}</button>
          </>
        )}
      </Modal>
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
  lowQueue: 0,
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
    [connectionName, setConnectionName] = useState(""),
    [connectionsUrl, setConnectionsUrl] = useState(
      "https://cloud.activepieces.com/",
    ),
    [busy, setBusy] = useState(false);
  const [accountEdits, setAccountEdits] = useState<Record<string, boolean>>({});
  const blocker = useBlocker(Object.values(accountEdits).some(Boolean));
  useEffect(() => {
    if (blocker.state !== "blocked") return;
    if (window.confirm("Discard unsaved account changes?")) blocker.proceed();
    else blocker.reset();
  }, [blocker]);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined),
    pending = useRef<Config | null>(null),
    inFlight = useRef<Promise<void> | null>(null),
    current = useRef<Automation | null>(null);
  const load = async () => {
    try {
      let r = await api(`/api/automations/${id}`);
      if (r.automation.deployed) {
        await api(`/api/automations/${id}/reconcile`, "POST", {});
        r = await api(`/api/automations/${id}`);
      }
      setAutomation(r.automation);
      current.current = r.automation;
      setDraft({ ...defaults(user), ...r.automation.config });
      setError(null);
      return r.automation;
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
      setConnectionName(r.name || "");
      setConnectionsUrl(r.connectionsUrl);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    if (automation?.connected) void refreshConnections();
  }, [automation?.connected]);
  const saveAccount = async (account: Account) => {
    await flush();
    const saved = current.current!;
    const config = {
      ...defaults(user),
      ...saved.config,
      accounts: (saved.config.accounts || []).map((a) =>
        a.id === account.id ? account : a,
      ),
    };
    const r = await api(`/api/automations/${id}`, "PUT", {
      name: saved.name,
      revision: saved.revision,
      config,
    });
    current.current = r.automation;
    setAutomation(r.automation);
    setDraft({ ...defaults(user), ...r.automation.config });
  };
  const action = async (name: string) => {
    setBusy(true);
    setError(null);
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
  const actionPending =
    busy || ["starting", "applying"].includes(automation.status);
  return (
    <AccountEditsContext.Provider value={setAccountEdits}>
      <>
        <div className="automation-header">
          <div className="breadcrumb">
            <Link to="/">{t("automations")}</Link>
            <span>/</span>
            <b>{automation.name}</b>
          </div>
          {(tab !== "setup" || automation.deployed) && (
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
          )}
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
              connectionName={connectionName}
              action={action}
              busy={actionPending}
            />
          ) : (
            <>
              <div className="page-heading">
                <h1>{automation.name}</h1>
                <div className="heading-actions">
                  <span className="muted" role="status">
                    {Object.values(accountEdits).some(Boolean)
                      ? "Unsaved changes"
                      : saving
                        ? t("saving")
                        : pending.current
                          ? ""
                          : t("saved")}
                  </span>
                  <Status status={automation.status} />
                </div>
              </div>
              {(automation.revision > automation.appliedRevision ||
                pending.current) &&
                automation.deployed && (
                  <div className="apply-bar">
                    <span>{t("readyChanges")}</span>
                    <button
                      className="primary"
                      disabled={actionPending || saving}
                      onClick={() => void action("deploy")}
                    >
                      {t("apply")}
                    </button>
                  </div>
                )}
              {tab === "summary" ? (
                <>
                  <Queue
                    automation={automation}
                    config={draft}
                    action={action}
                    busy={actionPending}
                  />
                </>
              ) : tab === "accounts" ? (
                <Accounts
                  flush={flush}
                  saveAccount={saveAccount}
                  draft={draft}
                  edit={edit}
                  connections={connections}
                  refresh={refreshConnections}
                  connectionsUrl={connectionsUrl}
                  updateAutomation={() => action("deploy")}
                  busy={actionPending}
                  deployed={automation.deployed}
                />
              ) : tab === "settings" ? (
                <Settings
                  draft={draft}
                  edit={edit}
                  automation={automation}
                  load={load}
                  connections={connections}
                  rename={async (name: string) => {
                    await flush();
                    const r = await api(`/api/automations/${id}`, "PUT", {
                      name,
                      revision: current.current!.revision,
                      config: current.current!.config,
                    });
                    current.current = r.automation;
                    setAutomation(r.automation);
                  }}
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
    </AccountEditsContext.Provider>
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
  connectionName,
  action,
  busy,
}: any) {
  const { t } = useWorkspace(),
    navigate = useNavigate(),
    location = useLocation();
  const [step, setStep] = useState(
      location.search.includes("notifications=1")
        ? 1
        : location.search.includes("review=1")
          ? 3
          : location.search.includes("reconnect=1")
            ? 0
            : location.search.includes("connections=1")
              ? 2
              : automation.sheetUrl ||
                  ["starting", "applying"].includes(automation.status)
                ? 3
                : Math.max(
                    automation.setupStep || 0,
                    automation.connected ? 1 : 0,
                  ),
    ),
    [key, setKey] = useState(""),
    [projects, setProjects] = useState<{ choice: string; name: string }[]>([]),
    [project, setProject] = useState(""),
    [working, setWorking] = useState(false),
    [error, setError] = useState<unknown>(null),
    [token, setToken] = useState(""),
    [botUrl, setBotUrl] = useState(""),
    [botStarted, setBotStarted] = useState(false),
    [botReady, setBotReady] = useState(false),
    [botError, setBotError] = useState<unknown>(null),
    [flows, setFlows] = useState<any[]>([]),
    [flowChoice, setFlowChoice] = useState(""),
    [discovering, setDiscovering] = useState(false),
    [addingBot, setAddingBot] = useState(false),
    [changingKey, setChangingKey] = useState(false);
  const discovered = useRef(false);
  const discover = async (config: Config) => {
    setDiscovering(true);
    try {
      const result = await api(`/api/automations/${automation.id}/discovery`);
      setFlows(result.flows);
      setFlowChoice(
        automation.intent === "existing" ? result.flows[0]?.choice || "" : "",
      );
      const next = detectedConfig(config, result.connections);
      edit(next);
      await flush();
      await refresh();
      const reusedBot = result.flows.some(
        (f: any) =>
          f.config.notifyTelegram &&
          f.config.telegram === next.telegram &&
          f.config.google === next.google,
      );
      if (
        !location.search.includes("connections=1") &&
        !location.search.includes("notifications=1")
      )
        setStep(
          (automation.intent === "existing" && result.flows.length) ||
            connectionsReady(next, result.connections, reusedBot)
            ? 3
            : 2,
        );
    } catch (e) {
      setError(e);
    } finally {
      setDiscovering(false);
    }
  };
  useEffect(() => {
    if (
      !automation.connected ||
      discovered.current ||
      automation.deployed ||
      location.search.includes("reconnect=1")
    )
      return;
    discovered.current = true;
    void discover(draft);
  }, [automation.connected]);
  useEffect(() => {
    if (!connections.length) return;
    const next = detectedConfig(draft, connections);
    if (JSON.stringify(next) !== JSON.stringify(draft)) edit(next);
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
  useEffect(() => {
    setBotError(null);
    setBotReady(false);
    setBotStarted(false);
    setBotUrl("");
    if (!automation.connected || !draft.notifyTelegram || !draft.telegram) return;
    let cancelled = false;
    const check = () =>
      api(
        `/api/automations/${automation.id}/telegram-status?connection=${encodeURIComponent(draft.telegram)}`,
      )
        .then((r) => {
          if (cancelled) return;
          setBotError(null);
          setBotUrl(r.botUrl || "");
          setBotStarted(Boolean(r.started));
          setBotReady(Boolean(r.tested || r.existing));
        })
        .catch((e) => { if (!cancelled) setBotError(e); });
    void check();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void check();
    }, 8000);
    return () => { cancelled = true; clearInterval(timer); };
  }, [
    automation.id,
    automation.connected,
    draft.notifyTelegram,
    draft.telegram,
  ]);
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
      discovered.current = true;
      const saved = await load();
      if (saved?.deployed) navigate(`/automations/${automation.id}/summary`);
      else await discover({ ...draft, ...saved?.config });
    } catch (e) {
      setError(e);
    } finally {
      setWorking(false);
    }
  };
  const next = async () => {
    try {
      await flush();
      await api(`/api/automations/${automation.id}/setup-step`, "POST", {
        step: step + 1,
      });
      setStep(step + 1);
    } catch (e) {
      setError(e);
    }
  };
  const reusedBot = flows.some(
    (f: any) =>
      f.config.notifyTelegram &&
      f.config.telegram === draft.telegram &&
      f.config.google === draft.google,
  );
  const ready = connectionsReady(draft, connections, botReady || reusedBot);
  const selectedFlow = flows.find((f: any) => f.choice === flowChoice);
  return (
    <section className="wizard">
      {!automation.deployed && (
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
      )}
      <h1>
        {discovering
          ? t("findingSetup")
          : t(
              (["connect", "notifications", "logins", "review"] as const)[step],
            )}
      </h1>
      {error != null && <ErrorBox error={error} />}
      {draft.notifyTelegram && draft.telegram && botError != null && <ErrorBox error={botError} />}
      {discovering ? (
        <p role="status">{t("loading")}</p>
      ) : step === 0 && automation.connected && !changingKey ? (
        <>
          <div className="review-row">
            <Check size={18} />
            <strong>{t("activepiecesConnected")}</strong>
          </div>
          {connectionName && <p>{connectionName}</p>}
          <Notice>{t("savedKeyMessage")}</Notice>
          <div className="button-row">
            <button
              className="primary"
              disabled={working}
              onClick={async () => {
                setWorking(true);
                try {
                  if (automation.deployed)
                    navigate(`/automations/${automation.id}/summary`);
                  else await discover(draft);
                } finally {
                  setWorking(false);
                }
              }}
            >
              {t("continue")}
              <ArrowRight size={16} />
            </button>
            <button onClick={() => setChangingKey(true)}>
              {t("changeApiKey")}
            </button>
          </div>
        </>
      ) : step === 0 ? (
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
          {automation.connected && (
            <button
              type="button"
              onClick={() => {
                setChangingKey(false);
                setKey("");
                setProjects([]);
                setProject("");
              }}
            >
              {t("cancel")}
            </button>
          )}
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
          {!draft.notifyEmail && !draft.notifyTelegram && (
            <Notice>{t("needNotification")}</Notice>
          )}
          {draft.notifyTelegram && (
            <>
              {connections.some(
                (c: Connection) =>
                  c.service === "telegram" && c.status === "ACTIVE",
              ) &&
                !addingBot && (
                  <>
                    <ConnectionSelect
                      service="telegram"
                      value={draft.telegram}
                      connections={connections}
                      onChange={(telegram) => edit({ ...draft, telegram })}
                    />
                    <Notice>
                      {t(
                        reusedBot || botReady
                          ? "existingBotReady"
                          : "existingBotNeedsSetup",
                      )}
                    </Notice>
                  </>
                )}
              <button onClick={() => setAddingBot(!addingBot)}>
                {t(addingBot ? "keepExistingBot" : "addDifferentBot")}
              </button>
              {addingBot && (
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
                        setBotReady(false);
                        setBotStarted(false);
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
                </>
              )}
              {botUrl && (
                <>
                  <External href={botUrl}>{t("openBot")}</External>
                  <p role="status">
                    {botReady
                      ? t("testSent")
                      : botStarted
                        ? t("botStarted")
                        : t("waitingStart")}
                  </p>
                  <button
                    disabled={!botStarted || botReady || working}
                    onClick={async () => {
                      setWorking(true);
                      try {
                        await api(
                          `/api/automations/${automation.id}/telegram-test`,
                          "POST",
                          {},
                        );
                        setBotReady(true);
                      } catch (e) {
                        setError(e);
                      } finally {
                        setWorking(false);
                      }
                    }}
                  >
                    {t("sendTest")}
                  </button>
                </>
              )}
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
          {flows.length > 0 &&
            !automation.deployed &&
            automation.intent === "existing" && (
              <div className="existing-setups">
                <h2>{t("existingAutomation")}</h2>
                <p>{t("keepExistingSetup")}</p>
                {flows.map((f: any) => (
                  <label className="existing-setup" key={f.choice}>
                    <input
                      type="radio"
                      name="existing-flow"
                      checked={flowChoice === f.choice}
                      onChange={() => setFlowChoice(f.choice)}
                    />
                    <span>
                      <strong>{f.name}</strong>
                      <small>
                        {f.config.accounts
                          .map((a: Account) => "@" + a.username)
                          .join(" · ")}{" "}
                        · {t(f.status)}
                      </small>
                    </span>
                  </label>
                ))}
                {selectedFlow && (
                  <button
                    className="primary"
                    disabled={working}
                    onClick={async () => {
                      if (selectedFlow.websiteAutomationId) {
                        navigate(
                          `/automations/${selectedFlow.websiteAutomationId}/summary`,
                        );
                        return;
                      }
                      setWorking(true);
                      setError(null);
                      try {
                        await flush();
                        await api(
                          `/api/automations/${automation.id}/adopt`,
                          "POST",
                          { choice: flowChoice },
                        );
                        await load();
                        navigate(`/automations/${automation.id}/summary`);
                      } catch (e) {
                        setError(e);
                      } finally {
                        setWorking(false);
                      }
                    }}
                  >
                    {t(
                      selectedFlow.websiteAutomationId
                        ? "open"
                        : "useExistingAutomation",
                    )}
                  </button>
                )}
              </div>
            )}
          {(automation.deployed || automation.intent === "new") && (
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
              {!automation.deployed && (
                <>
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
            </>
          )}
          {!automation.deployed &&
            automation.intent === "existing" &&
            !flows.length && (
              <Notice>
                No compatible saved flow was found. Refresh the
                existing-automation list or repair its connections. This setup
                will not create a new flow.
              </Notice>
            )}
          <div className="setup-options">
            {flows.length > 0 &&
              !automation.deployed &&
              automation.intent === "existing" && (
                <button
                  onClick={async () => {
                    setWorking(true);
                    try {
                      await flush();
                      await api(
                        `/api/automations/${automation.id}/creation-intent`,
                        "POST",
                        { intent: "new" },
                      );
                      await load();
                      setFlowChoice("");
                      setStep(2);
                    } catch (e) {
                      setError(e);
                    } finally {
                      setWorking(false);
                    }
                  }}
                >
                  {t(
                    flowChoice
                      ? "createSeparateAutomation"
                      : "useExistingAutomation",
                  )}
                </button>
              )}
            <button onClick={() => setStep(1)}>
              {t("changeNotifications")}
            </button>
            <button onClick={() => setStep(2)}>{t("reviewAccounts")}</button>
          </div>
        </>
      )}
      {!discovering && (
        <div className="wizard-actions">
          {step > 0 && (
            <button
              onClick={() =>
                automation.deployed
                  ? navigate(`/automations/${automation.id}/summary`)
                  : setStep(step - 1)
              }
            >
              {t("back")}
            </button>
          )}
          {automation.deployed && step > 0 && (
            <button
              className="primary"
              disabled={busy || !ready}
              onClick={async () => {
                if (await action("deploy"))
                  navigate(`/automations/${automation.id}/summary`);
              }}
            >
              {t("apply")}
            </button>
          )}
          {!automation.deployed && step > 0 && step < 3 && (
            <button
              className="primary"
              disabled={
                step === 1
                  ? (!draft.notifyEmail && !draft.notifyTelegram) ||
                    (draft.notifyTelegram && !botReady && !reusedBot)
                  : !ready
              }
              onClick={() => void next()}
            >
              {t("continue")}
              <ArrowRight size={16} />
            </button>
          )}
        </div>
      )}
    </section>
  );
}
function Accounts({
  saveAccount,
  draft,
  edit,
  connections,
  refresh,
  connectionsUrl,
  compact = false,
  flush,
  updateAutomation,
  busy = false,
  deployed = false,
}: {
  saveAccount?: (a: Account) => Promise<void>;
  draft: Config;
  edit: (v: Config) => void;
  connections: Connection[];
  refresh: () => void;
  connectionsUrl: string;
  compact?: boolean;
  flush: () => Promise<void>;
  updateAutomation?: () => Promise<boolean>;
  busy?: boolean;
  deployed?: boolean;
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
  const [addError, setAddError] = useState<unknown>(null),
    [addingNow, setAddingNow] = useState(false),
    [category, setCategory] = useState<Account["category"]>("other"),
    [daily, setDaily] = useState(3);
  useEffect(() => {
    if (!adding) return;
    void refresh();
    const check = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(check, 10000);
    window.addEventListener("focus", check);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", check);
    };
  }, [adding]);
  useEffect(() => {
    if (available.length === 1 && !available.some((c) => c.id === chosen)) {
      setChosen(available[0].id);
      setCategory(newPinterestAccount(available[0]).category);
    }
  }, [connections, adding]);
  const add = async () => {
    const c = available.find((c) => c.id === chosen);
    if (!c) return;
    setAddingNow(true);
    setAddError(null);
    try {
      const account = {
        ...newPinterestAccount(c),
        category,
        pinsPerDay: daily,
        hours: spreadHours(daily),
        schedule: {
          mode: "varied" as const,
          start: "09:00",
          end: "21:00",
          minSpacing: Math.min(120, Math.floor(720 / Math.max(1, daily - 1))),
          times: [],
        },
      };
      edit({ ...draft, accounts: [...draft.accounts, account] });
      await flush();
      setAdding(false);
      setChosen("");
      if (deployed && updateAutomation) await updateAutomation();
    } catch (e) {
      setAddError(e);
    } finally {
      setAddingNow(false);
    }
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
          apply={deployed ? updateAutomation : undefined}
          key={account.id}
          account={account}
          compact={compact}
          update={async (next) => {
            if (saveAccount) await saveAccount(next);
            else {
              edit({
                ...draft,
                accounts: draft.accounts.map((a) =>
                  a.id === account.id ? next : a,
                ),
              });
              await flush();
            }
          }}
        />
      ))}
      <Modal title={t("addAccount")} open={adding} onOpenChange={setAdding}>
        {addError != null && <ErrorBox error={addError} />}
        {addingNow ? (
          <p role="status">Saving this Pinterest account…</p>
        ) : available.length ? (
          <>
            <p>{t("foundPinterest")}</p>
            <Field label={t("select")}>
              <select
                value={chosen}
                onChange={(e) => setChosen(e.target.value)}
              >
                <option value="">{t("select")}</option>
                {available.map((c) => (
                  <option key={c.id} value={c.id}>
                    @{c.identity.replace(/^@/, "")}
                  </option>
                ))}
              </select>
            </Field>
            <div className="form-grid">
              <Field label={t("category")}>
                <select
                  value={category}
                  onChange={(e) =>
                    setCategory(e.target.value as Account["category"])
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
                  value={daily}
                  onChange={(e) => setDaily(Number(e.target.value))}
                >
                  {Array.from({ length: 18 }, (_, n) => (
                    <option key={n} value={n + 1}>
                      {n + 1}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <p className="muted">
              {spreadHours(daily)
                .map((h) => String(h).padStart(2, "0") + ":00")
                .join(" / ")}
            </p>
            <button
              className="primary"
              disabled={!chosen || addingNow || busy}
              onClick={() => void add()}
            >
              {t(
                addingNow || busy
                  ? "loading"
                  : deployed
                    ? "addAndUpdate"
                    : "addAccount",
              )}
            </button>
            <details>
              <summary>{t("connectAnotherPinterest")}</summary>
              <p>{t("pinterestConnectionGuide")}</p>
              <External href={connectionsUrl}>{t("connectPinterest")}</External>
            </details>
          </>
        ) : (
          <>
            <p>{t("pinterestConnectionGuide")}</p>
            <External href={connectionsUrl}>{t("connectPinterest")}</External>
            <p role="status">{t("waitingPinterest")}</p>
            <button onClick={refresh}>{t("refresh")}</button>
          </>
        )}
      </Modal>
    </section>
  );
}
function AccountCard({
  account,
  update,
  flush,
  apply,
}: {
  account: Account;
  update: (a: Account) => Promise<void>;
  compact: boolean;
  flush: () => Promise<void>;
  apply?: () => Promise<boolean>;
}) {
  const { t } = useWorkspace();
  const [expanded, setExpanded] = useState(false),
    [value, setValue] = useState(account),
    [working, setWorking] = useState(false),
    [error, setError] = useState<unknown>(null);
  useEffect(() => {
    setValue(account);
  }, [account]);
  const normalize = (a: Account) =>
    JSON.stringify({
      ...a,
      niche: a.niche.trim(),
      general: !a.niche.trim(),
      ...(a.schedule
        ? {
            schedule: {
              ...a.schedule,
              times: [...new Set(a.schedule.times)].sort(),
            },
          }
        : {}),
      hours: [...a.hours].sort((a, b) => a - b),
    });
  const [fixedText, setFixedText] = useState(
    (
      account.schedule?.times ||
      account.hours.map((h) => `${String(h).padStart(2, "0")}:00`)
    ).join(", "),
  );
  const dirty = normalize(value) !== normalize(account);
  const setAccountEdits = useContext(AccountEditsContext);
  useEffect(() => {
    setAccountEdits((old) => ({ ...old, [account.id]: dirty }));
    return () => setAccountEdits((old) => ({ ...old, [account.id]: false }));
  }, [dirty, account.id, setAccountEdits]);
  useEffect(() => {
    if (!dirty) return;
    const prevent = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [dirty]);
  const change = (patch: Partial<Account>) => setValue({
    ...value, ...patch,
    ...(patch.pinsPerDay !== undefined && patch.pinsPerDay !== value.pinsPerDay
      ? { legacyDailyCap: undefined } : {}),
  });
  return (
    <article className={`panel account-card ${dirty ? "has-changes" : ""}`}>
      <div className="account-heading">
        <span className="pinterest-mark">P</span>
        <div>
          <h3>@{account.username}</h3>
          <span className="muted">
            {account.pinsPerDay} pins each day ·{" "}
            {account.on ? "Posting on" : "Posting off"}
          </span>
        </div>
        <button
          onClick={() => {
            if (
              expanded &&
              dirty &&
              !window.confirm("Discard unsaved account changes?")
            )
              return;
            setValue(account);
            setFixedText(
              (
                account.schedule?.times ||
                account.hours.map((h) => `${String(h).padStart(2, "0")}:00`)
              ).join(", "),
            );
            setExpanded(!expanded);
            setError(null);
          }}
          aria-expanded={expanded}
        >
          {expanded ? "Hide settings" : "Settings"}
        </button>
      </div>
      {expanded && (
        <div className="account-body">
          {error != null && <ErrorBox error={error} />}
          <div className="form-grid">
            <Field label="Category">
              <select
                value={value.category}
                onChange={(e) =>
                  change({ category: e.target.value as Account["category"] })
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
            <Field label="Pins each day">
              <input
                type="number"
                min="1"
                max="1440"
                step="1"
                value={value.pinsPerDay}
                onChange={(e) => {
                  const n = Number(e.target.value);
                  const hours = spreadHours(n);
                  if (
                    (value.schedule?.mode || "fixed") === "fixed" &&
                    Number.isInteger(n) &&
                    n >= 1 &&
                    n <= 18
                  ) {
                    const times = hours.map(
                      (h) => `${String(h).padStart(2, "0")}:00`,
                    );
                    setFixedText(times.join(", "));
                    change({
                      pinsPerDay: n,
                      hours,
                      schedule: {
                        mode: "fixed",
                        start: "00:00",
                        end: "23:59",
                        minSpacing: value.schedule?.minSpacing || 1,
                        times,
                      },
                    });
                  } else
                    change({ pinsPerDay: n, ...(n <= 18 ? { hours } : {}) });
                }}
              />
            </Field>
          </div>
          <Field label="What do you post about? (optional)">
            <input
              value={value.niche}
              maxLength={300}
              onChange={(e) =>
                change({
                  niche: e.target.value,
                  general: !e.target.value.trim(),
                })
              }
            />
          </Field>
          <div className="schedule-editor">
            <Field label="Posting times">
              <select
                value={value.schedule?.mode || "fixed"}
                onChange={(e) =>
                  change({
                    schedule: {
                      mode: e.target.value as "varied" | "fixed",
                      start: "09:00",
                      end: "21:00",
                      minSpacing: 120,
                      times: value.hours.map(
                        (h) => `${String(h).padStart(2, "0")}:00`,
                      ),
                    },
                  })
                }
              >
                <option value="varied">Varied times each day</option>
                <option value="fixed">Choose exact times</option>
              </select>
            </Field>
            {(value.schedule?.mode || "fixed") === "varied" ? (
              <div className="form-grid">
                <Field label="Start">
                  <input
                    type="time"
                    value={value.schedule?.start || "09:00"}
                    onChange={(e) =>
                      change({
                        schedule: { ...value.schedule!, start: e.target.value },
                      })
                    }
                  />
                </Field>
                <Field label="End">
                  <input
                    type="time"
                    value={value.schedule?.end || "21:00"}
                    onChange={(e) =>
                      change({
                        schedule: { ...value.schedule!, end: e.target.value },
                      })
                    }
                  />
                </Field>
              </div>
            ) : (
              <Field label="Exact times, separated by commas">
                <input
                  value={fixedText}
                  placeholder="09:15, 15:30, 20:45"
                  onChange={(e) => {
                    setFixedText(e.target.value);
                    const times = e.target.value
                      .split(/[,\n]/)
                      .map((t) => t.trim())
                      .filter(Boolean);
                    change({
                      schedule: {
                        mode: "fixed",
                        start: "00:00",
                        end: "23:59",
                        minSpacing: value.schedule?.minSpacing || 1,
                        times,
                      },
                      pinsPerDay: times.length,
                    });
                  }}
                />
              </Field>
            )}
            <Field label="Minimum minutes between posts">
              <input
                type="number"
                min="1"
                step="1"
                value={value.schedule?.minSpacing || 1}
                onChange={(e) =>
                  change({
                    schedule: {
                      mode: "fixed",
                      start: "09:00",
                      end: "21:00",
                      times: value.hours.map(
                        (h) => `${String(h).padStart(2, "0")}:00`,
                      ),
                      ...value.schedule,
                      minSpacing: Number(e.target.value),
                    },
                  })
                }
              />
            </Field>
            <p className="inline-help">
              Start with 3 original pins a day, spaced by at least 2 hours.
              Adjust for your content and results. Varied times are saved once
              for each day.
            </p>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={value.on}
              onChange={(e) => change({ on: e.target.checked })}
            />
            Allow posting for this account
          </label>
          {dirty ? (
            <div className="button-row">
              <button
                className="save-changes"
                disabled={working}
                onClick={async () => {
                  setWorking(true);
                  setError(null);
                  try {
                    await update({ ...value, niche: value.niche.trim() });
                    if (apply && !(await apply()))
                      throw new Error(
                        "Saved on the website. Activepieces still needs the update; use Update automation to retry.",
                      );
                    setExpanded(false);
                  } catch (e) {
                    setError(e);
                  } finally {
                    setWorking(false);
                  }
                }}
              >
                {working ? "Saving…" : "Save changes"}
              </button>
              <button
                disabled={working}
                onClick={() => {
                  setValue(account);
                  setFixedText(
                    (
                      account.schedule?.times ||
                      account.hours.map(
                        (h) => `${String(h).padStart(2, "0")}:00`,
                      )
                    ).join(", "),
                  );
                  setError(null);
                }}
              >
                Cancel
              </button>
            </div>
          ) : null}
        </div>
      )}
    </article>
  );
}
function Settings({ draft, edit, automation, rename, connections }: any) {
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
            await rename(name);
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
      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.notifyEmail}
          onChange={(e) => edit({ ...draft, notifyEmail: e.target.checked })}
        />
        {t("gmail")}
      </label>
      <label className="check-row">
        <input
          type="checkbox"
          checked={draft.emailEveryPin}
          onChange={(e) => edit({ ...draft, emailEveryPin: e.target.checked })}
        />
        {t("eachPinAlert")}
      </label>
      <Field label={t("reportTime")}>
        <select
          value={draft.reportHour}
          onChange={(e) =>
            edit({ ...draft, reportHour: Number(e.target.value) })
          }
        >
          {Array.from({ length: 18 }, (_, n) => n + 6).map((h) => (
            <option key={h} value={h}>
              {String(h).padStart(2, "0")}:00
            </option>
          ))}
        </select>
      </Field>
      <Link
        className="button"
        to={`/automations/${automation.id}/setup?notifications=1`}
      >
        {t("changeNotifications")}
      </Link>
      <details>
        <summary>{t("logins")}</summary>
        {[
          "google",
          ...(draft.notifyEmail ? ["gmail"] : []),
          ...(draft.notifyTelegram ? ["telegram"] : []),
        ].map((service) => (
          <ConnectionSelect
            key={service}
            service={service}
            connections={connections}
            value={draft[service]}
            onChange={(value) =>
              edit({
                ...draft,
                [service]: value,
                ...(service === "google"
                  ? {
                      botEmail:
                        connections.find((c: Connection) => c.id === value)
                          ?.identity || draft.botEmail,
                    }
                  : {}),
              })
            }
          />
        ))}
      </details>
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
                  <span className="positive">
                    <Check size={18} aria-hidden="true" />
                    {t("runFinished")}
                  </span>
                ) : r.status === "RUNNING" ? (
                  t("starting")
                ) : (
                  <Link to={`/automations/${id}/setup?connections=1`}>
                    {t("checkLogins")}
                  </Link>
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </section>
  );
}
function PackageDownload({ batch }: { batch: any }) {
  const { t } = useWorkspace();
  const [busy, setBusy] = useState(false),
    [failed, setFailed] = useState(false);
  if (!batch.referenceCount) return null;
  return (
    <div>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          setFailed(false);
          try {
            await downloadBatch(batch);
          } catch {
            setFailed(true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? t("loading") : t("downloadPackage")}
      </button>
      {failed && <p role="alert">{t("error")}</p>}
    </div>
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
  const navigate = useNavigate();
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
              onClick={() =>
                navigate(`/automations/${id}/pins`, {
                  state: {
                    accountId: batch.accountId,
                    input: batch.input,
                    variant: crypto.randomUUID(),
                  },
                })
              }
            >
              {t("similar")}
            </button>
            <button
              onClick={async () => {
                if (!window.confirm(t("confirmDeleteBatch"))) return;
                try {
                  await api(
                    `/api/automations/${id}/batches/${batch.id}`,
                    "DELETE",
                  );
                  await refresh();
                } catch (e) {
                  setError(e);
                }
              }}
            >
              {t("remove")}
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
            <PackageDownload batch={selected} />
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
  const location = useLocation();
  const preset = location.state as any;
  const [accountId, setAccountId] = useState(
      preset?.accountId || draft.accounts[0]?.id || "",
    ),
    [sources, setSources] = useState<any[]>([]),
    [notes, setNotes] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState<unknown>(null),
    [scanning, setScanning] = useState<string | null>(null);
  const variant = useRef(preset?.variant);
  const key = `automation-request:${automation.id}:${accountId}`;
  const loadedKey = useRef("");
  useEffect(() => {
    let stored: any = null;
    try {
      stored = JSON.parse(localStorage.getItem(key) || "null");
    } catch {}
    const initial =
      preset?.input?.sources ||
      preset?.sources ||
      preset?.input?.lines?.map((line: any) => ({
        kind: line.kind === "free" ? "free" : "product",
        count: line.count,
        url: line.url || "",
        products: [],
        perProduct: 3,
        categoryCount: 0,
      }));
    setSources(
      stored?.sources ||
        initial?.map((s: any) => ({ ...s, id: crypto.randomUUID() })) || [
          {
            id: crypto.randomUUID(),
            kind: "free",
            count: 5,
            url: "",
            products: [],
            perProduct: 3,
            categoryCount: 0,
          },
        ],
    );
    setNotes(
      (preset?.variant ? undefined : stored?.notes) ||
        preset?.input?.notes ||
        "",
    );
    setError(null);
    setSelected(null);
    loadedKey.current = key;
  }, [key]);
  useEffect(() => {
    if (loadedKey.current === key && sources.length)
      localStorage.setItem(key, JSON.stringify({ sources, notes }));
  }, [key, sources, notes]);
  const change = (id: string, patch: any) =>
    setSources((ss) => ss.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const total = sources.reduce(
    (n, s) =>
      n +
      (s.kind === "free" || s.kind === "product"
        ? Number(s.count)
        : s.products.length * Number(s.perProduct) + Number(s.categoryCount)),
    0,
  );
  const chosen = draft.accounts.find((a) => a.id === accountId);
  return (
    <section className="content-workspace">
      <div className="section-heading">
        <div>
          <h2>Make your next batch</h2>
          <p>Mix sources. Choose amounts. Keep your style.</p>
        </div>
      </div>
      {!draft.accounts.length ? (
        <Empty title="Add a Pinterest account first">
          <Link
            className="button primary"
            to={`/automations/${automation.id}/accounts?add=1`}
          >
            Add Pinterest account
          </Link>
        </Empty>
      ) : (
        <>
          {error != null && <ErrorBox error={error} />}
          <Field label="Pinterest account">
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
          <div className="source-stack">
            {sources.map((s, index) => (
              <article className="panel source-row" key={s.id}>
                <div className="section-heading">
                  <span className="eyebrow">Source {index + 1}</span>
                  <button
                    aria-label={`Remove source ${index + 1}`}
                    onClick={() =>
                      setSources((ss) => ss.filter((x) => x.id !== s.id))
                    }
                  >
                    <X size={16} />
                  </button>
                </div>
                <div className="form-grid">
                  <Field label="Make pins for">
                    <select
                      value={s.kind}
                      onChange={(e) =>
                        change(s.id, {
                          kind: e.target.value,
                          products: [],
                          discovered: [],
                          notice: "",
                        })
                      }
                    >
                      <option value="free">Without links</option>
                      <option value="product">One product</option>
                      <option value="category">A category</option>
                      <option value="catalog">My website or store</option>
                    </select>
                  </Field>
                  {["free", "product"].includes(s.kind) && (
                    <Field label="Number of pins">
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={s.count}
                        onChange={(e) =>
                          change(s.id, {
                            count:
                              e.target.value === ""
                                ? ""
                                : Number(e.target.value),
                          })
                        }
                      />
                    </Field>
                  )}
                </div>
                {s.kind !== "free" && (
                  <Field
                    label={
                      s.kind === "product"
                        ? "Exact product link"
                        : s.kind === "category"
                          ? "Category link"
                          : "Website or store link"
                    }
                  >
                    <input
                      type="url"
                      placeholder="https://"
                      value={s.url}
                      maxLength={2048}
                      onChange={(e) =>
                        change(s.id, {
                          url: e.target.value,
                          products: [],
                          discovered: [],
                          notice: "",
                        })
                      }
                    />
                  </Field>
                )}
                {["category", "catalog"].includes(s.kind) && (
                  <>
                    <div className="button-row">
                      <button
                        disabled={scanning !== null || !s.url}
                        onClick={async () => {
                          setScanning(s.id);
                          setError(null);
                          try {
                            const r = await api(
                              `/api/automations/${automation.id}/catalog`,
                              "POST",
                              { url: s.url, kind: s.kind },
                            );
                            change(s.id, {
                              discovered: r.products,
                              notice: r.notice,
                            });
                          } catch (e) {
                            setError(e);
                          } finally {
                            setScanning(null);
                          }
                        }}
                      >
                        {scanning === s.id
                          ? "Finding links…"
                          : "Find product links"}
                      </button>
                      <span className="muted">
                        {s.products.length} selected
                      </span>
                    </div>
                    {s.notice && <p className="inline-help">{s.notice}</p>}
                    {s.discovered?.length > 0 && (
                      <div className="product-choices">
                        {s.discovered.map((p: any) => (
                          <label className="check-row" key={p.url}>
                            <input
                              type="checkbox"
                              checked={s.products.some(
                                (x: any) => x.url === p.url,
                              )}
                              onChange={(e) =>
                                change(s.id, {
                                  products: e.target.checked
                                    ? [...s.products, p]
                                    : s.products.filter(
                                        (x: any) => x.url !== p.url,
                                      ),
                                })
                              }
                            />
                            <span>
                              {p.title}
                              <small>{p.url}</small>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                    <Field label="Product links (one per line)">
                      <textarea
                        rows={3}
                        placeholder="Add missing product links here"
                        value={s.manual || ""}
                        onChange={(e) => {
                          const manual = e.target.value;
                          const oldManual = (s.manual || "")
                            .split(/\n/)
                            .map((x: string) => x.trim());
                          const kept = s.products.filter(
                            (p: any) => !oldManual.includes(p.url),
                          );
                          const urls = [
                            ...new Set(
                              manual
                                .split(/\n/)
                                .map((x) => x.trim())
                                .filter(Boolean),
                            ),
                          ];
                          change(s.id, {
                            manual,
                            products: [
                              ...kept,
                              ...urls
                                .filter(
                                  (url) =>
                                    !kept.some((p: any) => p.url === url),
                                )
                                .map((url) => ({ url, title: "" })),
                            ],
                          });
                        }}
                      />
                    </Field>
                    <div className="form-grid">
                      <Field label="Pins for each selected product">
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={s.perProduct}
                          onChange={(e) =>
                            change(s.id, {
                              perProduct:
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                      <Field
                        label={
                          s.kind === "category"
                            ? "Pins for the whole category"
                            : "Pins for the store overview"
                        }
                      >
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={s.categoryCount}
                          onChange={(e) =>
                            change(s.id, {
                              categoryCount:
                                e.target.value === ""
                                  ? ""
                                  : Number(e.target.value),
                            })
                          }
                        />
                      </Field>
                    </div>
                    <p className="inline-help">
                      Product pins link to each product. Overview pins link to
                      this {s.kind === "category" ? "category" : "store"}.
                    </p>
                  </>
                )}
              </article>
            ))}
          </div>
          <button
            onClick={() =>
              setSources((ss) => [
                ...ss,
                {
                  id: crypto.randomUUID(),
                  kind: "product",
                  count: 5,
                  url: "",
                  products: [],
                  perProduct: 3,
                  categoryCount: 0,
                },
              ])
            }
          >
            <Plus size={16} />
            Add another source
          </button>
          <details className="panel creative-options">
            <summary>
              Style and extra instructions{" "}
              <span className="muted">Optional</span>
            </summary>
            <Field label="Anything to focus on?">
              <textarea
                rows={3}
                maxLength={4000}
                value={notes}
                placeholder="For example: summer bags, bold headlines, warm backgrounds"
                onChange={(e) => setNotes(e.target.value)}
              />
            </Field>
            <References
              key={accountId}
              accountId={accountId}
              flush={flush}
              t={t}
            />
          </details>
          <div className="request-footer">
            <div>
              <strong>
                {Number.isSafeInteger(total) && total > 0
                  ? total.toLocaleString()
                  : "—"}{" "}
                pins
              </strong>
              <small>
                Creation amount · separate from {chosen?.pinsPerDay} daily posts
              </small>
            </div>
            <button
              className="primary"
              disabled={
                busy ||
                !sources.length ||
                !Number.isSafeInteger(total) ||
                total < 1
              }
              onClick={async () => {
                setBusy(true);
                setError(null);
                try {
                  await flush();
                  const r = await api(
                    `/api/automations/${automation.id}/batches`,
                    "POST",
                    {
                      accountId,
                      variant: variant.current,
                      notes,
                      sources: sources.map(
                        ({ id, manual, discovered, notice, ...s }) => s,
                      ),
                    },
                  );
                  setSelected(r.batch);
                } catch (e) {
                  setError(e);
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Preparing…" : "Review request"}
              <ArrowRight size={16} />
            </button>
          </div>
          {!automation.sheetUrl && (
            <p className="inline-help">
              Finish setup to connect this request to its Google Sheet.
            </p>
          )}
          <Modal
            title="Your content request"
            open={Boolean(selected)}
            onOpenChange={(open) => !open && setSelected(null)}
          >
            {selected && (
              <>
                <p>
                  {selected.total.toLocaleString()} pins for @
                  {selected.username}. The prompt creates the content; copying
                  it does not queue or publish pins.
                </p>
                <div className="destination-review">
                  {selected.input.destinations?.map((d: any, i: number) => (
                    <div className="review-row" key={i}>
                      <strong>
                        {d.count} · {d.kind}
                      </strong>
                      <span>{d.url || "No destination link"}</span>
                    </div>
                  ))}
                </div>
                {selected.postingOrder?.length > 0 && (
                  <>
                    <p>One pin per product, then repeat. Products stay mixed in the new queue.</p>
                    <details>
                      <summary>See the first {selected.postingOrder.length} posting slots</summary>
                      <ol>
                        {selected.postingOrder.map((pin: any) => (
                          <li key={pin.sequence}>{pin.title} · variation {pin.productPin}</li>
                        ))}
                      </ol>
                    </details>
                  </>
                )}
                <PackageDownload batch={selected} />
                <details>
                  <summary>Read the prompt</summary>
                  <pre className="prompt-preview">{selected.prompt}</pre>
                </details>
                <button
                  className="primary"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(selected.prompt);
                      await api(
                        `/api/automations/${automation.id}/batches/${selected.id}/copy`,
                        "POST",
                        {},
                      );
                      notify(
                        "Prompt copied. Create and review the pins before publishing.",
                      );
                    } catch (e) {
                      setError(e);
                    }
                  }}
                >
                  Copy prompt
                </button>
              </>
            )}
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
                {m.automations} · {t("automations")} · {m.accounts}{" "}
                {t("accounts")} · {m.deployed} {t("deployedLabel")} ·{" "}
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
  <RouterProvider
    router={createBrowserRouter([{ path: "*", element: <App /> }])}
  />,
);
