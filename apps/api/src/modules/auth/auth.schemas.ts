import { z } from 'zod';

const email = z.string().trim().toLowerCase().email().max(254);
const newPassword = z.string().min(8, 'Password must be at least 8 characters').max(128);

export const loginBody = z.object({
  email,
  password: z.string().min(1).max(256),
  remember: z.boolean().optional(),
});

export const forgotPasswordBody = z.object({ email });

export const resetPasswordBody = z.object({
  token: z.string().min(20).max(200),
  password: newPassword,
});

export const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword,
});
