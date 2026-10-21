import { useState } from "react";
import { validSchedule } from "../shared/posting-schedule";
import { ChevronDown } from "lucide-react";
import {
  ScheduleControls,
  accountSchedule,
  type ScheduleValue,
} from "./posting-schedule";
import type { Account } from "./types";
export function BatchSchedulePicker({
  account,
  value,
  onChange,
  timeZone,
  disabled = false,
}: {
  account: Account;
  value: ScheduleValue | null;
  onChange: (v: ScheduleValue | null) => void;
  timeZone: string;
  disabled?: boolean;
}) {
  return (
    <details className="posting-panel">
      <summary className="posting-summary">
        <span>
          <strong>Schedule for these pins</strong>
          <span className="muted">
            {value
              ? `${value.pinsPerDay}/day · ${value.schedule.mode === "varied" ? "Varied daily" : "Exact times"}`
              : `Account default · ${account.pinsPerDay}/day`}
          </span>
        </span>
        <ChevronDown size={17} />
      </summary>
      <div className="posting-body">
        <div className="posting-modes">
          <button
            disabled={disabled}
            type="button"
            aria-pressed={!value}
            onClick={() => onChange(null)}
          >
            Account default
          </button>
          <button
            disabled={disabled}
            type="button"
            aria-pressed={Boolean(value)}
            onClick={() =>
              onChange(
                value || {
                  pinsPerDay: account.pinsPerDay,
                  schedule: accountSchedule(account),
                },
              )
            }
          >
            This batch only
          </button>
        </div>
        {value && (
          <ScheduleControls
            value={value}
            onChange={onChange}
            disabled={disabled}
          />
        )}
        <p className="inline-help">
          {timeZone} · After these pins finish, the account default returns.
        </p>
      </div>
    </details>
  );
}
export function QueuedBatchSchedule({
  account,
  initial,
  timeZone,
  disabled,
  save,
}: {
  account: Account;
  initial: ScheduleValue | null;
  timeZone: string;
  disabled: boolean;
  save: (v: ScheduleValue | null) => Promise<void>;
}) {
  const [value, setValue] = useState(initial),
    [error, setError] = useState(""),
    [working, setWorking] = useState(false);
  const dirty = JSON.stringify(value) !== JSON.stringify(initial);
  return (
    <div className="queued-batch-schedule">
      <BatchSchedulePicker
        account={account}
        value={value}
        onChange={setValue}
        timeZone={timeZone}
        disabled={disabled || working}
      />
      {error && (
        <p role="alert" className="image-error">
          {error}
        </p>
      )}
      {dirty && (
        <button
          disabled={
            disabled ||
            working ||
            Boolean(value && !validSchedule(value.schedule, value.pinsPerDay))
          }
          className="save-changes"
          onClick={async () => {
            setWorking(true);
            setError("");
            try {
              await save(value);
            } catch (e) {
              setError(
                e instanceof Error
                  ? e.message
                  : "Schedule not saved. Try again.",
              );
            } finally {
              setWorking(false);
            }
          }}
        >
          {working ? "Saving…" : "Save batch schedule"}
        </button>
      )}
    </div>
  );
}
