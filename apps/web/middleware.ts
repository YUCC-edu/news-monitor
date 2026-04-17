export { default } from "next-auth/middleware";

export const config = {
  matcher: [
    /*
     * 保护除以下之外的所有路径：
     * - /login
     * - /api/auth/*（NextAuth 自身接口）
     * - 静态资源 (_next/*, favicon, public)
     */
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico).*)",
  ],
};
