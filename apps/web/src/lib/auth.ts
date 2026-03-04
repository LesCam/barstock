import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@barstock/database";
import { verifyPassword, buildUserPayload } from "@barstock/api/src/services/auth.service";

const isProd = process.env.NODE_ENV === "production";
const nextAuthUrl = process.env.NEXTAUTH_URL;

if (isProd && (!nextAuthUrl || !nextAuthUrl.startsWith("https://"))) {
  throw new Error("NEXTAUTH_URL must be an https:// URL in production");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "change-me-in-production",
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        preAuthedUserId: { label: "Pre-authenticated User ID", type: "text" },
      },
      async authorize(credentials) {
        // Post-MFA flow: user already authenticated via tRPC mfaLogin
        if (credentials?.preAuthedUserId) {
          const userId = credentials.preAuthedUserId as string;
          const user = await prisma.user.findUnique({ where: { id: userId } });
          if (!user || !user.isActive) return null;
          const payload = await buildUserPayload(prisma, userId);
          return {
            id: user.id,
            email: user.email,
            roles: payload.roles,
            permissions: payload.permissions,
            locationIds: payload.locationIds,
            businessId: payload.businessId,
            businessName: payload.businessName,
            highestRole: payload.highestRole,
            tokenVersion: payload.tokenVersion,
          } as any;
        }

        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.isActive) return null;

        const valid = await verifyPassword(
          credentials.password as string,
          user.passwordHash
        );
        if (!valid) return null;

        const payload = await buildUserPayload(prisma, user.id);

        return {
          id: user.id,
          email: user.email,
          roles: payload.roles,
          permissions: payload.permissions,
          locationIds: payload.locationIds,
          businessId: payload.businessId,
          businessName: payload.businessName,
          highestRole: payload.highestRole,
          tokenVersion: payload.tokenVersion,
        } as any;
      },
    }),
  ],
  session: { strategy: "jwt", maxAge: 8 * 60 * 60 },
  cookies: {
    sessionToken: {
      name: isProd ? "__Host-authjs.session-token" : "authjs.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    csrfToken: {
      name: isProd ? "__Host-authjs.csrf-token" : "authjs.csrf-token",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
    callbackUrl: {
      name: isProd ? "__Host-authjs.callback-url" : "authjs.callback-url",
      options: {
        httpOnly: true,
        sameSite: "lax",
        path: "/",
        secure: isProd,
      },
    },
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.userId = (user as any).id;
        token.roles = (user as any).roles;
        token.permissions = (user as any).permissions;
        token.locationIds = (user as any).locationIds;
        token.businessId = (user as any).businessId;
        token.businessName = (user as any).businessName;
        token.highestRole = (user as any).highestRole;
        token.tokenVersion = (user as any).tokenVersion ?? 0;
        token.authAt = Date.now();
      }
      return token;
    },
    async session({ session, token }) {
      (session as any).user = {
        ...session.user,
        userId: token.userId,
        roles: token.roles,
        permissions: token.permissions,
        locationIds: token.locationIds,
        businessId: token.businessId,
        businessName: token.businessName,
        highestRole: token.highestRole,
        tokenVersion: token.tokenVersion,
        authAt: token.authAt,
      };
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
