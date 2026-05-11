import { Hono } from "hono";
import { SyncRequest } from "../schema/sync";
import { runR2D1Sync } from "../service/r2-d1-sync";
import result from "../utils/result";

type SyncEnv = {
  Bindings: {
    R2_D1_SYNC_BASE_URL?: string;
    R2_D1_SYNC_API_TOKEN?: string;
    R2_D1_SYNC_R2_ENDPOINT?: string;
    R2_D1_SYNC_R2_ACCESS_KEY_ID?: string;
    R2_D1_SYNC_R2_SECRET_ACCESS_KEY?: string;
    R2_D1_SYNC_R2_BUCKET?: string;
    R2_D1_SYNC_CHANNEL_NAME?: string;
    R2_D1_SYNC_PREFIX?: string;
    R2_D1_SYNC_REGION?: string;
    R2_D1_SYNC_PAGE_SIZE?: string;
    R2_D1_SYNC_CHECK_CONCURRENCY?: string;
    R2_D1_SYNC_RESTORE_BATCH_SIZE?: string;
  };
};

const syncRouter = new Hono<SyncEnv>().basePath("/sync");

function getSyncDefaults(env: SyncEnv["Bindings"]) {
  return {
    baseUrl: env.R2_D1_SYNC_BASE_URL ?? "",
    apiToken: env.R2_D1_SYNC_API_TOKEN ?? "",
    r2Endpoint: env.R2_D1_SYNC_R2_ENDPOINT ?? "",
    r2AccessKeyId: env.R2_D1_SYNC_R2_ACCESS_KEY_ID ?? "",
    r2SecretAccessKey: env.R2_D1_SYNC_R2_SECRET_ACCESS_KEY ?? "",
    r2Bucket: env.R2_D1_SYNC_R2_BUCKET ?? "",
    channelName: env.R2_D1_SYNC_CHANNEL_NAME ?? "default",
    prefix: env.R2_D1_SYNC_PREFIX ?? "",
    region: env.R2_D1_SYNC_REGION ?? "auto",
    pageSize: Number(env.R2_D1_SYNC_PAGE_SIZE || 1000),
    checkConcurrency: Number(env.R2_D1_SYNC_CHECK_CONCURRENCY || 20),
    restoreBatchSize: Number(env.R2_D1_SYNC_RESTORE_BATCH_SIZE || 200),
  };
}

syncRouter.get("/defaults", (c) => {
  return result.success(getSyncDefaults(c.env), c);
});

syncRouter.post("/r2-d1", async (c) => {
  const body = await c.req.json();
  const payload = SyncRequest.parse({
    ...getSyncDefaults(c.env),
    ...body,
  });
  const data = await runR2D1Sync(payload);
  return result.success(data, c);
});

export default syncRouter;
