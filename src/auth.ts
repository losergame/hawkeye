/**
 * NextAuth configuration — Hawkeye authentication
 *
 * Single-user credentials provider. Credentials are stored exclusively in
 * environment variables (APP_USERNAME / APP_PASSWORD) — never in code or DB.
 *
 * Uses timing-safe comparison (SHA-256 hash + timingSafeEqual) to prevent
 * both timing attacks and length-oracle attacks on the password check.
 *
 * Session: JWT strategy, 24-hour max age.
 */

import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import { createHash, timingSafeEqual } from "crypto";

/** Hash both strings to a fixed length, then compare — prevents timing + length oracles. */
function safeCompare(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Hawkeye",
      credentials: {
        username: { label: "Username", type: "text",     placeholder: "username" },
        password: { label: "Password", type: "password", placeholder: "••••••••" },
      },
      async authorize(credentials) {
        if (!credentials?.username || !credentials?.password) return null;

        const validUser = process.env.APP_USERNAME ?? "";
        const validPass = process.env.APP_PASSWORD ?? "";

        if (!validUser || !validPass) {
          console.error("[auth] APP_USERNAME or APP_PASSWORD not set — login disabled");
          return null;
        }

        const userOk = safeCompare(credentials.username, validUser);
        const passOk = safeCompare(credentials.password, validPass);

        if (userOk && passOk) {
          return { id: "hawkeye-user", name: credentials.username, email: null };
        }

        console.warn(`[auth] Failed login attempt for username: ${credentials.username}`);
        return null;
      },
    }),
  ],

  session: {
    strategy: "jwt",
    maxAge:   24 * 60 * 60, // 24 hours
  },

  jwt: {
    maxAge: 24 * 60 * 60,
  },

  pages: {
    signIn: "/login",
  },

  secret: process.env.NEXTAUTH_SECRET,

  callbacks: {
    async jwt({ token, user }) {
      if (user) token.userId = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.userId) {
        (session.user as typeof session.user & { id: string }).id = token.userId as string;
      }
      return session;
    },
  },
};
