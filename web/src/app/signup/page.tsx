import type { Metadata } from "next";
import { catalogPlan, getPublicCatalog } from "@/lib/pricing";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create account",
};

export default async function SignupPage() {
  const catalog = await getPublicCatalog();
  const professional = catalogPlan(catalog, "professional");
  const trialDays = catalog?.trialDays;
  const planName = professional?.name ?? "FieldKeel Professional";
  const description = trialDays
    ? `Create your account, verify your work email, then start a ${trialDays}-day free trial of ${planName}.`
    : `Create your account, verify your work email, then start a free trial of ${planName}.`;

  return <SignupForm description={description} />;
}
