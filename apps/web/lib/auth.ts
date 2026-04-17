import type { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";

export const authOptions: NextAuthOptions = {
  secret: process.env.AUTH_SECRET,
  session: { strategy: "jwt", maxAge: 60 * 60 * 24 * 7 },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "credentials",
      credentials: {
        username: { label: "Username", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        if (!creds?.username || !creds?.password) return null;
        const expectedUser = process.env.AUTH_USER;
        const expectedHash = process.env.AUTH_PASS_HASH;
        if (!expectedUser || !expectedHash) return null;
        if (creds.username !== expectedUser) return null;
        const ok = await bcrypt.compare(creds.password, expectedHash);
        if (!ok) return null;
        return { id: "self", name: expectedUser };
      },
    }),
  ],
};
