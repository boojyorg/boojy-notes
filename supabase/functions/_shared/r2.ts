import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "https://deno.land/x/s3_lite_client@0.7.0/mod.ts";

const R2_ENDPOINT = Deno.env.get("R2_ENDPOINT")!;
const R2_ACCESS_KEY_ID = Deno.env.get("R2_ACCESS_KEY_ID")!;
const R2_SECRET_ACCESS_KEY = Deno.env.get("R2_SECRET_ACCESS_KEY")!;
const R2_BUCKET = Deno.env.get("R2_BUCKET")!;

// Parse endpoint to get host
const endpointUrl = new URL(R2_ENDPOINT);

const s3 = new S3Client({
  endPoint: endpointUrl.hostname,
  port: endpointUrl.port ? parseInt(endpointUrl.port) : 443,
  useSSL: true,
  region: "auto",
  accessKey: R2_ACCESS_KEY_ID,
  secretKey: R2_SECRET_ACCESS_KEY,
  bucket: R2_BUCKET,
  pathStyle: true,
});

export async function putObject(key: string, body: string): Promise<void> {
  await s3.putObject(key, new TextEncoder().encode(body));
}

export async function getObject(key: string): Promise<string | null> {
  try {
    const response = await s3.getObject(key);
    return await new Response(response).text();
  } catch (e) {
    if (e.code === "NoSuchKey" || e.message?.includes("Not Found")) {
      return null;
    }
    throw e;
  }
}

export async function deleteObject(key: string): Promise<void> {
  try {
    await s3.deleteObject(key);
  } catch {
    // Ignore errors on delete — file may already be gone
  }
}
