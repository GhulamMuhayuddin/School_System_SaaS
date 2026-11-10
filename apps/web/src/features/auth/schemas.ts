import { z } from 'zod';

// Error messages are i18n keys; components translate them with t().
const email = z.string().trim().min(1, 'validation.required').email('validation.email');

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'validation.required'),
  remember: z.boolean().optional(),
});

export const forgotPasswordSchema = z.object({ email });

export const resetPasswordSchema = z
  .object({
    password: z.string().min(8, 'validation.passwordMin'),
    confirmPassword: z.string().min(1, 'validation.required'),
  })
  .refine((v) => v.password === v.confirmPassword, { path: ['confirmPassword'], message: 'validation.passwordMatch' });

export type LoginValues = z.infer<typeof loginSchema>;
export type ForgotPasswordValues = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordValues = z.infer<typeof resetPasswordSchema>;
