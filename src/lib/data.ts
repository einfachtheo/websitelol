"use server";

import { kv } from "@vercel/kv";
import { unstable_noStore as noStore } from "next/cache";
import { subDays, startOfDay, format, eachDayOfInterval } from "date-fns";
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

/* -------------------------
   KV KEY HELPERS
--------------------------*/
const key = (k: string) => `zeus:${k}`;

/* -------------------------
   GENERIC HELPERS
--------------------------*/
async function getKV<T>(k: string, fallback: T): Promise<T> {
  const data = await kv.get<T>(key(k));
  return data ?? fallback;
}

async function setKV<T>(k: string, value: T) {
  await kv.set(key(k), value);
}

/* -------------------------
   PRODUCTS
--------------------------*/
export async function getProducts() {
  noStore();
  return await getKV<Product[]>("products", []);
}

export async function saveProducts(products: Product[]) {
  await setKV("products", products);
}

/* -------------------------
   LICENSES
--------------------------*/
export async function getLicenses(options?: { filterOut?: string[] }) {
  noStore();
  let licenses = await getKV<License[]>("licenses", []);

  if (options?.filterOut) {
    licenses = licenses.filter(
      (l) => !options.filterOut?.includes(l.discordId)
    );
  }

  return licenses;
}

export async function saveLicenses(licenses: License[]) {
  await setKV("licenses", licenses);
}

/* -------------------------
   LOGS
--------------------------*/
export async function getLogs() {
  noStore();
  return await getKV<ValidationLog[]>("logs", []);
}

export async function saveLogs(logs: ValidationLog[]) {
  await setKV("logs", logs);
}

export async function addLog(log: Omit<ValidationLog, "id">) {
  const logs = await getLogs();
  const newLog: ValidationLog = { ...log, id: crypto.randomUUID() };
  logs.unshift(newLog);
  await setKV("logs", logs.slice(0, 500));
}

/* -------------------------
   BOT LOGS
--------------------------*/
export async function getBotLogs() {
  noStore();
  return await getKV<BotLog[]>("bot_logs", []);
}

export async function saveBotLogs(logs: BotLog[]) {
  await setKV("bot_logs", logs);
}

export async function logBotCommand(command: string, userId: string) {
  const logs = await getBotLogs();

  logs.unshift({
    command,
    userId,
    timestamp: new Date().toISOString(),
  });

  await setKV("bot_logs", logs.slice(0, 1000));

  const settings = await getSettings();

  if (settings.logging.enabled && settings.logging.logBotCommands) {
    await sendWebhook({
      title: "Bot Command Executed",
      description: `User \`${userId}\` executed a command.`,
      timestamp: new Date().toISOString(),
      fields: [
        { name: "Command", value: `/${command}`, inline: true },
        { name: "User", value: userId, inline: true },
      ],
    });
  }
}

/* -------------------------
   VOUCHERS
--------------------------*/
export async function getVouchers() {
  noStore();
  return await getKV<Voucher[]>("vouchers", []);
}

export async function saveVouchers(vouchers: Voucher[]) {
  await setKV("vouchers", vouchers);
}

/* -------------------------
   SETTINGS
--------------------------*/
export async function getSettings(): Promise<Settings> {
  noStore();

  const defaultSettings: Settings = {
    apiKey: "",
    panelUrl: "",
    adminApiEnabled: false,
    clientPanel: { enabled: false, accentColor: "#3b82f6" },
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

  const settings = await getKV<Settings>("settings", defaultSettings);
  return settings;
}

export async function saveSettings(settings: Settings) {
  await setKV("settings", settings);
}

/* -------------------------
   BLACKLIST
--------------------------*/
export async function getBlacklist() {
  noStore();
  return await getKV<Blacklist>("blacklist", {
    ips: [],
    hwids: [],
    discordIds: [],
  });
}

export async function saveBlacklist(blacklist: Blacklist) {
  await setKV("blacklist", blacklist);
}

/* -------------------------
   DASHBOARD STATS (UNCHANGED LOGIC)
--------------------------*/
export async function getDashboardStats(): Promise<DashboardStats> {
  noStore();

  const products = await getProducts();
  const licenses = await getLicenses();
  const logs = await getLogs();

  const totalValidations = logs.length;
  const successfulValidations = logs.filter(
    (l) => l.status === "success"
  ).length;

  const now = new Date();
  const sevenDaysAgo = subDays(now, 6);

  const validationsLast7Days = logs.filter(
    (l) => new Date(l.timestamp) >= startOfDay(sevenDaysAgo)
  ).length;

  return {
    totalProducts: products.length,
    totalLicenses: licenses.length,
    activeLicenses: licenses.length,
    totalValidations,
    successfulValidations,
    validationChangePercent: 0,
    dailyNewUsers: [],
    newLicenseDistribution: [],
    dailyWebhookCreations: [],
  };
}
