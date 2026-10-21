import { Minus, Plus, X } from "lucide-react";
import type { Account } from "./types";
import {
  normalizedSpacing,
  resizeExactTimes,
  validSchedule,
  type PostingSchedule,
} from "../shared/posting-schedule";

export type ScheduleValue = { pinsPerDay: number; schedule: PostingSchedule };
export function accountSchedule(account: Account): PostingSchedule {
  return (
    account.schedule || {
      mode: "fixed",
      start: "09:00",
      end: "21:00",
      minSpacing: 1,
      times: account.hours.map((h) => `${String(h).padStart(2, "0")}:00`),
    }
  );
}
export function ScheduleControls({
  value,
  onChange,
  disabled = false,
}: {
  value: ScheduleValue;
  onChange: (value: ScheduleValue) => void;
  disabled?: boolean;
}) {
  const { pinsPerDay: count, schedule } = value;
  const change = (patch: Partial<PostingSchedule>, nextCount = count) => {
    let next = { ...schedule, ...patch };
    if (next.spacingMode !== "custom")
      next = normalizedSpacing({ ...next, spacingMode: "auto" }, nextCount);
    onChange({ pinsPerDay: nextCount, schedule: next });
  };
  const amount = (n: number) =>
    change(
      schedule.mode === "fixed"
        ? {
            times: resizeExactTimes(
              schedule.times,
              n,
              schedule.start,
              schedule.end,
            ),
          }
        : {},
      n,
    );
  const effective = normalizedSpacing(schedule, count);
  return (
    <fieldset className="posting-controls" disabled={disabled}>
      <div className="posting-amount">
        <label className="field">
          Pins per day
          <span className="amount-stepper">
            <button
              type="button"
              aria-label="Fewer posts per day"
              disabled={count <= 1}
              onClick={() => amount(count - 1)}
            >
              <Minus size={16} />
            </button>
            <input
              aria-label="Pins per day"
              type="number"
              min="1"
              max="1440"
              step="1"
              value={count || ""}
              onInput={(e) => amount(Number(e.currentTarget.value))}
              onChange={(e) => amount(Number(e.target.value))}
            />
            <button
              type="button"
              aria-label="More posts per day"
              disabled={count >= 1440}
              onClick={() => amount(count + 1)}
            >
              <Plus size={16} />
            </button>
          </span>
        </label>
        <div className="posting-presets" aria-label="Daily amounts">
          {[3, 5, 10, 12].map((n) => (
            <button
              type="button"
              key={n}
              aria-pressed={count === n}
              onClick={() => amount(n)}
            >
              {n}
            </button>
          ))}
        </div>
      </div>
      <div className="posting-modes" aria-label="Posting time mode">
        <button
          type="button"
          aria-pressed={schedule.mode === "varied"}
          onClick={() =>
            change({ mode: "varied", spacingMode: "auto", times: [] })
          }
        >
          Varied daily
        </button>
        <button
          type="button"
          aria-pressed={schedule.mode === "fixed"}
          onClick={() =>
            change({
              mode: "fixed",
              spacingMode: "auto",
              times:
                schedule.times.length === count
                  ? schedule.times
                  : resizeExactTimes([], count, schedule.start, schedule.end),
            })
          }
        >
          Exact times
        </button>
      </div>
      {schedule.mode === "varied" ? (
        <>
          <div className="form-grid">
            <label className="field">
              From
              <input
                type="time"
                value={schedule.start}
                onInput={(e) => change({ start: e.currentTarget.value })}
                onChange={(e) => change({ start: e.target.value })}
              />
            </label>
            <label className="field">
              Until
              <input
                type="time"
                value={schedule.end}
                onInput={(e) => change({ end: e.currentTarget.value })}
                onChange={(e) => change({ end: e.target.value })}
              />
            </label>
          </div>
          <details className="posting-spacing">
            <summary>
              Spacing ·{" "}
              {schedule.spacingMode === "custom" ? "Custom" : "Automatic"} ·{" "}
              {effective.minSpacing}m minimum
            </summary>
            <label className="check-row">
              <input
                type="checkbox"
                checked={schedule.spacingMode !== "custom"}
                onChange={(e) =>
                  change({ spacingMode: e.target.checked ? "auto" : "custom" })
                }
              />
              Adjust spacing with the daily amount
            </label>
            {schedule.spacingMode === "custom" && (
              <label className="field">
                Minimum gap in minutes
                <input
                  type="number"
                  min="1"
                  max="1440"
                  step="1"
                  value={schedule.minSpacing || ""}
                  onInput={(e) =>
                    change({ minSpacing: Number(e.currentTarget.value) })
                  }
                  onChange={(e) =>
                    change({ minSpacing: Number(e.target.value) })
                  }
                />
              </label>
            )}
          </details>
        </>
      ) : (
        <>
          <div className="posting-times">
            {schedule.times.map((time, i) => (
              <label className="posting-time" key={i}>
                <input
                  aria-label={`Posting time ${i + 1}`}
                  type="time"
                  value={time}
                  onInput={(e) => {
                    const time = e.currentTarget.value;
                    change({
                      times: schedule.times.map((t, j) => (j === i ? time : t)),
                    });
                  }}
                  onChange={(e) =>
                    change({
                      times: schedule.times.map((t, j) =>
                        j === i ? e.target.value : t,
                      ),
                    })
                  }
                />
                <button
                  type="button"
                  aria-label={`Remove posting time ${i + 1}`}
                  disabled={count <= 1}
                  onClick={() =>
                    change(
                      { times: schedule.times.filter((_, j) => j !== i) },
                      count - 1,
                    )
                  }
                >
                  <X size={14} />
                </button>
              </label>
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              change({
                spacingMode: "auto",
                times: resizeExactTimes(
                  [],
                  count,
                  schedule.start,
                  schedule.end,
                ),
              })
            }
          >
            Space evenly
          </button>
        </>
      )}
      {!validSchedule(effective, count) && (
        <p className="schedule-validation" role="alert">
          {!Number.isInteger(count) || count < 1 || count > 1440
            ? "Choose a whole daily amount from 1 to 1,440."
            : schedule.mode === "fixed"
              ? "Choose one unique time per pin, with enough spacing overnight too."
              : "This amount needs wider hours or a smaller gap. Use automatic spacing to fit."}
        </p>
      )}
    </fieldset>
  );
}
