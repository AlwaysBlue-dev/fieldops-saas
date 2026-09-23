import { NotificationInbox } from "@/components/fieldops/notification-inbox";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <NotificationInbox />;
}
