import { it, expect } from "vitest";
import { messages, translate } from "../src/i18n";
it("ships only English interface messages", () => {
  expect(Object.keys(messages)).toEqual(["en"]);
  for (const value of Object.values(messages.en))
    expect(value.trim().length).toBeGreaterThan(0);
  expect(translate("en", "summary")).toBe("Queue");
});
