/**
 * Keys for saves that are already on their way to the database.
 *
 * A button's own `disabled` state only lands on the next render, which a fast
 * second tap beats -- so the callers keep a ref'd Set of these keys as the
 * real guard and a state copy only to draw the button.
 */

/** One bill on one billing day: the same bill a month later is a different save. */
export function recurringLogKey(recurringId: string, billingDate: Date): string {
  const month = String(billingDate.getMonth() + 1).padStart(2, "0");
  const day = String(billingDate.getDate()).padStart(2, "0");
  return `${recurringId}:${billingDate.getFullYear()}-${month}-${day}`;
}
