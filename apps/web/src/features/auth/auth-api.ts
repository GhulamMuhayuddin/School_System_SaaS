import { apiFetch, type SessionPayload, type SessionUser } from '@/lib/api';

export interface LoginInput {
  email: string;
  password: string;
  remember?: boolean;
}

export const authApi = {
  login: (input: LoginInput) => apiFetch<SessionPayload>('/auth/login', { method: 'POST', body: input, auth: false }),
  logout: () => apiFetch('/auth/logout', { method: 'POST', auth: false }),
  me: () => apiFetch<{ user: SessionUser }>('/auth/me'),
  forgotPassword: (email: string) => apiFetch<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email }, auth: false }),
  resetPassword: (token: string, password: string) => apiFetch('/auth/reset-password', { method: 'POST', body: { token, password }, auth: false }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch('/auth/change-password', { method: 'POST', body: { currentPassword, newPassword } }),
};
