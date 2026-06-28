// src/lib/data.ts

// Replace uuid library with native crypto (NO DEPENDENCY REQUIRED)
const generateId = () => crypto.randomUUID();

/**
 * Example in-memory fallback (adjust to your real DB/KV if needed)
 */
export const products: any[] = [];
export const customers: any[] = [];
export const licenses: any[] = [];
export const blacklist: any[] = [];
export const records: any[] = [];

/* ---------------- PRODUCTS ---------------- */

export function createProduct(data: any) {
  const product = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...data,
  };

  products.push(product);
  return product;
}

/* ---------------- CUSTOMERS ---------------- */

export function createCustomer(data: any) {
  const customer = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...data,
  };

  customers.push(customer);
  return customer;
}

/* ---------------- LICENSES ---------------- */

export function createLicense(data: any) {
  const license = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    status: "active",
    ...data,
  };

  licenses.push(license);
  return license;
}

/* ---------------- BLACKLIST ---------------- */

export function addToBlacklist(data: any) {
  const entry = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...data,
  };

  blacklist.push(entry);
  return entry;
}

/* ---------------- RECORDS ---------------- */

export function addRecord(data: any) {
  const record = {
    id: generateId(),
    createdAt: new Date().toISOString(),
    ...data,
  };

  records.push(record);
  return record;
}

/* ---------------- SIMPLE GETTERS ---------------- */

export function getDashboardStats() {
  return {
    products: products.length,
    customers: customers.length,
    licenses: licenses.length,
    blacklist: blacklist.length,
    records: records.length,
  };
}
