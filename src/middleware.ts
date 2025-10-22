import { NextResponse } from "next/server";

export async function middleware() {
  try {
    const response = NextResponse.next();
    return response;
  } catch (error) {
    console.error("Middleware error:", error);
    return NextResponse.next();
  }
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
