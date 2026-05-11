import { z } from "zod";

export const SyncRequest = z.object({
  baseUrl: z.url("baseUrl 必须是有效 URL"),
  apiToken: z.string().min(1, "apiToken 不能为空"),
  r2Endpoint: z.url("r2Endpoint 必须是有效 URL"),
  r2AccessKeyId: z.string().min(1, "r2AccessKeyId 不能为空"),
  r2SecretAccessKey: z.string().min(1, "r2SecretAccessKey 不能为空"),
  r2Bucket: z.string().min(1, "r2Bucket 不能为空"),
  channelName: z.string().min(1, "channelName 不能为空"),
  prefix: z.string().default(""),
  region: z.string().default("auto"),
  pageSize: z.int().positive().default(1000),
  checkConcurrency: z.int().positive().default(20),
  restoreBatchSize: z.int().positive().default(200),
  overwrite: z.boolean().default(false),
  skipRebuild: z.boolean().default(false),
});

export type SyncRequest = z.infer<typeof SyncRequest>;
