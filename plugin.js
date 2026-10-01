import { success } from "./sdk.mjs";
const DEFAULT_SOURCE_URL = "https://www.tingreader.cn/api/plugins";

async function listPlugins(params) {
  const sourceUrl = normalizeSourceUrl(Ting?.config?.source_url || DEFAULT_SOURCE_URL);
  const response = await fetch(sourceUrl, {
    headers: {
      accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Plugin source returned status ${response.status}`);
  }

  const data = await response.json();
  const plugins = Array.isArray(data) ? data : data?.plugins;
  if (!Array.isArray(plugins)) {
    throw new Error("Plugin source must return an array or an object with a plugins array");
  }

  return {
    source_url: sourceUrl,
    refreshed: params?.force_refresh === true,
    plugins,
  };
}

function normalizeSourceUrl(value) {
  const sourceUrl = String(value || DEFAULT_SOURCE_URL).trim();
  if (!sourceUrl) return DEFAULT_SOURCE_URL;

  const parsed = new URL(sourceUrl);
  if (parsed.protocol !== "https:" && !isLocalHttpSource(parsed)) {
    throw new Error("Plugin source URL must use HTTPS, or HTTP for local/LAN testing");
  }
  return parsed.toString();
}

function isLocalHttpSource(parsed) {
  if (parsed.protocol !== "http:") return false;
  const rawHost = String(parsed.hostname || "")
    .replace(/^\[/, "")
    .replace(/\](:\d+)?$/, "");
  if (rawHost === "::1") return true;
  const host = rawHost.split(":")[0];
  if (host === "localhost" || host === "127.0.0.1" || host === "::1") return true;
  if (host.startsWith("192.168.")) return true;
  if (host.startsWith("10.")) return true;
  const parts = host.split(".").map((part) => Number(part));
  return parts.length === 4 && parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31;
}

export async function list_plugins(params) {
  return success(await listPlugins(params));
}
