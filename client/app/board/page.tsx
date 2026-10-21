import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";

export const dynamic = "force-dynamic";

export default function BoardRedirectPage() {
  const newId = randomUUID();
  redirect(`/board/${newId}`);
}
