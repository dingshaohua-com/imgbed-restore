import { Hono } from "hono";
import { SyncRequest } from "../schema/sync";
import { runR2D1Sync } from "../service/r2-d1-sync";
import result from "../utils/result";

type SyncEnv = {
  Bindings: {
    IMGBED_RESTORE_BASE_URL?: string;
    IMGBED_RESTORE_API_TOKEN?: string;
    IMGBED_RESTORE_R2_ENDPOINT?: string;
    IMGBED_RESTORE_R2_ACCESS_KEY_ID?: string;
    IMGBED_RESTORE_R2_SECRET_ACCESS_KEY?: string;
    IMGBED_RESTORE_R2_BUCKET?: string;
    IMGBED_RESTORE_CHANNEL_NAME?: string;
    IMGBED_RESTORE_PREFIX?: string;
    IMGBED_RESTORE_REGION?: string;
    IMGBED_RESTORE_PAGE_SIZE?: string;
    IMGBED_RESTORE_CHECK_CONCURRENCY?: string;
    IMGBED_RESTORE_RESTORE_BATCH_SIZE?: string;
  };
};

const syncRouter = new Hono<SyncEnv>().basePath("/sync");

function getSyncDefaults(env: SyncEnv["Bindings"]) {
  return {
    baseUrl: env.IMGBED_RESTORE_BASE_URL ?? "",
    apiToken: env.IMGBED_RESTORE_API_TOKEN ?? "",
    r2Endpoint: env.IMGBED_RESTORE_R2_ENDPOINT ?? "",
    r2AccessKeyId: env.IMGBED_RESTORE_R2_ACCESS_KEY_ID ?? "",
    r2SecretAccessKey: env.IMGBED_RESTORE_R2_SECRET_ACCESS_KEY ?? "",
    r2Bucket: env.IMGBED_RESTORE_R2_BUCKET ?? "",
    channelName: env.IMGBED_RESTORE_CHANNEL_NAME ?? "default",
    prefix: env.IMGBED_RESTORE_PREFIX ?? "",
    region: env.IMGBED_RESTORE_REGION ?? "auto",
    pageSize: Number(env.IMGBED_RESTORE_PAGE_SIZE || 1000),
    checkConcurrency: Number(env.IMGBED_RESTORE_CHECK_CONCURRENCY || 20),
    restoreBatchSize: Number(env.IMGBED_RESTORE_RESTORE_BATCH_SIZE || 200),
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
