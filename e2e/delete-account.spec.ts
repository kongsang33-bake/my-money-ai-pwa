import { test, expect, navigate } from "./fixture.ts";

// Deleting the account is the one action here that cannot be undone, so the
// dialog in front of it is the feature. The delete itself is a write, which
// the suite cannot reach (no Supabase -- see CLAUDE.md); what is tested is
// that nothing gets to it by accident.
test.describe("delete account", () => {
  test("asks for the confirmation word before the button wakes", async ({ app }) => {
    await navigate(app, "more");
    await app.getByRole("button", { name: /ลบบัญชี/ }).click();

    const dialog = app.getByRole("alertdialog", { name: "ลบบัญชีถาวร?" });
    await expect(dialog).toBeVisible();
    const confirm = dialog.getByRole("button", { name: "ลบบัญชีถาวร" });
    await expect(confirm).toBeDisabled();

    const field = dialog.getByRole("textbox");
    await field.fill("ลบ");
    await expect(confirm).toBeDisabled();
    await field.fill("ลบบัญชี");
    await expect(confirm).toBeEnabled();

    await dialog.getByRole("button", { name: "ยกเลิก" }).click();
    await expect(dialog).toHaveCount(0);
  });

  test("starts empty again after being cancelled", async ({ app }) => {
    await navigate(app, "more");
    const open = app.getByRole("button", { name: /ลบบัญชี/ });
    await open.click();
    await app.getByRole("alertdialog").getByRole("textbox").fill("ลบบัญชี");
    await app.keyboard.press("Escape");
    await expect(app.getByRole("alertdialog")).toHaveCount(0);

    await open.click();
    await expect(app.getByRole("alertdialog").getByRole("button", { name: "ลบบัญชีถาวร" })).toBeDisabled();
  });
});
