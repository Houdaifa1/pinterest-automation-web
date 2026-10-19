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
) {
  if (!/^[a-f0-9-]{36}$/.test(automationId))
    throw new Error("Invalid automation identity.");
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
      if (step.name === "step_3" && state.notifyTelegram) {
        if (!/^\d+$/.test(state.telegramChat || ""))
          throw new Error("Confirm your Telegram chat before starting.");
        const config = JSON.parse(step.settings.input.config);
        config.settings.telegramChat = state.telegramChat;
        step.settings.input.config = JSON.stringify(config);
      }
      const source = step.settings?.sourceCode;
      if (source?.code) {
        source.code = source.code
          .replaceAll(
            "const CONTROL_MARKER = 'control-sheet';",
            `const CONTROL_MARKER = 'control-sheet:${automationId}';`,
          )
          .replaceAll(
            "const ROOT_MARKER = 'root-folder';",
            `const ROOT_MARKER = 'root-folder:${automationId}';`,
          )
          .replaceAll("Pinterest Autopilot", "Pinterest Automation")
          .replaceAll("PINTEREST AUTOPILOT", "PINTEREST AUTOMATION");
      }
      if (step.firstLoopAction) visit(step.firstLoopAction);
    }
  };
  visit(flow.trigger);
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
    last.nextAction = {
      name: "website_status",
      displayName: "Update website status",
      type: "CODE",
      valid: true,
      settings: {
        input: {},
        sourceCode: {
          packageJson: "{}",
          code: `export const code = async () => { try { const r = await fetch(${JSON.stringify(callback)}, { method: 'POST' }); return { notified: r.ok }; } catch { return { notified: false }; } };`,
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
