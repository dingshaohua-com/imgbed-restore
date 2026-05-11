import mime from "mime-types";
import type { SyncRequest } from "../schema/sync";

type ObjectMeta = {
  Key?: string;
  Size?: number;
  LastModified?: Date;
};

type RestoreResponse = {
  success?: boolean;
  restoredCount?: number;
};

type R2ListObjectsOptions = {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  prefix: string;
  pageSize: number;
  continuationToken?: string;
};

export type SyncResult = {
  objectTotal: number;
  writeTotal: number;
  skippedExisting: number;
  rebuildTriggered: boolean;
};

function normalizeBaseUrl(url: string): string {
  return url.replace(/\/+$/, "");
}

function encodeFileIdForPath(fileId: string): string {
  return fileId
    .split("/")
    .map((part) => encodeURIComponent(part))
    .join("/");
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toHex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function awsEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (char) =>
    `%${char.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function encodePathSegment(value: string): string {
  return value.split("/").map(awsEncode).join("/");
}

function formatAmzDate(date: Date): { amzDate: string; dateStamp: string } {
  const iso = date.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return {
    amzDate: iso,
    dateStamp: iso.slice(0, 8),
  };
}

async function sha256Hex(value: string): Promise<string> {
  return toHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

async function hmacSha256(key: ArrayBuffer | Uint8Array, value: string): Promise<ArrayBuffer> {
  return crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey(
      "raw",
      key,
      {
        name: "HMAC",
        hash: "SHA-256",
      },
      false,
      ["sign"],
    ),
    new TextEncoder().encode(value),
  );
}

async function getSigningKey(secretAccessKey: string, dateStamp: string, region: string): Promise<ArrayBuffer> {
  const kDate = await hmacSha256(new TextEncoder().encode(`AWS4${secretAccessKey}`), dateStamp);
  const kRegion = await hmacSha256(kDate, region);
  const kService = await hmacSha256(kRegion, "s3");
  return hmacSha256(kService, "aws4_request");
}

function buildCanonicalQuery(params: Record<string, string>): string {
  return Object.entries(params)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${awsEncode(key)}=${awsEncode(value)}`)
    .join("&");
}

function decodeXmlText(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function readXmlTag(block: string, tagName: string): string | undefined {
  const match = block.match(new RegExp(`<${tagName}>([\\s\\S]*?)</${tagName}>`));
  return match ? decodeXmlText(match[1]) : undefined;
}

function parseListObjectsXml(xml: string): {
  contents: ObjectMeta[];
  isTruncated: boolean;
  nextContinuationToken?: string;
} {
  const contents = [...xml.matchAll(/<Contents>([\s\S]*?)<\/Contents>/g)].map((match) => {
    const block = match[1];
    const lastModified = readXmlTag(block, "LastModified");
    return {
      Key: readXmlTag(block, "Key"),
      Size: Number(readXmlTag(block, "Size") ?? 0),
      LastModified: lastModified ? new Date(lastModified) : undefined,
    };
  });

  return {
    contents,
    isTruncated: readXmlTag(xml, "IsTruncated") === "true",
    nextContinuationToken: readXmlTag(xml, "NextContinuationToken"),
  };
}

async function listR2ObjectsPage(options: R2ListObjectsOptions): Promise<{
  contents: ObjectMeta[];
  isTruncated: boolean;
  nextContinuationToken?: string;
}> {
  const endpoint = options.endpoint.replace(/\/+$/, "");
  const endpointUrl = new URL(endpoint);
  const canonicalUri = `/${encodePathSegment(options.bucket)}`;
  const queryParams: Record<string, string> = {
    "list-type": "2",
    "max-keys": String(options.pageSize),
  };

  if (options.prefix) {
    queryParams.prefix = options.prefix;
  }
  if (options.continuationToken) {
    queryParams["continuation-token"] = options.continuationToken;
  }

  const canonicalQuery = buildCanonicalQuery(queryParams);
  const url = `${endpoint}${canonicalUri}?${canonicalQuery}`;
  const { amzDate, dateStamp } = formatAmzDate(new Date());
  const payloadHash = await sha256Hex("");
  const host = endpointUrl.host;
  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonicalRequest = [
    "GET",
    canonicalUri,
    canonicalQuery,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join("\n");
  const credentialScope = `${dateStamp}/${options.region}/s3/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    amzDate,
    credentialScope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signingKey = await getSigningKey(options.secretAccessKey, dateStamp, options.region);
  const signature = toHex(await hmacSha256(signingKey, stringToSign));
  const authorization = [
    `AWS4-HMAC-SHA256 Credential=${options.accessKeyId}/${credentialScope}`,
    `SignedHeaders=${signedHeaders}`,
    `Signature=${signature}`,
  ].join(", ");

  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: authorization,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    },
  });
  const text = await resp.text();

  if (!resp.ok) {
    throw new Error(`R2 列表读取失败: HTTP ${resp.status}, 响应: ${text}`);
  }

  return parseListObjectsXml(text);
}

async function withRetry<T>(
  taskName: string,
  fn: () => Promise<T>,
  maxAttempts = 3,
  delayMs = 500,
): Promise<T> {
  let lastError: unknown;
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (i < maxAttempts) {
        console.warn(`[retry] ${taskName} attempt ${i} failed`, error);
        await sleep(delayMs * i);
      }
    }
  }
  throw lastError;
}

async function listAllObjects(
  options: Omit<R2ListObjectsOptions, "continuationToken">,
): Promise<ObjectMeta[]> {
  const objects: ObjectMeta[] = [];
  let continuationToken: string | undefined;

  while (true) {
    const resp = await withRetry("ListObjectsV2", () =>
      listR2ObjectsPage({
        ...options,
        continuationToken,
      }),
    );

    const pageItems = resp.contents;
    objects.push(...pageItems);

    if (!resp.isTruncated) {
      break;
    }
    if (!resp.nextContinuationToken) {
      throw new Error("R2 列表分页失败: 响应缺少 NextContinuationToken");
    }
    continuationToken = resp.nextContinuationToken;
  }

  return objects;
}

function buildMetadataFromObject(
  objectKey: string,
  objectSize: number | undefined,
  lastModified: Date | undefined,
  channelName: string,
) {
  const fileName = objectKey.split("/").pop() ?? objectKey;
  const directory = objectKey.includes("/")
    ? `${objectKey.slice(0, objectKey.lastIndexOf("/"))}/`
    : "";
  const fileType = mime.lookup(fileName) || "application/octet-stream";
  const fileSizeBytes = Number(objectSize ?? 0);
  const fileSizeMB = (fileSizeBytes / 1024 / 1024).toFixed(2);
  const timeStamp = lastModified instanceof Date ? lastModified.getTime() : Date.now();

  return {
    FileName: fileName,
    FileType: fileType,
    FileSize: fileSizeMB,
    FileSizeBytes: fileSizeBytes,
    UploadIP: "sync-server",
    UploadAddress: "sync-server",
    ListType: "None",
    TimeStamp: timeStamp,
    Label: "None",
    Directory: directory,
    Tags: [],
    Channel: "CloudflareR2",
    ChannelName: channelName,
  };
}

async function checkFileExists(baseUrl: string, token: string, fileId: string): Promise<boolean> {
  const path = encodeFileIdForPath(fileId);
  const url = `${baseUrl}/file/${path}?from=admin`;

  const resp = await withRetry(
    `HEAD /file/${fileId}`,
    () =>
      fetch(url, {
        method: "HEAD",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }),
    2,
    300,
  );

  if (resp.status === 200 || resp.status === 206 || resp.status === 304) {
    return true;
  }
  if (resp.status === 404) {
    return false;
  }
  if (resp.status === 401 || resp.status === 403) {
    throw new Error(`鉴权失败(${resp.status})，请检查 API Token 是否有 manage 权限`);
  }
  throw new Error(`检查文件存在性失败: HTTP ${resp.status}`);
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, idx: number) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let current = 0;

  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const idx = current;
      current += 1;
      if (idx >= items.length) {
        return;
      }
      results[idx] = await mapper(items[idx], idx);
    }
  });

  await Promise.all(workers);
  return results;
}

async function restoreBatch(
  baseUrl: string,
  token: string,
  batchMap: Record<string, { metadata: ReturnType<typeof buildMetadataFromObject> }>,
): Promise<RestoreResponse> {
  const url = `${baseUrl}/api/manage/batch/restore/chunk`;
  const body = {
    type: "files",
    data: batchMap,
  };

  const resp = await withRetry("POST /api/manage/batch/restore/chunk", () =>
    fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(body),
    }),
  );

  const text = await resp.text();
  let json: RestoreResponse;
  try {
    json = text ? (JSON.parse(text) as RestoreResponse) : {};
  } catch {
    json = {};
  }

  if (!resp.ok || json.success === false) {
    throw new Error(`写入失败: HTTP ${resp.status}, 响应: ${text}`);
  }

  return json;
}

async function rebuildIndex(baseUrl: string, token: string): Promise<void> {
  const url = `${baseUrl}/api/manage/list?action=rebuild`;
  const resp = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`触发重建失败: HTTP ${resp.status}, 响应: ${text}`);
  }
}

function chunkArray<T>(arr: T[], chunkSize: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += chunkSize) {
    chunks.push(arr.slice(i, i + chunkSize));
  }
  return chunks;
}

export async function runR2D1Sync(payload: SyncRequest): Promise<SyncResult> {
  const baseUrl = normalizeBaseUrl(payload.baseUrl);

  const objects = await listAllObjects({
    region: payload.region,
    endpoint: payload.r2Endpoint,
    accessKeyId: payload.r2AccessKeyId,
    secretAccessKey: payload.r2SecretAccessKey,
    bucket: payload.r2Bucket,
    prefix: payload.prefix,
    pageSize: payload.pageSize,
  });
  if (objects.length === 0) {
    return {
      objectTotal: 0,
      writeTotal: 0,
      skippedExisting: 0,
      rebuildTriggered: false,
    };
  }

  let syncTargets = objects;
  let skippedExisting = 0;

  if (!payload.overwrite) {
    const existenceResults = await mapWithConcurrency(objects, payload.checkConcurrency, async (obj) => {
      const key = obj.Key;
      if (!key) {
        return { exists: true, key: "", empty: true };
      }
      const exists = await checkFileExists(baseUrl, payload.apiToken, key);
      return { exists, key };
    });

    const targetKeys = new Set<string>();
    for (const result of existenceResults) {
      if (result.empty) {
        continue;
      }
      if (!result.exists) {
        targetKeys.add(result.key);
      } else {
        skippedExisting += 1;
      }
    }

    syncTargets = objects.filter((o) => o.Key && targetKeys.has(o.Key));
  }

  if (syncTargets.length === 0) {
    return {
      objectTotal: objects.length,
      writeTotal: 0,
      skippedExisting,
      rebuildTriggered: false,
    };
  }

  const batches = chunkArray(syncTargets, payload.restoreBatchSize);
  let restoredCount = 0;

  for (const batch of batches) {
    const payloadMap: Record<string, { metadata: ReturnType<typeof buildMetadataFromObject> }> = {};
    for (const object of batch) {
      const key = object.Key;
      if (!key) {
        continue;
      }
      payloadMap[key] = {
        metadata: buildMetadataFromObject(key, object.Size, object.LastModified, payload.channelName),
      };
    }

    const res = await restoreBatch(baseUrl, payload.apiToken, payloadMap);
    restoredCount += res.restoredCount ?? Object.keys(payloadMap).length;
  }

  let rebuildTriggered = false;
  if (!payload.skipRebuild) {
    await rebuildIndex(baseUrl, payload.apiToken);
    rebuildTriggered = true;
  }

  return {
    objectTotal: objects.length,
    writeTotal: restoredCount,
    skippedExisting,
    rebuildTriggered,
  };
}
