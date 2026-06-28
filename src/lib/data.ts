"use server";

import { kv } from "@vercel/kv";
import { unstable_noStore as noStore } from "next/cache";
import { subDays, startOfDay, format, eachDayOfInterval } from "date-fns";
import { sendWebhook } from "./logging";
import { v4 as uuid } from "uuid";

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
} from "./types";

/* -----------------------------
   HELPERS (KV STORAGE)
------------------------------*/

async function get<T>(key: string, fallback: T): Promise<T> {
  const data = await kv.get<T>(key);
  return data ?? fallback;
}

async function set<T>(key: string, value: T) {
  await kv.set(key, value);
}

/* -----------------------------
   PRODUCTS
------------------------------*/

export async function getProducts() {
  noStore();
  return await get<Product[]>("products", []);
}

export async function saveProducts(products: Product[]) {
  await set("products", products);
}

/* -----------------------------
   LICENSES
------------------------------*/

export async function getLicenses() {
  noStore();
  return await get<License[]>("licenses", []);
}

export async function saveLicenses(licenses: License[]) {
  await set("licenses", licenses);
}

/* -----------------------------
   LOGS
------------------------------*/

export async function getLogs() {
  noStore();
  return await get<ValidationLog[]>("logs", []);
}

export async function saveLogs(logs: ValidationLog[]) {
  await set("logs", logs);
}

export async function addLog(log: Omit<ValidationLog, "id">) {
  const logs = await getLogs();

  const newLog: ValidationLog = {
    ...log,
    id: uuid(),
  };

  logs.unshift(newLog);

  await saveLogs(logs.slice(0, 500));
}

/* -----------------------------
   BOT LOGS
------------------------------*/

export async function getBotLogs() {
  noStore();
  return await get<BotLog[]>("bot_logs", []);
}

export async function saveBotLogs(logs: BotLog[]) {
  await set("bot_logs", logs);
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

  if (settings.logging?.enabled && settings.logging?.logBotCommands) {
    await sendWebhook({
      title: "Bot Command",
      description: `${userId} used /${command}`,
      timestamp: new Date().toISOString(),
    });
  }
}

/* -----------------------------
   SETTINGS
------------------------------*/

const defaultSettings: Settings = {
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
    license: { enabled: false, fields: {} as any },
    customer: { enabled: false, fields: {} as any },
    product: { enabled: false, fields: {} as any },
  },
  builtByBitWebhookSecret: {
    enabled: false,
    secret: "",
    disableIpProtection: false,
    maxIps: 1,
    enableHwidProtection: false,
    maxHwids: 1,
  },
  builtByBitPlaceholder: {
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
    commands: {} as any,
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

export async function getSettings(): Promise<Settings> {
  noStore();
  const settings = await get<Settings>("settings", defaultSettings);
  return { ...defaultSettings, ...settings };
}

export async function saveSettings(settings: Settings) {
  await set("settings", settings);
}

/* -----------------------------
   BLACKLIST
------------------------------*/

export async function getBlacklist(): Promise<Blacklist> {
  noStore();
  return await get("blacklist", {
    ips: [],
    hwids: [],
    discordIds: [],
  });
}

export async function saveBlacklist(data: Blacklist) {
  await set("blacklist", data);
}

/* -----------------------------
   DASHBOARD (basic safe version)
------------------------------*/

export async function getDashboardStats(): Promise<DashboardStats> {
  noStore();

  const products = await getProducts();
  const licenses = await getLicenses();
  const logs = await getLogs();

  const totalValidations = logs.length;
  const successfulValidations = logs.filter((l) => l.status === "success").length;

  const activeLicenses = licenses.filter((l) => l.status === "active").length;

  return {
    totalProducts: products.length,
    totalLicenses: licenses.length,
    activeLicenses,
    totalValidations,
    successfulValidations,
    validationChangePercent: 0,
    dailyNewUsers: [],
    newLicenseDistribution: [],
    dailyWebhookCreations: [],
  };
}
