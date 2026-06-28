"use server";

import fs from "fs/promises";
import path from "path";
import type {
  Product,
  License,
  ValidationLog,
  Settings,
  Blacklist,
  Customer,
  Voucher,
  DashboardStats,
  BotLog,
  DailyCommandUsage,
  DailyNewUsersData,
  NewLicenseDistributionData,
  DailyWebhookCreationsData,
} from "./types";

import { unstable_noStore as noStore } from "next/cache";
import {
  subDays,
  startOfDay,
  format,
  eachDayOfInterval,
} from "date-fns";

import { sendWebhook } from "./logging";

const dataDir = path.join(process.cwd(), "data");

/**
 * ⚠️ VERCEL FIX:
 * - filesystem is READ ONLY in production
 * - so we use memory fallback
 */
const memoryDB: Record<string, any> = {};

// -------------------------
// SAFE READ
// -------------------------
async function readFile<T>(filename: string, defaultValue: T): Promise<T> {
  const filePath = path.join(dataDir, filename);

  try {
    const data = await fs.readFile(filePath, "utf-8");
    if (!data) return defaultValue;
    return JSON.parse(data) as T;
  } catch {
    // fallback (Vercel-safe)
    if (!memoryDB[filename]) {
      memoryDB[filename] = defaultValue;
    }
    return memoryDB[filename];
  }
}

// -------------------------
// SAFE WRITE
// -------------------------
async function writeFile<T>(filename: string, data: T): Promise<void> {
  memoryDB[filename] = data;

  try {
    const filePath = path.join(dataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2));
  } catch {
    // ignore on Vercel
  }
}

// ======================================================
// PRODUCTS
// ======================================================
export async function getProducts() {
  noStore();
  return readFile<Product[]>("products.json", []);
}

export async function saveProducts(data: Product[]) {
  return writeFile("products.json", data);
}

// ======================================================
// LICENSES
// ======================================================
export async function getLicenses() {
  noStore();
  return readFile<License[]>("licenses.json", []);
}

export async function saveLicenses(data: License[]) {
  return writeFile("licenses.json", data);
}

// ======================================================
// LOGS
// ======================================================
export async function getLogs() {
  noStore();
  return readFile<ValidationLog[]>("logs.json", []);
}

export async function saveLogs(data: ValidationLog[]) {
  return writeFile("logs.json", data);
}

// ======================================================
// VOUCHERS
// ======================================================
export async function getVouchers() {
  noStore();
  return readFile<Voucher[]>("vouchers.json", []);
}

export async function saveVouchers(data: Voucher[]) {
  return writeFile("vouchers.json", data);
}

// ======================================================
// BOT LOGS
// ======================================================
export async function getBotLogs() {
  noStore();
  return readFile<BotLog[]>("bot-logs.json", []);
}

export async function saveBotLogs(data: BotLog[]) {
  return writeFile("bot-logs.json", data);
}

export async function logBotCommand(command: string, userId: string) {
  const logs = await getBotLogs();

  logs.unshift({
    command,
    userId,
    timestamp: new Date().toISOString(),
  });

  await saveBotLogs(logs.slice(0, 1000));

  const settings = await getSettings();

  if (settings?.logging?.enabled && settings.logging.logBotCommands) {
    await sendWebhook({
      title: "Bot Command Executed",
      description: `User ${userId} executed /${command}`,
      timestamp: new Date().toISOString(),
    });
  }
}

// ======================================================
// SETTINGS
// ======================================================
export async function getSettings(): Promise<Settings> {
  noStore();

  const defaults: Settings = {
    apiKey: "",
    panelUrl: "",
    adminApiEnabled: false,
    clientPanel: {
      enabled: false,
      accentColor: "#3b82f6",
    },
    logging: {
      enabled: false,
      webhookUrl: "",
      logLicenseCreations: true,
      logLicenseUpdates: true,
      logBotCommands: true,
      logBlacklistActions: true,
      logBuiltByBit: true,
    },
  } as Settings;

  const data = await readFile<Settings>("settings.json", defaults);
  return data;
}

export async function saveSettings(data: Settings) {
  return writeFile("settings.json", data);
}

// ======================================================
// BLACKLIST
// ======================================================
export async function getBlacklist(): Promise<Blacklist> {
  noStore();
  return readFile("blacklist.json", {
    ips: [],
    hwids: [],
    discordIds: [],
  });
}

export async function saveBlacklist(data: Blacklist) {
  return writeFile("blacklist.json", data);
}

// ======================================================
// DASHBOARD STATS (FIXED)
// ======================================================
export async function getDashboardStats(): Promise<DashboardStats> {
  noStore();

  const products = await getProducts();
  const licenses = await getLicenses();
  const logs = await getLogs();

  const now = new Date();
  const sevenDaysAgo = subDays(now, 6);
  const fourteenDaysAgo = subDays(now, 13);

  const totalValidations = logs.length;
  const successfulValidations = logs.filter(
    (l) => l.status === "success"
  ).length;

  const last7 = logs.filter(
    (l) => new Date(l.timestamp) >= startOfDay(sevenDaysAgo)
  ).length;

  const prev7 = logs.filter((l) => {
    const d = new Date(l.timestamp);
    return (
      d >= startOfDay(fourteenDaysAgo) &&
      d < startOfDay(sevenDaysAgo)
    );
  }).length;

  const validationChangePercent =
    prev7 > 0 ? ((last7 - prev7) / prev7) * 100 : last7 > 0 ? 100 : 0;

  const activeLicenses = licenses.filter(
    (l) => l.status === "active"
  ).length;

  const interval = {
    start: startOfDay(sevenDaysAgo),
    end: now,
  };

  const dailyNewUsers: DailyNewUsersData[] = eachDayOfInterval(interval).map(
    (day) => ({
      date: format(day, "MMM d"),
      users: 0,
    })
  );

  const newLicenseDistribution: NewLicenseDistributionData[] = [
    { name: "New Customers", value: 0, fill: "hsl(var(--chart-1))" },
    { name: "Existing Customers", value: 0, fill: "hsl(var(--chart-2))" },
  ];

  const dailyWebhookCreations: DailyWebhookCreationsData[] =
    eachDayOfInterval(interval).map((day) => ({
      date: format(day, "MMM d"),
      creations: 0,
    }));

  return {
    totalProducts: products.length,
    totalLicenses: licenses.length,
    activeLicenses,
    totalValidations,
    successfulValidations,
    validationChangePercent,
    dailyNewUsers,
    newLicenseDistribution,
    dailyWebhookCreations,
  };
}
