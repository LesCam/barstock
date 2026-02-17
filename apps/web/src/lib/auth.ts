import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@barstock/database";
import { verifyPassword, buildUserPayload } from "@barstock/api/src/services/auth.service";

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "change-me-in-production",
  providers: [
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
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
        } as any;
      },
    }),
  ],
  session: { strategy: "jwt" },
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
      };
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
