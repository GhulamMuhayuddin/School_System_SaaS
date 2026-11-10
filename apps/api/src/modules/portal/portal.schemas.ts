import { z } from 'zod';

export const voucherParam = z.object({ studentId: z.string().uuid(), voucherId: z.string().uuid() });
