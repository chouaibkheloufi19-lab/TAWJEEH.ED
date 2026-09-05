import { randomUUID } from "node:crypto";
import { Storage } from "@google-cloud/storage";

const SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

const storage = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${SIDECAR_ENDPOINT}/credential`,
      format: { type: "json", subject_token_field_name: "access_token" },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
});

function privateObjectLocation() {
  const value = process.env.PRIVATE_OBJECT_DIR;
  if (!value) throw new Error("PRIVATE_OBJECT_DIR is not configured");
  const [bucketName, ...prefix] = value.replace(/^\/+|\/+$/g, "").split("/");
  if (!bucketName) throw new Error("PRIVATE_OBJECT_DIR is invalid");
  return { bucketName, prefix: prefix.join("/") };
}

function objectNameForPath(objectPath: string) {
  if (!objectPath.startsWith("/objects/")) throw new Error("Invalid object path");
  const { prefix } = privateObjectLocation();
  return [prefix, objectPath.slice("/objects/".length)].filter(Boolean).join("/");
}

export async function savePrivatePdf(bytes: Buffer, ownerId: string) {
  const { bucketName, prefix } = privateObjectLocation();
  const objectName = [prefix, "profile-summaries", `${ownerId}-${randomUUID()}.pdf`]
    .filter(Boolean)
    .join("/");
  const file = storage.bucket(bucketName).file(objectName);
  await file.save(bytes, {
    resumable: false,
    contentType: "application/pdf",
    metadata: {
      contentType: "application/pdf",
      metadata: { ownerId },
    },
  });
  return `/objects/${prefix ? `${objectName.slice(`${prefix}/`.length)}` : objectName}`;
}

export async function readPrivatePdf(objectPath: string) {
  const { bucketName } = privateObjectLocation();
  const file = storage.bucket(bucketName).file(objectNameForPath(objectPath));
  const [exists] = await file.exists();
  if (!exists) return null;
  const [bytes] = await file.download();
  const [metadata] = await file.getMetadata();
  return {
    bytes,
    contentType: metadata.contentType ?? "application/pdf",
    fileName: metadata.name?.split("/").at(-1) ?? "profile-summary.pdf",
  };
}