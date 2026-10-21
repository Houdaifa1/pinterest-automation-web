import { buildImportFile, validate } from "../engine/panel/generator.js";
/** @param {string|null} bootstrapAt */
export function buildWebsiteFlow(
  template,
  state,
  automationId,
  name,
  version,
  callback,
  bootstrapAt = null,
  workspaceId = automationId,
  maintenance = false,
) {
  if (!/^[a-f0-9-]{36}$/.test(automationId))
    throw new Error("Invalid automation identity.");
  if (workspaceId !== "" && !/^[a-f0-9-]{36}$/.test(workspaceId))
    throw new Error("Invalid workspace identity.");
  const requestedState = state;
  if (state.websiteSchedule)
    state = {
      ...state,
      accounts: state.accounts.map((a) => ({
        ...a,
        pinsPerDay: Math.min(18, a.pinsPerDay),
        hours:
          a.hours?.length === Math.min(18, a.pinsPerDay)
            ? a.hours
            : Array.from(
                { length: Math.min(18, a.pinsPerDay) },
                (_, i) => 6 + i,
              ),
      })),
    };
  const errors = validate(state);
  const externalIds = [
    state.google,
    ...(state.notifyEmail !== false ? [state.gmail] : []),
    ...(state.notifyTelegram ? [state.telegram] : []),
    ...state.accounts.map((a) => a.connection),
  ];
  if (
    externalIds.every(
      (value) =>
        typeof value === "string" && /^[A-Za-z0-9_-]{1,128}$/.test(value),
    ) &&
    new Set(externalIds).size === externalIds.length
  ) {
    for (const [key, error] of Object.entries(errors))
      if (error.code === "id") delete errors[key];
  }

  if (Object.keys(errors).length)
    throw new Error(
      "Complete your connections and account settings before starting.",
    );
  const flow = JSON.parse(buildImportFile(template, state, version)).flows[0];
  const visit = (step) => {
    for (; step; step = step.nextAction) {
      if (
        step.name === "step_3" &&
        state.notifyTelegram &&
        state.reuseTelegramRecipient
      ) {
        const config = JSON.parse(step.settings.input.config);
        config.settings.requireTelegramRecipient = true;
        step.settings.input.config = JSON.stringify(config);
      }
      if (step.name === "step_3") {
        const config = JSON.parse(step.settings.input.config);
        for (const a of config.accounts) {
          const original = requestedState.accounts.find((x) => x.name === a.name);
          if (original?.legacyDailyCap) a.dailyCap = original.legacyDailyCap;
          if (original?.schedule) a.websiteSchedule = original.schedule;
        }
        step.settings.input.config = JSON.stringify(config);
      }
      if (step.name === "step_3" && maintenance) {
        const config = JSON.parse(step.settings.input.config);
        config.settings.maintenance = true;
        step.settings.input.config = JSON.stringify(config);
      }
      if (
        step.name === "step_3" &&
        state.notifyTelegram &&
        !state.reuseTelegramRecipient
      ) {
        if (
          !/^\d+$/.test(state.telegramChat || "") &&
          !/^[A-Za-z0-9_-]{1,200}$/.test(state.telegramRecipientSheet || "")
        )
          throw new Error("Confirm your Telegram chat before starting.");
        const config = JSON.parse(step.settings.input.config);
        if (state.telegramRecipientSheet)
          config.settings.telegramRecipientSheet = state.telegramRecipientSheet;
        else config.settings.telegramChat = state.telegramChat;
        step.settings.input.config = JSON.stringify(config);
      }
      if (
        step.name === "step_3" &&
        requestedState.websiteSchedule &&
        callback
      ) {
        const config = JSON.parse(step.settings.input.config);
        config.settings.website = callback.replace(
          "/api/callback/",
          "/api/execute/",
        );
        for (const a of config.accounts) {
          const original = requestedState.accounts.find(
            (x) => x.name === a.name,
          );
          a.dailyCap = original.legacyDailyCap || original.pinsPerDay;
          a.websiteId = original.id;
          a.username = original.username;
        }
        step.settings.input.config = JSON.stringify(config);
      }
      if (step.name === "step_6" && requestedState.websiteSchedule) {
        step.settings.input.websiteJob = "{{step_4['output'].item.websiteJob}}";
        step.settings.input.quietQueue = true;
      }
      const source = step.settings?.sourceCode;
      if (source?.code) {
        source.code = source.code
          .replaceAll(
            "const CONTROL_MARKER = 'control-sheet';",
            workspaceId
              ? `const CONTROL_MARKER = 'control-sheet:${workspaceId}';`
              : "const CONTROL_MARKER = 'control-sheet';",
          )
          .replaceAll(
            "const ROOT_MARKER = 'root-folder';",
            workspaceId
              ? `const ROOT_MARKER = 'root-folder:${workspaceId}';`
              : "const ROOT_MARKER = 'root-folder';",
          )
          .replaceAll("Pinterest Autopilot", "Pinterest Automation")
          .replaceAll("PINTEREST AUTOPILOT", "PINTEREST AUTOMATION");
      }
      if (step.firstLoopAction) visit(step.firstLoopAction);
    }
  };
  visit(flow.trigger);
  if (requestedState.websiteSchedule && !bootstrapAt) {
    flow.trigger.settings.input = {
      timezone: "UTC",
      cronExpression: "7 0 * * *",
    };
    flow.trigger.displayName =
      "Daily maintenance; posting times are managed by the website";
  }
  if (bootstrapAt) {
    const d = new Date(bootstrapAt);
    flow.trigger.settings.input = {
      timezone: "UTC",
      cronExpression: `${d.getUTCMinutes()} ${d.getUTCHours()} ${d.getUTCDate()} ${d.getUTCMonth() + 1} *`,
    };
  }
  if (callback) {
    let last = flow.trigger;
    while (last.nextAction) last = last.nextAction;
    let prepare = flow.trigger;
    while (prepare && prepare.name !== "step_3") prepare = prepare.nextAction;
    const snapshotCode = prepare.settings.sourceCode.code.split(
      "export const code =",
    )[0];
    last.nextAction = {
      name: "website_status",
      displayName: "Update website status",
      type: "CODE",
      valid: true,
      settings: {
        input: requestedState.websiteSchedule
          ? {
              google: "{{step_1['output']}}",
              spreadsheet: "{{step_3['output'].spreadsheet}}",
              jobs: "{{step_3['output'].websiteJobs}}",
              commands: "{{step_3['output'].websiteCommands}}",
              config: prepare.settings.input.config,
            }
          : {},
        sourceCode: {
          packageJson: "{}",
          code:
            (requestedState.websiteSchedule ? snapshotCode : "") +
            `export const code = async (inputs) => { ${requestedState.websiteSchedule ? "await websiteSnapshot(inputs);" : ""} try { const r = await fetch(${JSON.stringify(callback)}, { method: 'POST' }); return { notified: r.ok }; } catch { return { notified: false }; } };`,
        },
        errorHandlingOptions: {
          continueOnFailure: { value: true },
          retryOnFailure: { value: false },
        },
      },
    };
  }
  flow.displayName = name;
  return flow;
}
