import { MyDayWorkspace } from "@/components/fieldops/my-day-workspace";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "My Day" };

export default function MyDayPage() {
  return <MyDayWorkspace />;
}
