import argon2 from 'argon2';

/** Argon2id with the library's recommended defaults. */
export const hashPassword = (plain: string): Promise<string> => argon2.hash(plain, { type: argon2.argon2id });
export const verifyPassword = (hash: string, plain: string): Promise<boolean> => argon2.verify(hash, plain);
