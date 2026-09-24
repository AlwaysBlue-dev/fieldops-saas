import type { Metadata } from "next";
import { CreateWorkspaceForm } from "./create-workspace-form";

export const metadata: Metadata = {
  title: "Create workspace",
};

export default function CreateWorkspacePage() {
  return <CreateWorkspaceForm />;
}
