import type { Metadata } from "next";
import { OnboardingForm } from "./onboarding-form";

export const metadata: Metadata = {
  title: "Set up organization",
};

export default function OnboardingPage() {
  return <OnboardingForm />;
}
