import { it, expect } from "vitest";
import { messages } from "../src/i18n";
it("provides every interface message in English, French and Arabic", () => {
  expect(Object.keys(messages.fr).sort()).toEqual(
    Object.keys(messages.en).sort(),
  );
  expect(Object.keys(messages.ar).sort()).toEqual(
    Object.keys(messages.en).sort(),
  );
  for (const language of Object.values(messages))
    for (const value of Object.values(language))
      expect(value.trim().length).toBeGreaterThan(0);
});
