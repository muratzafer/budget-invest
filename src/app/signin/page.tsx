"use client";

import { signIn } from "next-auth/react";

export default function SignInPage() {
  return (
    <div className="h-screen w-full flex items-center justify-center">
      <button
        onClick={() => signIn("google", { callbackUrl: "/budget" })}
        className="px-4 py-2 rounded bg-black text-white"
      >
        Google ile Giriş Yap
      </button>
    </div>
  );
}