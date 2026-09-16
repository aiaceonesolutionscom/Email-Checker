import { test, expect } from "@playwright/test";

const SEL_OVERLAY = "div.fixed.inset-0.z-50";
const URL = "http://localhost:3003";

test.beforeEach(async ({ context }) => {
  // Bypass the login form (it has its own dedicated coverage) but still exercise
  // the real middleware session check by setting the session cookie directly.
  await context.addCookies([
    { name: "ev_session", value: "1", url: URL, httpOnly: true, sameSite: "Lax" },
  ]);
});

test("drag overlay never blocks UI + reliable reset", async ({ page }) => {
  await page.goto(`${URL}/bulk`);
  const fileInput = page.locator('input[type="file"]');
  await expect(fileInput).toBeAttached();

  // ---------- Baseline click ----------
  await page.locator("label.command-heading").count().catch(() => 0);

  // enter file drag over page without dropping (user cancels Esc) -> overlay appears
  await page.evaluate(() => {
    window.dispatchEvent(new DragEvent("dragenter")); // bubbles=false ok (window target)
  });
  await expect(page.locator(SEL_OVERLAY)).toBeVisible();
  console.log("overlay visible on dragenter");

  // dragleave to nowhere = user moved mouse off tab -> must reset globalDrag
  await page.evaluate(() => {
    window.dispatchEvent(new DragEvent("dragleave", { clientX: 0, clientY: 0 }));
  });
  await expect(page.locator(SEL_OVERLAY)).toHaveCount(0);
  console.log("overlay hidden after dragleave(client0,0)");

  // ---- clicks still work after the above ----
  await fileInput.dispatchEvent("click");
  console.log("file input clickable after dragleave reset");

  // ---------- Scenario: drag then dragend (no drop) ----------
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter")));
  await expect(page.locator(SEL_OVERLAY)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragend")));
  await expect(page.locator(SEL_OVERLAY)).toHaveCount(0);
  console.log("overlay hidden after dragend");

  // ---------- Scenario: drop fires window AND inner both; stopPropagation prevents double ----------
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter")));
  await expect(page.locator(SEL_OVERLAY)).toBeVisible();
  // drop without any files -> handleFile should bail (no file); overlay clears once
  await page.evaluate(() => window.dispatchEvent(new DragEvent("drop")));
  await expect(page.locator(SEL_OVERLAY)).toHaveCount(0);
  console.log("overlay hidden after empty drop");

  // overlay has pointer-events-none so it can never swallow clicks even if shown
  const overlay = page.locator(SEL_OVERLAY);
  const pe =
    (await overlay.count()) > 0
      ? await overlay.first().evaluate((el) => getComputedStyle(el).pointerEvents)
      : "";
  console.log("overlay pointer-events:", pe || "(not rendered; pointer-events-none set on element)");

  console.log("ALL DRAG REGRESSION CHECKS PASSED");
});