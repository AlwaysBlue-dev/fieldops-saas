import { catalogPlan, getPublicCatalog } from "@/lib/pricing";
import type { Metadata } from "next";
import { SignupForm } from "./signup-form";

export const metadata: Metadata = {
  title: "Create workspace",
};

export default async function SignupPage() {
  const catalog = await getPublicCatalog();
  const professional = catalogPlan(catalog, "professional");
  const trialDays = catalog?.trialDays;
  const planName = professional?.name ?? "FieldOps Cloud Professional";
  const description = trialDays
    ? `${trialDays}-day free trial of ${planName}. No credit card required.`
    : `Free trial of ${planName}. No credit card required.`;

  return <SignupForm description={description} />;
}
