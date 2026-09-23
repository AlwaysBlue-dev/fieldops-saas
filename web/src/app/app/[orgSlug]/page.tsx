import { redirect } from "next/navigation";

export default async function AppIndexPage({
  params,
}: PageProps<"/app/[orgSlug]">) {
  const { orgSlug } = await params;
  redirect(`/app/${orgSlug}/overview`);
}
