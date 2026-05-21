/**
 * Typed Cloudflare REST API client.
 *
 * Direct `fetch` calls (no extra binary needed in CI) covering exactly what
 * the orchestrator scripts need: zone lookup/creation and DNS record CRUD.
 *
 * Required env: CLOUDFLARE_API_TOKEN. Account ID required only for zone
 * creation and is read from CLOUDFLARE_ACCOUNT_ID.
 */

const API_BASE = "https://api.cloudflare.com/client/v4";

export type CloudflareErrorEntry = { readonly code: number; readonly message: string };

export type CloudflareResponse<T> = {
  readonly success: boolean;
  readonly errors: readonly CloudflareErrorEntry[];
  readonly messages: readonly CloudflareErrorEntry[];
  readonly result: T;
  readonly result_info?: {
    readonly page: number;
    readonly per_page: number;
    readonly total_count: number;
    readonly count: number;
  };
};

export type CloudflareZone = {
  readonly id: string;
  readonly name: string;
  readonly status: string;
  readonly name_servers?: readonly string[];
};

export type CloudflareDnsRecord = {
  readonly id: string;
  readonly name: string;
  readonly type: string;
  readonly content: string;
  readonly proxied: boolean;
  readonly ttl: number;
  readonly comment?: string | null;
  readonly zone_id?: string;
  readonly zone_name?: string;
};

export type CloudflareDnsRecordInput = {
  readonly name: string;
  readonly type: "CNAME" | "A" | "AAAA" | "TXT" | "MX";
  readonly content: string;
  readonly proxied?: boolean;
  readonly ttl?: number;
  readonly comment?: string;
};

export class CloudflareApiError extends Error {
  constructor(
    readonly method: string,
    readonly path: string,
    readonly status: number,
    readonly errors: readonly CloudflareErrorEntry[],
  ) {
    super(
      `Cloudflare API ${method} ${path} failed (HTTP ${status}): ${
        errors.map((e) => `[${e.code}] ${e.message}`).join("; ") || "unknown error"
      }`,
    );
    this.name = "CloudflareApiError";
  }
}

export class CloudflareApi {
  private readonly token: string;

  constructor(token: string = process.env["CLOUDFLARE_API_TOKEN"]?.trim() ?? "") {
    if (!token) {
      throw new Error(
        "CLOUDFLARE_API_TOKEN is required (Cloudflare API token with Zone:Edit + DNS:Edit).",
      );
    }
    this.token = token;
  }

  async request<T>(
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
  ): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      Accept: "application/json",
    };
    const init: RequestInit = { method, headers };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const res = await fetch(`${API_BASE}${path}`, init);
    const text = await res.text();
    let parsed: CloudflareResponse<T>;
    try {
      parsed = JSON.parse(text) as CloudflareResponse<T>;
    } catch {
      throw new Error(`Cloudflare API ${method} ${path} returned non-JSON (HTTP ${res.status}): ${text}`);
    }
    if (!parsed.success) {
      throw new CloudflareApiError(method, path, res.status, parsed.errors);
    }
    return parsed.result;
  }

  /** Find a zone by exact name (e.g. "chrisvouga.dev"). Returns null if missing. */
  async findZoneByName(zoneName: string): Promise<CloudflareZone | null> {
    const result = await this.request<readonly CloudflareZone[]>(
      "GET",
      `/zones?name=${encodeURIComponent(zoneName)}`,
    );
    return result[0] ?? null;
  }

  async getZone(zoneId: string): Promise<CloudflareZone> {
    return this.request<CloudflareZone>("GET", `/zones/${encodeURIComponent(zoneId)}`);
  }

  /** Create a zone in the given account. */
  async createZone(zoneName: string, accountId: string): Promise<CloudflareZone> {
    return this.request<CloudflareZone>("POST", "/zones", {
      name: zoneName,
      account: { id: accountId },
      type: "full",
    });
  }

  async ensureZone(zoneName: string, accountId: string): Promise<CloudflareZone> {
    const existing = await this.findZoneByName(zoneName);
    if (existing) return existing;
    return this.createZone(zoneName, accountId);
  }

  async listDnsRecords(zoneId: string): Promise<readonly CloudflareDnsRecord[]> {
    const out: CloudflareDnsRecord[] = [];
    let page = 1;
    for (;;) {
      const result = await this.request<readonly CloudflareDnsRecord[]>(
        "GET",
        `/zones/${encodeURIComponent(zoneId)}/dns_records?per_page=100&page=${page}`,
      );
      out.push(...result);
      if (result.length < 100) break;
      page += 1;
      if (page > 50) break;
    }
    return out;
  }

  async createDnsRecord(
    zoneId: string,
    record: CloudflareDnsRecordInput,
  ): Promise<CloudflareDnsRecord> {
    return this.request<CloudflareDnsRecord>(
      "POST",
      `/zones/${encodeURIComponent(zoneId)}/dns_records`,
      record,
    );
  }

  async updateDnsRecord(
    zoneId: string,
    recordId: string,
    record: CloudflareDnsRecordInput,
  ): Promise<CloudflareDnsRecord> {
    return this.request<CloudflareDnsRecord>(
      "PUT",
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
      record,
    );
  }

  async deleteDnsRecord(zoneId: string, recordId: string): Promise<void> {
    await this.request<{ id: string }>(
      "DELETE",
      `/zones/${encodeURIComponent(zoneId)}/dns_records/${encodeURIComponent(recordId)}`,
    );
  }
}

export function getCloudflareAccountId(): string {
  const id = process.env["CLOUDFLARE_ACCOUNT_ID"]?.trim();
  if (!id) {
    throw new Error("CLOUDFLARE_ACCOUNT_ID is required (set as GitHub repo secret).");
  }
  return id;
}
