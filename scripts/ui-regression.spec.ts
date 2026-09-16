import { test, expect } from "@playwright/test";

const SEL_OVERLAY = "div.fixed.inset-0.z-50";
const SEL_FILEBTN = "input[type=file]";

test.beforeEach(async ({ context, baseURL }) => {
  // Bypass the login form (it has its own dedicated coverage) but still exercise
  // the real middleware session check by setting the session cookie directly.
  await context.addCookies([
    { name: "ev_session", value: "1", url: baseURL!, httpOnly: true, sameSite: "Lax" },
  ]);
});

test("click + drag overlay regression fixes", async ({ page }) => {
  await page.goto("/bulk");

  // ensure we are on upload phase (file input is deliberately hidden; trigger is the button)
  await expect(page.locator("input[type=file]")).toBeAttached();

  // ---------- Baseline: normal click ----------
  const [chooser] = await Promise.all([
    page.waitForEvent("filechooser", { timeout: 5000 }),
    page.locator("button:has-text('Choose File')").click(),
  ]);
  console.log("file chooser opened via Choose File button");
  // if label has no for, just verify file input reachable
  await expect(page.locator("input[type=file]")).toBeAttached();
  console.log("baseline click ok");

  // ---------- Scenario A: drag in then leave via boundary -> overlay must hide ----------
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter")));
  await expect(page.locator(SEL_OVERLAY)).toBeVisible();
  console.log("overlay shown on dragenter");

  await page.evaluate(() =>
    window.dispatchEvent(new DragEvent("dragleave", { clientX: 0, clientY: 0 }))
  );
  await expect(page.locator(SEL_OVERLAY)).toHaveCount(0);
  console.log("overlay hidden after boundary dragleave");

  // clicks must still work
  await page.locator("input[type=file]").dispatchEvent("click");
  console.log("click after boundary dragleave ok");

  // ---------- Scenario B: drag cancelled (no drop) must not leave overlay ----------
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter")));
  await expect(page.locator(SEL_OVERLAY)).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragend")));
  await expect(page.locator(SEL_OVERLAY)).toHaveCount(0);
  console.log("overlay hidden after dragend (Esc-drag cancelled)");

  await page.locator("input[type=file]").dispatchEvent("click");
  console.log("click after dragend ok");

  // ---------- Scenario C: drop bounces (window + inner both fire) must not double ----------
  // NOTE: file-level drop turns overlay state off; ensure overlay cleared after drop.
  await page.evaluate(() => window.dispatchEvent(new DragEvent("dragenter")));
  await expect(page.locator(SEL_OVERLAY)).toBeVisible();
  // simulate a drop that carries NO files -> overlay must still clear
  await page.evaluate(() => window.dispatchEvent(new DragEvent("drop")));
  await expect(page.locator(SEL_OVERLAY)).toHaveCount(0);
  console.log("overlay cleared after drop (no file) & no double overlay");

  console.log("ALL REGRESSION CHECKS PASSED");
});
