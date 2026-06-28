"use server";

import path from "path";
import type {
  Product,
  License,
  ValidationLog,
  Settings,
  Blacklist,
  Customer,
  Voucher,
} from "./types";

import { unstable_noStore as noStore } from "next/cache";
import { subDays, startOfDay, format, eachDayOfInterval } from "date-fns";

/**
 * 🚨 VERCEL FIX:
 * File system is READ-ONLY on deployment.
 * We keep an in-memory fallback so app DOES NOT crash.
 */

const dataDir = path.join(process.cwd(), "data");

// -------------------------
// In-memory fallback store
// -------------------------
const memoryStore: Record<string, any> = {
  "products.json": [],
  "licenses.json": [],
  "logs.json": [],
  "bot-logs.json": [],
  "vouchers.json": [],
  "settings.json": {},
  "blacklist.json": { ips: [], hwids: [], discordIds: [] },
};

// -------------------------
// SAFE READ (NO FS WRITE)
// -------------------------
async function readFile<T>(filename: string, defaultValue: T): Promise<T> {
  try {
    // Try static import from /data (works locally)
    const filePath = path.join(dataDir, filename);

    const fs = await import("fs/promises");
    const data = await fs.readFile(filePath, "utf-8");

    if (!data) return defaultValue;
    return JSON.parse(data) as T;
  } catch {
    // fallback to memory (Vercel-safe)
    if (!memoryStore[filename]) {
      memoryStore[filename] = defaultValue;
    }
    return memoryStore[filename];
  }
}

// -------------------------
// SAFE WRITE (NO VERCEL FS)
// -------------------------
async function writeFile<T>(filename: string, data: T): Promise<void> {
  // store ONLY in memory on Vercel
  memoryStore[filename] = data;

  // try local dev write (ignored on Vercel)
  try {
    const fs = await import("fs/promises");
    const filePath = path.join(dataDir, filename);
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
  } catch {
    // ignore on Vercel
  }
}

// -------------------------
// PRODUCTS
// -------------------------
export async function getProducts() {
  noStore();
  return await readFile<Product[]>("products.json", []);
}

export async function saveProducts(products: Product[]) {
  await writeFile("products.json", products);
}

// -------------------------
// LICENSES
// -------------------------
export async function getLicenses() {
  noStore();
  return await readFile<License[]>("licenses.json", []);
}

export async function saveLicenses(licenses: License[]) {
  await writeFile("licenses.json", licenses);
}

// -------------------------
// LOGS
// -------------------------
export async function getLogs() {
  noStore();
  return await readFile<ValidationLog[]>("logs.json", []);
}

export async function saveLogs(logs: ValidationLog[]) {
  await writeFile("logs.json", logs);
}

// -------------------------
// VOUCHERS
// -------------------------
export async function getVouchers() {
  noStore();
  return await readFile<Voucher[]>("vouchers.json", []);
}

export async function saveVouchers(vouchers: Voucher[]) {
  await writeFile("vouchers.json", vouchers);
}

// -------------------------
// SETTINGS
// -------------------------
export async function getSettings(): Promise<Settings> {
  noStore();

  const defaultSettings: Settings = {
    apiKey: "",
    panelUrl: "",
    adminApiEnabled: false,
    clientPanel: {
      enabled: false,
      accentColor: "#3b82f6",
    },
  } as Settings;

  const settings = await readFile<Settings>("settings.json", defaultSettings);
  return settings;
}

export async function saveSettings(settings: Settings) {
  await writeFile("settings.json", settings);
}

// -------------------------
// BLACKLIST
// -------------------------
export async function getBlacklist(): Promise<Blacklist> {
  noStore();
  return await readFile<Blacklist>("blacklist.json", {
    ips: [],
    hwids: [],
    discordIds: [],
  });
}

export async function saveBlacklist(blacklist: Blacklist) {
  await writeFile("blacklist.json", blacklist);
}
