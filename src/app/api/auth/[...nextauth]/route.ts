import NextAuth, { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";

const allowedEmails =
  process.env.ALLOWED_EMAILS?.split(",").map((e) => e.trim()) || [];

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
  ],
  callbacks: {
    async signIn({ user }) {
      // Sadece allowlist içindeki mailler giriş yapabilsin
      if (user.email && allowedEmails.includes(user.email)) return true;
      return false;
    },
    async session({ session }) {
      // Basit role ataması: listedeki ilk mail admin, diğerleri viewer
      if (session.user?.email) {
        (session.user as any).role =
          allowedEmails[0] === session.user.email ? "admin" : "viewer";
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
};

const handler = NextAuth(authOptions);
export { handler as GET, handler as POST };