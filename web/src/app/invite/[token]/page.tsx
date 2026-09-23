import type { Metadata } from "next";
import { InviteAcceptForm } from "./invite-accept-form";

export const metadata: Metadata = {
  title: "Accept invitation",
};

export default async function InvitePage({
  params,
}: PageProps<"/invite/[token]">) {
  const { token } = await params;
  return <InviteAcceptForm token={token} />;
}
