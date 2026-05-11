import { z } from 'zod';

export const User = z.object({
	id: z.string()
});

// 一键生成 TS 类型:完全等同于手写 interface
export type User = z.infer<typeof User>; 