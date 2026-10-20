import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, RefreshCw } from "lucide-react";
import { api } from "./api";
import type { Automation, Config } from "./types";
export function Queue({
  automation,
  config,
  action,
  busy,
}: {
  automation: Automation;
  config: Config;
  action: (name: string) => Promise<boolean>;
  busy: boolean;
}) {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState<unknown>(null),
    [working, setWorking] = useState(false),
    [accountId, setAccountId] = useState(config.accounts[0]?.id || ""),
    [selected, setSelected] = useState<any>(null),
    [patch, setPatch] = useState<any>({}),
    [notice, setNotice] = useState("");
  const pollUntil = useRef(0);
  const load = async () => {
    try {
      setData(await api(`/api/automations/${automation.id}/queue`));
      setError(null);
    } catch (e) {
      setError(e);
    }
  };
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        pollUntil.current > Date.now()
      )
        void load();
    }, 5000);
    return () => clearInterval(interval);
  }, [automation.id]);
  const run = async (sync: boolean) => {
    if (
      !sync &&
      !window.confirm(
        "Publish the next ready pin for this account now? Your normal daily cap still applies.",
      )
    )
      return;
    setWorking(true);
    setError(null);
    try {
      await api(`/api/automations/${automation.id}/queue/run`, "POST", {
        requestId: crypto.randomUUID(),
        accountId,
        sync,
      });
      setNotice(
        sync
          ? "Queue sync requested. This does not publish pins."
          : "Run requested. Check Activity and the confirmed pin result.",
      );
      pollUntil.current = Date.now() + 120000;
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setWorking(false);
    }
  };
  const snap = data?.snapshots.find((s: any) => s.accountId === accountId),
    counts = snap?.counts,
    total = counts
      ? (Object.values(counts).reduce((a: any, n: any) => a + n, 0) as number)
      : 0,
    ready = counts?.Ready || 0,
    published = counts?.Done || 0,
    review = (counts?.["Needs review"] || 0) + (counts?.Error || 0),
    future = (data?.schedule || []).filter(
      (s: any) => s.account_id === accountId && s.status === "pending",
    ),
    profile = config.accounts.find((a) => a.id === accountId),
    stale = snap && Date.now() / 1000 - snap.syncedAt > 900;
  const command = async (pin: any, changes: any) => {
    setWorking(true);
    setError(null);
    try {
      const r = await api(
        `/api/automations/${automation.id}/queue/commands`,
        "POST",
        {
          requestId: crypto.randomUUID(),
          accountId,
          pinId: pin.id,
          patch: changes,
        },
      );
      setNotice(r.message);
      setSelected(null);
      await load();
      await run(true);
    } catch (e) {
      setError(e);
    } finally {
      setWorking(false);
    }
  };
  return (
    <section className="queue-workspace">
      <div className="queue-top">
        <div>
          <h2>Your next pins, in order.</h2>
          <p>Review your content. Keep the queue moving.</p>
        </div>
        <Link
          className="button primary"
          to={`/automations/${automation.id}/pins`}
        >
          New pins
          <ArrowRight size={16} />
        </Link>
      </div>
      {automation.status === "draft" ? (
        <div className="empty">
          <h3>Connect your first account</h3>
          <p>Finish setup to see its queue and posting plan.</p>
          <Link
            className="button primary"
            to={`/automations/${automation.id}/setup`}
          >
            Finish setup
          </Link>
        </div>
      ) : (
        <>
          <div className="queue-toolbar">
            <label className="field">
              <span>Pinterest account</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
              >
                {config.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    @{a.username}
                  </option>
                ))}
              </select>
            </label>
            <button disabled={working || busy} onClick={() => void load()}>
              <RefreshCw size={15} />
              Refresh status
            </button>
          </div>
          {error != null && (
            <div className="error" role="alert">
              {error instanceof Error
                ? error.message
                : "This action could not finish."}
              <button onClick={() => void load()}>Try again</button>
            </div>
          )}
          {notice && (
            <p className="inline-help" role="status">
              {notice}
            </p>
          )}
          {!data ? (
            <div className="empty" role="status">
              Reading your queue…
            </div>
          ) : !snap ? (
            <div className="empty">
              <h3>No queue sync yet</h3>
              <p>
                The first sync reads the actual account Sheet. Missing data is
                not an empty queue.
              </p>
              <button
                disabled={working || !data.schedulerEnabled}
                onClick={() => void run(true)}
              >
                Sync queue
              </button>
              {!data.schedulerEnabled && (
                <p>
                  Update this automation to connect the queue and new schedule.
                </p>
              )}
            </div>
          ) : (
            <>
              <div className="queue-stats">
                <div>
                  <span>Ready in Sheet</span>
                  <strong>{ready.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Published in Sheet</span>
                  <strong>{published.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Total tracked</span>
                  <strong>{total.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Needs review</span>
                  <strong>{review.toLocaleString()}</strong>
                </div>
              </div>
              <div className="panel coverage">
                <div className="section-heading">
                  <strong>
                    {profile?.on && profile.pinsPerDay
                      ? `About ${Math.floor(ready / profile.pinsPerDay)} days ready`
                      : "Posting is off"}
                  </strong>
                  <small>
                    Last synced{" "}
                    {new Date(snap.syncedAt * 1000).toLocaleString("en")}
                  </small>
                </div>
                <div
                  className="coverage-track"
                  role="img"
                  aria-label={`${published} published and ${ready} ready out of ${total} tracked pins`}
                >
                  <span
                    style={{
                      width: `${total ? (100 * published) / total : 0}%`,
                    }}
                  />
                  <i
                    style={{ width: `${total ? (100 * ready) / total : 0}%` }}
                  />
                </div>
                <p className="inline-help">
                  Counts reflect recorded Sheet rows. Ready pins still pass
                  publishing checks.{" "}
                  {stale ? "This view is stale; sync before editing. " : ""}
                  {!snap.complete ? "The source scan is incomplete. " : ""}
                  Preview shows up to 500 pins. Coverage is an estimate,
                  including future-dated rows.
                </p>
              </div>
              <div className="queue-content">
                <div>
                  <div className="section-heading">
                    <h3>Content</h3>
                    <button disabled={working} onClick={() => void run(true)}>
                      Sync queue
                    </button>
                  </div>
                  {!snap.pins.length ? (
                    <div className="empty">
                      <h3>No recorded pins</h3>
                      <Link
                        className="button"
                        to={`/automations/${automation.id}/pins`}
                      >
                        Create a content request
                      </Link>
                    </div>
                  ) : (
                    <div className="queue-pins">
                      {snap.pins.map((p: any) => (
                        <article className="panel pin-item" key={p.id}>
                          <div className="pin-cover">
                            <span>{p.status}</span>
                            <strong>{p.title || "Untitled pin"}</strong>
                            <small>{p.board || "Board not set"}</small>
                          </div>
                          <div className="pin-detail">
                            <span className="eyebrow">{p.batch || p.id}</span>
                            <p>{p.link || "No destination link"}</p>
                            {p.error && (
                              <p className="image-error">{p.error}</p>
                            )}
                            <div className="button-row">
                              {p.pinUrl &&
                              /^https:\/\/(www\.)?pinterest\.com\/pin\/\d+\/?$/.test(
                                p.pinUrl,
                              ) ? (
                                <a
                                  className="button"
                                  href={p.pinUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  View pin
                                </a>
                              ) : (
                                !["Posting", "Done"].includes(p.status) && (
                                  <>
                                    <button
                                      disabled={stale || working}
                                      onClick={() => {
                                        setSelected(p);
                                        setPatch({
                                          title: p.title,
                                          description: p.description,
                                          link: p.link,
                                        });
                                      }}
                                    >
                                      Edit
                                    </button>
                                    {p.status === "Skip" ? (
                                      <button
                                        disabled={stale || working}
                                        onClick={() =>
                                          void command(p, { status: "Draft" })
                                        }
                                      >
                                        Restore to review
                                      </button>
                                    ) : (
                                      <>
                                        <button
                                          disabled={stale || working}
                                          onClick={() => {
                                            if (
                                              window.confirm(
                                                "Remove this unposted pin from the queue? It stays recoverable.",
                                              )
                                            )
                                              void command(p, {
                                                status: "Skip",
                                              });
                                          }}
                                        >
                                          Remove
                                        </button>
                                        {p.status === "Draft" && (
                                          <button
                                            disabled={stale || working}
                                            onClick={() =>
                                              void command(p, {
                                                status: "Ready",
                                              })
                                            }
                                          >
                                            Approve
                                          </button>
                                        )}
                                      </>
                                    )}
                                  </>
                                )
                              )}
                            </div>
                          </div>
                        </article>
                      ))}
                    </div>
                  )}
                </div>
                <aside className="panel upcoming-plan">
                  <h3>
                    <Clock size={16} /> Upcoming times
                  </h3>
                  {future.length ? (
                    future.slice(0, 12).map((j: any) => (
                      <div className="review-row" key={j.id}>
                        <time>
                          {new Date(j.planned_at * 1000).toLocaleString("en", {
                            timeZone:
                              config.timeZone === "Africa/Casablanca"
                                ? "UTC"
                                : config.timeZone,
                            weekday: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </div>
                    ))
                  ) : (
                    <p>No future posting times confirmed yet.</p>
                  )}
                  <small>{config.timeZone} · saved times</small>
                  {(data.schedule || []).some(
                    (j: any) => j.status === "review",
                  ) && (
                    <p className="image-error">
                      An execution needs review. Check Activity before another
                      attempt.
                    </p>
                  )}
                </aside>
              </div>
            </>
          )}
          <details className="panel automation-controls">
            <summary>Automation controls</summary>
            <p>
              Posting follows the saved schedule. Run now is optional and uses
              the next ready pin. Pausing keeps your queue; a publish already
              started may still finish.
            </p>
            <div className="button-row">
              <button
                disabled={busy || working}
                onClick={() =>
                  void action(
                    automation.status === "paused" ? "resume" : "pause",
                  )
                }
              >
                {automation.status === "paused"
                  ? "Resume automation"
                  : "Pause automation"}
              </button>
              <button
                disabled={
                  working ||
                  automation.status !== "running" ||
                  !data?.schedulerEnabled
                }
                onClick={() => void run(false)}
              >
                Post next pin now
              </button>
              {automation.sheetUrl && (
                <a
                  className="button"
                  href={automation.sheetUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open Sheet
                </a>
              )}
            </div>
          </details>
          {data?.commands?.length > 0 && (
            <details className="panel automation-controls">
              <summary>Recent content changes</summary>
              {data.commands.map((cmd: any) => (
                <div className="review-row" key={cmd.id}>
                  <span>{cmd.pin_id}</span>
                  <span>
                    {cmd.status}
                    {cmd.detail ? " · " + cmd.detail : ""}
                  </span>
                </div>
              ))}
            </details>
          )}
          {selected && (
            <Dialog.Root
              open={true}
              onOpenChange={(open) => !open && setSelected(null)}
            >
              <Dialog.Portal>
                <Dialog.Overlay className="overlay" />
                <Dialog.Content className="dialog" aria-describedby={undefined}>
                  <div className="dialog-head">
                    <Dialog.Title>Edit queued pin</Dialog.Title>
                    <button onClick={() => setSelected(null)}>Close</button>
                  </div>
                  <div className="dialog-body">
                    <label className="field">
                      <span>Title</span>
                      <input
                        value={patch.title}
                        maxLength={100}
                        onChange={(e) =>
                          setPatch({ ...patch, title: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Description</span>
                      <textarea
                        value={patch.description}
                        maxLength={800}
                        onChange={(e) =>
                          setPatch({ ...patch, description: e.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Destination link (optional)</span>
                      <input
                        type="url"
                        value={patch.link}
                        onChange={(e) =>
                          setPatch({ ...patch, link: e.target.value })
                        }
                      />
                    </label>
                    <button
                      className="primary"
                      disabled={
                        working ||
                        JSON.stringify(patch) ===
                          JSON.stringify({
                            title: selected.title,
                            description: selected.description,
                            link: selected.link,
                          })
                      }
                      onClick={() => void command(selected, patch)}
                    >
                      Save to Sheet
                    </button>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          )}
        </>
      )}
    </section>
  );
}
