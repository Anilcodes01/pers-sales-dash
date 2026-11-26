import type { NextRequest } from "next/server";
import { isAllowedOrigin } from "./origin";
import { AccessError } from "./admin-access";
const MAX_FILE_BYTES = 5 * 1024 * 1024;
export async function boundedForm(request: NextRequest) {
  if (!isAllowedOrigin(request)) throw new AccessError(403, "Request origin is not allowed.");
  const type = request.headers.get("content-type") || "";
  if (!type.startsWith("multipart/form-data;")) throw new AccessError(415, "Upload a CSV using the file picker.");
  const limit = MAX_FILE_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit) throw new AccessError(413, "CSV files must be 5 MB or smaller.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "Choose a CSV file.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) { await reader.cancel(); throw new AccessError(413, "CSV files must be 5 MB or smaller."); }
    chunks.push(value);
  }
  try { return await new Response(new Uint8Array(Buffer.concat(chunks)), { headers: { "Content-Type": type } }).formData(); }
  catch { throw new AccessError(400, "The upload could not be read. Choose the file again."); }
}
