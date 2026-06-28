"use server";

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

/* ------------------------------------------------------------------ */
/* IN-MEMORY STORAGE (REPLACES FILE SYSTEM)                           */
/* ------------------------------------------------------------------ */

const db = {
  products: [] as Product[],
  licenses: [] as License[],
  logs: [] as ValidationLog[],
  botLogs: [] as BotLog[],
  vouchers: [] as Voucher[],
  blacklist: { ips: [], hwids: [], discordIds: [] } as Blacklist,
  settings: null as Settings | null,
};

/* ------------------------------------------------------------------ */
/* HELPERS                                                            */
/* ------------------------------------------------------------------ */

function getSettingsDefault(): Settings {
  return {
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
      license: {
        enabled: false,
        fields: {
          license_key: true,
          status: true,
          expires_at: true,
          issue_date: true,
          max_ips: true,
          used_ips: true,
        },
      },
      customer: {
        enabled: false,
        fields: {
          id: true,
          discord_id: true,
          customer_since: true,
        },
      },
      product: {
        enabled: false,
        fields: {
          id: true,
          name: true,
          enabled: true,
        },
      },
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
      commands: {
        viewUser: true,
        checkLicenses: true,
        searchLicense: true,
        deactivate: true,
        createLicense: true,
        renewLicense: true,
        profile: true,
        userLicenses: true,
        manageLicense: true,
        redeem: true,
        linkBuiltbybit: true,
      },
      presence: {
        status: "online",
        activity: {
          type: "Watching",
          name: "licenses",
        },
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
}

/* ------------------------------------------------------------------ */
/* PRODUCTS                                                           */
/* ------------------------------------------------------------------ */

export async function getProducts(): Promise<Product[]> {
  noStore();
  return db.products;
}

export async function saveProducts(products: Product[]) {
  db.products = products;
}

/* ------------------------------------------------------------------ */
/* LICENSES                                                           */
/* ------------------------------------------------------------------ */

export async function getLicenses(): Promise<License[]> {
  noStore();
  return db.licenses;
}

export async function saveLicenses(licenses: License[]) {
  db.licenses = licenses;
}

/* ------------------------------------------------------------------ */
/* LOGS                                                               */
/* ------------------------------------------------------------------ */

export async function getLogs(): Promise<ValidationLog[]> {
  noStore();
  return db.logs;
}

export async function saveLogs(logs: ValidationLog[]) {
  db.logs = logs;
}

export async function addLog(log: Omit<ValidationLog, "id">) {
  const logs = await getLogs();
  const newLog: ValidationLog = {
    ...log,
    id: crypto.randomUUID(),
  };
  logs.unshift(newLog);
  db.logs = logs.slice(0, 500);
}

/* ------------------------------------------------------------------ */
/* BOT LOGS                                                           */
/* ------------------------------------------------------------------ */

export async function getBotLogs(): Promise<BotLog[]> {
  noStore();
  return db.botLogs;
}

export async function saveBotLogs(logs: BotLog[]) {
  db.botLogs = logs;
}

export async function logBotCommand(command: string, userId: string) {
  const logs = await getBotLogs();

  logs.unshift({
    command,
    userId,
    timestamp: new Date().toISOString(),
  });

  db.botLogs = logs.slice(0, 1000);

  const settings = await getSettings();

  if (settings.logging.enabled && settings.logging.logBotCommands) {
    await sendWebhook({
      title: "Bot Command Executed",
      description: `User \`${userId}\` executed command.`,
      timestamp: new Date().toISOString(),
      fields: [
        { name: "Command", value: `/${command}`, inline: true },
        { name: "User", value: userId, inline: true },
      ],
    });
  }
}

/* ------------------------------------------------------------------ */
/* VOUCHERS                                                           */
/* ------------------------------------------------------------------ */

export async function getVouchers(): Promise<Voucher[]> {
  noStore();
  return db.vouchers;
}

export async function saveVouchers(vouchers: Voucher[]) {
  db.vouchers = vouchers;
}

/* ------------------------------------------------------------------ */
/* SETTINGS                                                           */
/* ------------------------------------------------------------------ */

export async function getSettings(): Promise<Settings> {
  noStore();

  if (!db.settings) {
    db.settings = getSettingsDefault();
  }

  return db.settings;
}

export async function saveSettings(settings: Settings) {
  db.settings = settings;
}

/* ------------------------------------------------------------------ */
/* BLACKLIST                                                          */
/* ------------------------------------------------------------------ */

export async function getBlacklist(): Promise<Blacklist> {
  noStore();
  return db.blacklist;
}

export async function saveBlacklist(blacklist: Blacklist) {
  db.blacklist = blacklist;
}

/* ------------------------------------------------------------------ */
/* DASHBOARD STATS                                                    */
/* ------------------------------------------------------------------ */

export async function getDashboardStats(): Promise<DashboardStats> {
  noStore();

  const products = await getProducts();
  const licenses = await getLicenses();
  const logs = await getLogs();

  const now = new Date();
  const sevenDaysAgo = subDays(now, 6);
  const fourteenDaysAgo = subDays(now, 13);

  const validationsLast7 = logs.filter(
    (l) => new Date(l.timestamp) >= startOfDay(sevenDaysAgo)
  ).length;

  const validationsPrev7 = logs.filter((l) => {
    const d = new Date(l.timestamp);
    return (
      d >= startOfDay(fourteenDaysAgo) && d < startOfDay(sevenDaysAgo)
    );
  }).length;

  let validationChangePercent = 0;

  if (validationsPrev7 > 0) {
    validationChangePercent =
      ((validationsLast7 - validationsPrev7) / validationsPrev7) * 100;
  }

  const interval = {
    start: startOfDay(sevenDaysAgo),
    end: now,
  };

  const activeLicenses = licenses.filter(
    (l) => l.status === "active"
  ).length;

  const dailyNewUsers: DailyNewUsersData[] = eachDayOfInterval(
    interval
  ).map((d) => ({
    date: format(d, "MMM d"),
    users: 0,
  }));

  const newLicenseDistribution: NewLicenseDistributionData[] = [
    { name: "New Customers", value: 0, fill: "hsl(var(--chart-1))" },
    { name: "Existing Customers", value: 0, fill: "hsl(var(--chart-2))" },
  ];

  const dailyWebhookCreations: DailyWebhookCreationsData[] =
    eachDayOfInterval(interval).map((d) => ({
      date: format(d, "MMM d"),
      creations: 0,
    }));

  return {
    totalProducts: products.length,
    totalLicenses: licenses.length,
    activeLicenses,
    totalValidations: logs.length,
    successfulValidations: logs.length,
    validationChangePercent,
    dailyNewUsers,
    newLicenseDistribution,
    dailyWebhookCreations,
  };
}

/* ------------------------------------------------------------------ */
/* USERS                                                              */
/* ------------------------------------------------------------------ */

export async function getAllUsers(): Promise<Customer[]> {
  noStore();

  const licenses = await getLicenses();
  const ids = new Set<string>();

  licenses.forEach((l) => {
    if (l.discordId) ids.add(l.discordId);
  });

  return Array.from(ids).map((id) => ({
    id,
    discordId: id,
    discordUsername: id,
    avatarUrl: "",
    isOwner: true,
    ownedLicenseCount: licenses.filter((l) => l.discordId === id).length,
    subUserLicenseCount: 0,
  }));
}

/* ------------------------------------------------------------------ */
/* COMMAND USAGE                                                      */
/* ------------------------------------------------------------------ */

export async function getCommandUsageData(): Promise<DailyCommandUsage[]> {
  noStore();

  const botLogs = await getBotLogs();

  const last7Days = eachDayOfInterval({
    start: startOfDay(subDays(new Date(), 6)),
    end: startOfDay(new Date()),
  });

  return last7Days.map((day) => ({
    date: format(day, "MMM d"),
    commands: botLogs.filter(
      (l) => format(new Date(l.timestamp), "MMM d") === format(day, "MMM d")
    ).length,
  }));
}
