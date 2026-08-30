// CSV report export (used by ReportExportSheet) -- a single file combining
// a summary, category breakdown, debtor balances, wallets, and the full
// line-by-line ledger for a chosen period.
import { TYPES_OWED_TO_USER, transactionTypeLabels, walletTagLabels } from "./taxonomy.ts";
import { formatDateTime } from "./format.ts";
import { entriesInRange, reportBounds, reportLabel } from "./cycle.ts";
import { categorySpendAmount, totalWallet } from "./money.ts";
import type { Entry, ReportPeriod, Wallet } from "./types.ts";

export function csvCell(value: string | number | null | undefined) {
  const text = value == null ? "" : String(value);
  return `"${text.replace(/"/g, '""')}"`;
}

export function csvRow(values: (string | number | null | undefined)[]) {
  return values.map(csvCell).join(",");
}

export function buildReportCsv({
  entries,
  wallets,
  receivableSummary,
  payableSummary,
  period,
  selectedMonth,
  selectedYear,
  monthStartDay,
}: {
  entries: Entry[];
  wallets: Wallet[];
  receivableSummary: { name: string; amount: number }[];
  payableSummary: { name: string; amount: number }[];
  period: ReportPeriod;
  selectedMonth: string;
  selectedYear: number;
  monthStartDay: number;
}) {
  const range = reportBounds(period, selectedMonth, selectedYear, monthStartDay);
  const reportEntries = entriesInRange(entries, range.start, range.end).sort((a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime());
  const walletNameById = new Map(wallets.map((wallet) => [wallet.id, wallet.name]));
  const income = totalWallet(reportEntries, "income");
  const outflow = Math.abs(totalWallet(reportEntries, "expense"));
  const balance = income - outflow;
  const debtChange = reportEntries
    .filter((entry) => TYPES_OWED_TO_USER.includes(entry.transaction_type))
    .reduce((sum, entry) => sum + entry.debt_impact, 0);
  const categoryMap = new Map<string, number>();

  for (const entry of reportEntries) {
    const spendAmount = categorySpendAmount(entry);
    if (spendAmount == null) continue;
    categoryMap.set(entry.category, (categoryMap.get(entry.category) ?? 0) + spendAmount);
  }

  const lines = [
    csvRow(["รายงาน", reportLabel(period, selectedMonth, selectedYear, monthStartDay)]),
    csvRow(["วันที่สร้างไฟล์", formatDateTime(new Date().toISOString())]),
    csvRow([""]),
    csvRow(["สรุปยอด"]),
    csvRow(["รายการ", "จำนวนเงิน"]),
    csvRow(["รายรับ", income]),
    csvRow(["รายจ่าย", outflow]),
    csvRow(["สุทธิ", balance]),
    csvRow(["ลูกหนี้เปลี่ยนแปลง", debtChange]),
    csvRow(["จำนวนรายการ", reportEntries.length]),
    csvRow([""]),
    csvRow(["สรุปหมวดหมู่รายจ่าย"]),
    csvRow(["หมวดหมู่", "จำนวนเงิน"]),
    ...[...categoryMap.entries()].sort((a, b) => b[1] - a[1]).map(([category, amount]) => csvRow([category, amount])),
    csvRow([""]),
    csvRow(["ลูกหนี้คงค้าง (คนที่ติดเรา)"]),
    csvRow(["ชื่อ", "ยอดค้าง"]),
    ...receivableSummary.map((debtor) => csvRow([debtor.name, debtor.amount])),
    csvRow([""]),
    csvRow(["หนี้ของฉันคงเหลือ (ที่ฉันติด)"]),
    csvRow(["ชื่อ", "ยอดค้าง"]),
    ...payableSummary.map((debtor) => csvRow([debtor.name, debtor.amount])),
    csvRow([""]),
    csvRow(["กระเป๋า/กองเงิน"]),
    csvRow(["ชื่อ", "ประเภท", "ยอดตั้งต้น", "กระเป๋าหลัก"]),
    ...wallets.map((wallet) => csvRow([wallet.name, walletTagLabels[wallet.tag], wallet.balance, wallet.is_default ? "yes" : ""])),
    csvRow([""]),
    csvRow(["รายการละเอียด"]),
    csvRow(["วันที่", "ชื่อรายการ", "หมวดหมู่", "ประเภท", "กระเป๋า", "จำนวน", "ผลต่อกระเป๋า", "ผลต่อลูกหนี้", "ชื่อผู้เกี่ยวข้อง", "หมายเหตุ", "ข้อความต้นทาง"]),
    ...reportEntries.map((entry) =>
      csvRow([
        formatDateTime(entry.occurred_at),
        entry.title,
        entry.category,
        transactionTypeLabels[entry.transaction_type],
        entry.wallet_id ? walletNameById.get(entry.wallet_id) ?? entry.wallet_id : "",
        entry.amount,
        entry.wallet_impact,
        entry.debt_impact,
        entry.debtor_name,
        entry.note ?? "",
        entry.source_text ?? "",
      ]),
    ),
  ];

  return `﻿${lines.join("\r\n")}`;
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
