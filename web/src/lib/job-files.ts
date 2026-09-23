import { apiRequest } from "./api";

export type JobFileRecord = {
  id: string;
  originalName: string;
  mimeType: string;
  sizeBytes: string;
  type: string;
  category?: string;
  caption?: string | null;
  capturedAt?: string | null;
  uploadedById?: string;
  createdAt: string;
  downloadUrl?: string;
  expiresAt?: string;
  accessMode?: "presign" | "stream";
};

export function listJobFiles(organizationId: string, jobId: string) {
  return apiRequest<JobFileRecord[]>(
    `/organizations/${organizationId}/jobs/${jobId}/files`,
  );
}

export function getJobFileAccess(
  organizationId: string,
  jobId: string,
  fileId: string,
) {
  return apiRequest<JobFileRecord>(
    `/organizations/${organizationId}/jobs/${jobId}/files/${fileId}/access`,
  );
}

export function deleteJobFile(
  organizationId: string,
  jobId: string,
  fileId: string,
) {
  return apiRequest(`/organizations/${organizationId}/jobs/${jobId}/files/${fileId}`, {
    method: "DELETE",
  });
}

export function jobFileContentUrl(
  organizationId: string,
  jobId: string,
  fileId: string,
) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  return `${base}/organizations/${organizationId}/jobs/${jobId}/files/${fileId}/content`;
}

export async function uploadJobFile(
  organizationId: string,
  jobId: string,
  file: File,
  options: {
    category: "PHOTO" | "DOCUMENT" | "OTHER";
    caption?: string;
    onProgress?: (percent: number) => void;
  },
) {
  const base = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
  const body = new FormData();
  body.append("file", file);
  body.append("category", options.category);
  if (options.caption) body.append("caption", options.caption);

  return new Promise<JobFileRecord>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${base}/organizations/${organizationId}/jobs/${jobId}/files`);
    xhr.withCredentials = true;
    xhr.setRequestHeader("X-FieldOps-Requested-With", "web");
    xhr.setRequestHeader("Accept", "application/json");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && options.onProgress) {
        options.onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };
    xhr.onload = () => {
      try {
        const payload = JSON.parse(xhr.responseText) as JobFileRecord & {
          message?: string | string[];
        };
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(payload);
          return;
        }
        const message = Array.isArray(payload.message)
          ? payload.message.join(", ")
          : payload.message || "Upload failed";
        reject(new Error(message));
      } catch {
        reject(new Error("Upload failed"));
      }
    };
    xhr.onerror = () => reject(new Error("Upload failed"));
    xhr.send(body);
  });
}

export async function authorizedObjectUrl(file: JobFileRecord) {
  if (file.accessMode === "presign" && file.downloadUrl) {
    return file.downloadUrl;
  }
  if (!file.downloadUrl) return null;
  const response = await fetch(file.downloadUrl, {
    credentials: "include",
    headers: { "X-FieldOps-Requested-With": "web" },
  });
  if (!response.ok) return null;
  const blob = await response.blob();
  return URL.createObjectURL(blob);
}

export function addJobSignOff(
  organizationId: string,
  jobId: string,
  input: {
    representativeName: string;
    representativeRole?: string;
    clientAccepted?: boolean;
    clientComments?: string;
    imageBase64: string;
  },
) {
  return apiRequest(`/organizations/${organizationId}/jobs/${jobId}/sign-off`, {
    method: "POST",
    body: input,
  });
}
