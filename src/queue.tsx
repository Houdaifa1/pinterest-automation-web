import { useEffect, useRef, useState } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Link } from "react-router-dom";
import { ArrowRight, Clock, RefreshCw } from "lucide-react";
import { api } from "./api";
import { PinProgress } from "./pin-progress";
import {
  plannedPins,
  slotTime,
  slotInput,
  shiftDay,
} from "../shared/queue-plan";
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
    [notice, setNotice] = useState(""),
    [filter, setFilter] = useState("Ready"),
    [visible, setVisible] = useState(50),
    [moving, setMoving] = useState<any>(null),
    [moveTime, setMoveTime] = useState(""),
    [moveError, setMoveError] = useState<unknown>(null),
    [day, setDay] = useState(() =>
      slotInput(Date.now() / 1000, config.timeZone).slice(0, 10),
    ),
    [addingTime, setAddingTime] = useState(false),
    [addClock, setAddClock] = useState(""),
    [addError, setAddError] = useState<unknown>(null);
  const addId = useRef(crypto.randomUUID()),
    loadId = useRef(0);
  const today = slotInput(Date.now() / 1000, config.timeZone).slice(0, 10);
  const chooseDay = (value: string) => {
    setDay(value);
    setMoving(null);
    setAddingTime(false);
    setMoveError(null);
    setAddError(null);
  };
  const pollUntil = useRef(0);
  const load = async () => {
    const seq = ++loadId.current;
    try {
      const next = await api(
        `/api/automations/${automation.id}/queue?day=${encodeURIComponent(day)}`,
      );
      if (seq === loadId.current) {
        setData(next);
        setError(null);
      }
    } catch (e) {
      if (seq === loadId.current) setError(e);
    }
  };
  useEffect(() => {
    void load();
    const interval = setInterval(() => {
      if (
        document.visibilityState === "visible" &&
        (pollUntil.current > Date.now() || Date.now() % 30000 < 5000)
      )
        void load();
    }, 5000);
    return () => clearInterval(interval);
  }, [
    automation.id,
    automation.appliedRevision,
    automation.status,
    automation.schedulerEnabled,
    automation.daySlotsEnabled,
    day,
  ]);
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
    review =
      (counts?.Draft || 0) +
      (counts?.["Needs review"] || 0) +
      (counts?.Error || 0),
    future = (data?.schedule || []).filter(
      (s: any) => s.account_id === accountId && s.status === "pending",
    ),
    profile = config.accounts.find((a) => a.id === accountId),
    stale = snap && Date.now() / 1000 - snap.syncedAt > 900;
  useEffect(() => {
    if (!config.accounts.some((a) => a.id === accountId))
      setAccountId(config.accounts[0]?.id || "");
  }, [config.accounts, accountId]);
  const plan = plannedPins(
    snap?.pins || [],
    future,
    config.timeZone,
    automation.status === "running" && Boolean(profile?.on),
  );
  const planned = new Map(plan.map((p) => [p.pin.id, p.slot]));
  const shown = (snap?.pins || []).filter(
    (p: any) =>
      filter === "All" ||
      (filter === "Attention"
        ? ["Draft", "Error", "Needs review", "Posting"].includes(p.status)
        : p.status === filter),
  );
  const recent = (data?.recent || [])
    .filter((j: any) => j.account_id === accountId)
    .slice(0, 8);
  const jobLabel = (j: any) =>
    (
      ({
        completed: "Published",
        missed: "Missed · skipped safely",
        review: "Needs checking",
        dispatched: "Starting",
        claimed: "Starting",
        started: "Publishing",
        finished: "Finished · no pin published",
        cancelled: "Cancelled",
      }) as Record<string, string>
    )[j.status] || j.status;

  const daySlots = (data?.daySlots || []).filter(
    (j: any) =>
      j.account_id === accountId &&
      !["cancelled", "skipped"].includes(j.status),
  );
  const allowance = Math.max(
    profile?.legacyDailyCap || profile?.pinsPerDay || 1,
    daySlots.filter(
      (j: any) =>
        j.origin !== "manual" && !["missed", "review"].includes(j.status),
    ).length,
  );
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
                disabled={working || busy}
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
          {data?.schedulerEnabled && (
            <div className="panel next-post-summary">
              <span className="eyebrow">
                {["starting", "applying"].includes(automation.status)
                  ? "Updating schedule"
                  : automation.status === "paused" || !profile?.on
                    ? "Posting paused"
                    : automation.status !== "running"
                      ? "Schedule needs attention"
                      : future.length
                        ? "Next scheduled slot"
                        : "Preparing posting times"}
              </span>
              <strong>
                {automation.status === "running" && profile?.on && future[0]
                  ? slotTime(future[0].planned_at, config.timeZone)
                  : automation.status === "paused" || !profile?.on
                    ? "Your queue is kept"
                    : ["starting", "applying"].includes(automation.status)
                      ? "Checking your settings…"
                      : "No confirmed future slot"}
              </strong>
              <small>
                {config.timeZone} ·{" "}
                {ready
                  ? `${ready} ready pins`
                  : snap
                    ? "Waiting for ready pins"
                    : "Queue not synced yet"}
              </small>
              {snap?.health &&
                !["OK", "Off"].includes(snap.health) &&
                !(snap.health === "Queue empty" && ready > 0) && (
                  <p role="status">
                    Last account check{snap.lastRun ? ` (${snap.lastRun})` : ""}
                    : {snap.health}
                  </p>
                )}
            </div>
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
              {data.schedulerEnabled ? (
                <button
                  disabled={working || busy}
                  onClick={() => void run(true)}
                >
                  Sync queue
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={working || busy}
                  onClick={() => void action("deploy")}
                >
                  {busy ? "Connecting…" : "Connect live queue"}
                </button>
              )}
              {!data.schedulerEnabled && (
                <p>
                  Reconnect this flow and Sheet. A settings-only check runs
                  first; it does not publish pins.
                </p>
              )}
              <Link
                className="button"
                to={`/automations/${automation.id}/runs`}
              >
                Check recent runs
              </Link>
            </div>
          ) : (
            <>
              <div className="queue-stats">
                <div className="stat-ready">
                  <span>Ready to post</span>
                  <strong>{ready.toLocaleString()}</strong>
                </div>
                <div className="stat-posted">
                  <span>Posted</span>
                  <strong>{published.toLocaleString()}</strong>
                </div>
                <div>
                  <span>Total tracked</span>
                  <strong>{total.toLocaleString()}</strong>
                </div>
                <div className="stat-attention">
                  <span>Needs attention</span>
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
                <PinProgress
                  ready={ready}
                  posted={published}
                  held={review}
                  total={total}
                />
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
                    <h3>Pin queue</h3>
                    <button disabled={working} onClick={() => void run(true)}>
                      Sync queue
                    </button>
                  </div>
                  <div className="queue-filters" aria-label="Show pins">
                    {[
                      ["Ready", "Upcoming"],
                      ["Done", "Posted"],
                      ["Attention", "Needs attention"],
                      ["All", "All"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={filter === value}
                        onClick={() => {
                          setFilter(value);
                          setVisible(50);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {!shown.length ? (
                    <div className="empty">
                      <h3>
                        {filter === "Ready"
                          ? "No ready pins in this preview"
                          : "No pins in this view"}
                      </h3>
                      <Link
                        className="button"
                        to={`/automations/${automation.id}/pins`}
                      >
                        Create a content request
                      </Link>
                    </div>
                  ) : (
                    <div className="queue-pins">
                      {shown.slice(0, visible).map((p: any, index: number) => (
                        <article className="panel pin-item" key={p.id}>
                          <div className="pin-cover">
                            <strong>{index + 1}</strong>
                          </div>
                          <div className="pin-detail">
                            <span className="eyebrow">
                              {p.status}
                              {p.productPaused ? " · Product paused" : ""}
                            </span>
                            <h4>{p.title || "Untitled pin"}</h4>
                            <strong className="pin-slot">
                              {planned.has(p.id)
                                ? `Planned ${slotTime(planned.get(p.id).planned_at, config.timeZone)}`
                                : p.status === "Done"
                                  ? `Posted ${p.postedAt || "· time unavailable"}`
                                  : p.publishAfter
                                    ? `Not before ${p.publishAfter}`
                                    : p.status === "Ready"
                                      ? automation.status === "paused" ||
                                        !profile?.on
                                        ? "Posting paused"
                                        : "After current saved plan"
                                      : "Not queued"}
                            </strong>
                            <small>
                              {p.board || "Board not set"}
                              {p.rowNumber ? ` · Sheet row ${p.rowNumber}` : ""}
                            </small>
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
                      {shown.length > visible && (
                        <button onClick={() => setVisible((v) => v + 50)}>
                          Show more pins
                        </button>
                      )}
                    </div>
                  )}
                  <p className="inline-help">
                    Planned slots use Sheet order and Publish after dates.
                    Actual posting still checks media, products, daily caps and
                    Pinterest; an invalid pin may be skipped.
                  </p>
                </div>
                <aside className="panel upcoming-plan">
                  <h3>
                    <Clock size={16} /> Posting days
                  </h3>
                  <div className="day-nav">
                    <button
                      aria-label="Previous posting day"
                      disabled={day <= shiftDay(today, -30) || working || busy}
                      onClick={() => chooseDay(shiftDay(day, -1))}
                    >
                      ‹
                    </button>
                    <input
                      aria-label="Posting day"
                      type="date"
                      disabled={working || busy}
                      value={day}
                      min={shiftDay(today, -30)}
                      max={shiftDay(today, 30)}
                      onChange={(e) => {
                        if (e.target.value) chooseDay(e.target.value);
                      }}
                    />
                    <button
                      aria-label="Next posting day"
                      disabled={day >= shiftDay(today, 30) || working || busy}
                      onClick={() => chooseDay(shiftDay(day, 1))}
                    >
                      ›
                    </button>
                  </div>
                  <p className="inline-help">
                    {day === today ? "Today" : day} · {daySlots.length} slots ·
                    up to {allowance} pins
                  </p>
                  {day >= today && (
                    <button
                      disabled={working || busy}
                      onClick={() => {
                        setAddingTime(!addingTime);
                        setAddClock("");
                        setAddError(null);
                        addId.current = crypto.randomUUID();
                      }}
                    >
                      Add time
                    </button>
                  )}
                  {addingTime && (
                    <div className="slot-edit-fields">
                      {!data.daySlotsEnabled ? (
                        <>
                          <p>
                            Update this flow once to enable extra day slots.
                          </p>
                          <button
                            disabled={working || busy}
                            onClick={() => void action("deploy")}
                          >
                            Enable day controls
                          </button>
                        </>
                      ) : (
                        <>
                          <input
                            aria-label="Extra posting time"
                            type="time"
                            value={addClock}
                            onChange={(e) => setAddClock(e.target.value)}
                            onInput={(e) => {
                              setAddClock(e.currentTarget.value);
                              setAddError(null);
                            }}
                            disabled={working}
                          />
                          <button
                            disabled={working || !addClock}
                            onClick={async () => {
                              setWorking(true);
                              setAddError(null);
                              try {
                                await api(
                                  `/api/automations/${automation.id}/queue/schedule`,
                                  "POST",
                                  {
                                    requestId: addId.current,
                                    accountId,
                                    time: day + "T" + addClock,
                                  },
                                );
                                setAddingTime(false);
                                setNotice(
                                  "Time added for this day. Its posting allowance updates automatically.",
                                );
                                await load();
                              } catch (e) {
                                setAddError(e);
                              } finally {
                                setWorking(false);
                              }
                            }}
                          >
                            {working ? "Saving…" : "Add this time"}
                          </button>
                        </>
                      )}
                      {addError != null && (
                        <p className="image-error" role="alert">
                          {addError instanceof Error
                            ? addError.message
                            : "This time could not be added."}
                        </p>
                      )}
                      <button
                        disabled={working || busy}
                        onClick={() => setAddingTime(false)}
                      >
                        Cancel
                      </button>
                    </div>
                  )}
                  {daySlots.length ? (
                    daySlots.map((j: any) => (
                      <div className="slot-editor" key={j.id}>
                        <time>{slotTime(j.planned_at, config.timeZone)}</time>
                        {j.status !== "pending" ||
                        j.planned_at < Date.now() / 1000 ? (
                          <small>
                            {jobLabel(j)}
                            {j.detail ? ` · ${j.detail}` : ""}
                          </small>
                        ) : moving?.id === j.id ? (
                          <div className="slot-edit-fields">
                            <input
                              type="time"
                              aria-label="New posting time"
                              value={moveTime}
                              onChange={(e) => setMoveTime(e.target.value)}
                              onInput={(e) => {
                                setMoveTime(e.currentTarget.value);
                                setMoveError(null);
                              }}
                              disabled={working}
                            />
                            {moveError != null && (
                              <p className="image-error" role="alert">
                                {moveError instanceof Error
                                  ? moveError.message
                                  : "This time could not be saved."}
                              </p>
                            )}
                            <button
                              disabled={
                                working ||
                                !moveTime ||
                                moveTime ===
                                  slotInput(
                                    j.planned_at,
                                    config.timeZone,
                                  ).slice(11)
                              }
                              onClick={async () => {
                                setWorking(true);
                                setMoveError(null);
                                try {
                                  await api(
                                    `/api/automations/${automation.id}/queue/schedule/${j.id}`,
                                    "POST",
                                    {
                                      expectedAt: moving.planned_at,
                                      time:
                                        slotInput(
                                          j.planned_at,
                                          config.timeZone,
                                        ).slice(0, 11) + moveTime,
                                    },
                                  );
                                  setMoving(null);
                                  setNotice(
                                    "Posting slot updated. Daily settings are unchanged.",
                                  );
                                  await load();
                                } catch (e) {
                                  setMoveError(e);
                                } finally {
                                  setWorking(false);
                                }
                              }}
                            >
                              {working ? "Saving…" : "Save time"}
                            </button>
                            <button
                              disabled={working}
                              onClick={async () => {
                                if (
                                  !window.confirm(
                                    "Remove this upcoming time? Your pins stay in the queue.",
                                  )
                                )
                                  return;
                                setWorking(true);
                                setMoveError(null);
                                try {
                                  await api(
                                    `/api/automations/${automation.id}/queue/schedule/${j.id}`,
                                    "DELETE",
                                    { expectedAt: moving.planned_at },
                                  );
                                  setMoving(null);
                                  await load();
                                } catch (e) {
                                  setMoveError(e);
                                } finally {
                                  setWorking(false);
                                }
                              }}
                            >
                              Remove time
                            </button>
                            <button
                              disabled={working}
                              onClick={() => {
                                setMoving(null);
                                setMoveError(null);
                              }}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            disabled={working || busy}
                            onClick={() => {
                              setMoving(j);
                              setMoveTime(
                                slotInput(j.planned_at, config.timeZone).slice(
                                  11,
                                ),
                              );
                              setMoveError(null);
                            }}
                          >
                            Change time
                          </button>
                        )}
                      </div>
                    ))
                  ) : (
                    <p>No posting slots on this day.</p>
                  )}
                  <small>
                    {config.timeZone} · saved slots
                    {automation.status === "paused" || !profile?.on
                      ? " · paused"
                      : ["starting", "applying"].includes(automation.status)
                        ? " · updating"
                        : ""}
                  </small>
                  <h3>Recent results</h3>
                  {recent.length ? (
                    recent.map((j: any) => (
                      <div className="slot-result" key={j.id}>
                        <time>{slotTime(j.planned_at, config.timeZone)}</time>
                        <strong>{jobLabel(j)}</strong>
                        {j.detail && <small>{j.detail}</small>}
                      </div>
                    ))
                  ) : (
                    <p>No posting result recorded here yet.</p>
                  )}
                  <Link to={`/automations/${automation.id}/runs`}>
                    View Activepieces runs
                  </Link>
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
