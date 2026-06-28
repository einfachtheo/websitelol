"use server";

import fs from "fs/promises";
import path from "path";
import { unstable_noStore as noStore } from "next/cache";
import {
  subDays,
  startOfDay,
  format,
  eachDayOfInterval,
} from "date-fns";
import { sendWebhook } from "./logging";
import type {
  Product,
  License,
  ValidationLog,
  Settings,
  Blacklist,
  Customer,
  Voucher,
  DailyNewUsersData,
  NewLicenseDistributionData,
  DashboardStats,
  BotLog,
  DailyCommandUsage,
  DailyWebhookCreationsData,
} from "./types";

const dataDir = path.join(process.cwd(), "data");

/* ---------------- FILE HELPERS ---------------- */

async function ensureDir() {
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
  }
}

async function readFile<T>(filename: string, defaultValue: T): Promise<T> {
  await ensureDir();
  const filePath = path.join(dataDir, filename);

  try {
    const data = await fs.readFile(filePath, "utf-8");
    if (!data) return defaultValue;
    return JSON.parse(data) as T;
  } catch {
    await writeFile(filename, defaultValue);
    return defaultValue;
  }
}

async function writeFile<T>(filename: string, data: T): Promise<void> {
  await ensureDir();
  const filePath = path.join(dataDir, filename);
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8");
}

/* ---------------- BASIC CRUD ---------------- */

export async function getProducts() {
  noStore();
  return readFile<Product[]>("products.json", []);
}

export async function saveProducts(products: Product[]) {
  return writeFile("products.json", products);
}

export async function getLicenses() {
  noStore();
  return readFile<License[]>("licenses.json", []);
}

export async function saveLicenses(data: License[]) {
  return writeFile("licenses.json", data);
}

export async function getLogs() {
  noStore();
  return readFile<ValidationLog[]>("logs.json", []);
}

export async function saveLogs(data: ValidationLog[]) {
  return writeFile("logs.json", data);
}

export async function getVouchers() {
  noStore();
  return readFile<Voucher[]>("vouchers.json", []);
}

export async function saveVouchers(data: Voucher[]) {
  return writeFile("vouchers.json", data);
}

export async function getBlacklist() {
  noStore();
  return readFile<Blacklist>("blacklist.json", {
    ips: [],
    hwids: [],
    discordIds: [],
  });
}

export async function saveBlacklist(data: Blacklist) {
  return writeFile("blacklist.json", data);
}

/* ---------------- SETTINGS ---------------- */

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
    adminApiEndpoints: {
      getLicenses: true,
      createLicense: true,
      updateLicense: true,
      deleteLicense: true,
      updateIdentities: true,
      renewLicense: true,
      manageTeam: true,
      addSubUser: true,
      removeSubUser: true,
    },
    validationResponse: {
      requireDiscordId: true,
      customSuccessMessage: {
        enabled: true,
        message: "License key is valid",
      },
      license: { enabled: false, fields: {} },
      customer: { enabled: false, fields: {} },
      product: { enabled: false, fields: {} },
    },
    builtByBitWebhookSecret: {
      enabled: false,
      secret: "",
      disableIpProtection: false,
      maxIps: 1,
      enableHwidProtection: false,
      maxHwids: 1,
    },
    discordBot: {
      enabled: false,
      clientId: "",
      guildId: "",
      botSecret: "",
      adminIds: [],
      commands: {},
      presence: {
        status: "online",
        activity: { type: "Watching", name: "licenses" },
      },
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
  };

  const data = await readFile<Settings>("settings.json", defaults);
  return { ...defaults, ...data };
}

export async function saveSettings(data: Settings) {
  return writeFile("settings.json", data);
}

/* ---------------- DASHBOARD ---------------- */

export async function getDashboardStats(): Promise<DashboardStats> {
  noStore();

  const products = await getProducts();
  const licenses = await getLicenses();
  const logs = await getLogs();

  const now = new Date();
  const interval = {
    start: startOfDay(subDays(now, 6)),
    end: now,
  };

  const activeLicenses = licenses.filter((l) => l.status === "active").length;

  const dailyNewUsers: DailyNewUsersData[] = eachDayOfInterval(interval).map(
    (d) => ({
      date: format(d, "MMM d"),
      users: 0,
    })
  );

  return {
    totalProducts: products.length,
    totalLicenses: licenses.length,
    activeLicenses,
    totalValidations: logs.length,
    successfulValidations: logs.filter((l) => l.status === "success").length,
    validationChangePercent: 0,
    dailyNewUsers,
    newLicenseDistribution: [
      { name: "New Customers", value: 0, fill: "#000" },
      { name: "Existing Customers", value: 0, fill: "#999" },
    ],
    dailyWebhookCreations: [],
  };
}
