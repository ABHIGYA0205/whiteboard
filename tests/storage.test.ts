import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  saveBase64Image,
  deriveImageMeta,
  parseAndValidateDataUrl,
  stripBase64Payload,
  setS3ConfigForTesting,
  setS3ClientForTesting,
  getUploadsDir,
  isS3Configured,
  MAX_IMAGE_SIZE_BYTES
} from "../server/src/utils/storage";

const SAMPLE_1PX_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

const SAMPLE_1PX_JPEG =
  "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";

const SAMPLE_WEBP =
  "data:image/webp;base64,UklGRhoAAABXRUJQVlA4TA0AAAAvAAAAEAcQERGIiP4HAA==";

const SAMPLE_GIF =
  "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

const SAMPLE_SVG =
  "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSIxIiBoZWlnaHQ9IjEiPjwvc3ZnPg==";

test("storage: extension and content-type derivation for allowed image types", () => {
  // PNG
  const pngMeta = deriveImageMeta("image/png");
  assert.equal(pngMeta.contentType, "image/png");
  assert.equal(pngMeta.extension, "png");

  // JPEG / JPG
  const jpegMeta = deriveImageMeta("image/jpeg");
  assert.equal(jpegMeta.contentType, "image/jpeg");
  assert.equal(jpegMeta.extension, "jpg");

  const jpgMeta = deriveImageMeta("jpg");
  assert.equal(jpgMeta.contentType, "image/jpeg");
  assert.equal(jpgMeta.extension, "jpg");

  // WebP
  const webpMeta = deriveImageMeta("image/webp");
  assert.equal(webpMeta.contentType, "image/webp");
  assert.equal(webpMeta.extension, "webp");

  // GIF
  const gifMeta = deriveImageMeta("image/gif");
  assert.equal(gifMeta.contentType, "image/gif");
  assert.equal(gifMeta.extension, "gif");

  // SVG
  const svgMeta = deriveImageMeta("image/svg+xml");
  assert.equal(svgMeta.contentType, "image/svg+xml");
  assert.equal(svgMeta.extension, "svg");

  const svgShortMeta = deriveImageMeta("svg");
  assert.equal(svgShortMeta.contentType, "image/svg+xml");
  assert.equal(svgShortMeta.extension, "svg");

  // Disallowed types
  assert.throws(() => deriveImageMeta("image/bmp"), /Unsupported image type/);
  assert.throws(() => deriveImageMeta("application/pdf"), /Unsupported image type/);
  assert.throws(() => deriveImageMeta("text/plain"), /Unsupported image type/);
});

test("storage: guard rail rejects data URLs over 8 MB", async () => {
  // Construct a payload that exceeds 8 MB
  const oversizedDataUrl = `data:image/png;base64,${"A".repeat(MAX_IMAGE_SIZE_BYTES + 10)}`;

  assert.throws(
    () => parseAndValidateDataUrl(oversizedDataUrl),
    /exceeds maximum allowed size of 8 MB/
  );

  await assert.rejects(
    () => saveBase64Image(oversizedDataUrl),
    /exceeds maximum allowed size of 8 MB/
  );
});

test("storage: guard rail strips base64 payload from logs", () => {
  const sample = "data:image/png;base64,SECRET_BYTES_ABC_123";
  const stripped = stripBase64Payload(sample);
  assert.equal(stripped, "data:image/png;base64,[base64 payload stripped]");
  assert.ok(!stripped.includes("SECRET_BYTES_ABC_123"));
});

test("storage: non-data URLs pass through untouched", async () => {
  const httpsUrl = "https://example.com/artwork.png";
  const localUrl = "/uploads/already-saved.jpg";

  assert.equal(await saveBase64Image(httpsUrl), httpsUrl);
  assert.equal(await saveBase64Image(localUrl), localUrl);
});

test("storage: fallback to local disk when S3 is not configured", async () => {
  setS3ConfigForTesting(null);
  setS3ClientForTesting(null);
  assert.equal(isS3Configured(), false);

  const savedPath = await saveBase64Image(SAMPLE_1PX_PNG);
  assert.match(savedPath, /^\/uploads\/[0-9a-f-]+\.png$/);

  const localFilename = path.basename(savedPath);
  const fullPath = path.join(getUploadsDir(), localFilename);

  assert.ok(fs.existsSync(fullPath), "Saved image file must exist in uploads directory");
  const fileBytes = await fs.promises.readFile(fullPath);
  assert.ok(fileBytes.length > 0, "Saved file must not be empty");

  // Clean up test file
  await fs.promises.unlink(fullPath);
});

test("storage: S3-configured upload constructs public URL and sets S3 metadata", async () => {
  let uploadedCommand: any = null;
  const mockS3Client = {
    send: async (command: any) => {
      uploadedCommand = command;
      return {};
    }
  };

  setS3ConfigForTesting({
    bucket: "whiteboard-assets",
    region: "us-east-1",
    publicBaseUrl: "https://cdn.canvasflow.dev"
  });
  setS3ClientForTesting(mockS3Client);
  assert.equal(isS3Configured(), true);

  const publicUrl = await saveBase64Image(SAMPLE_1PX_PNG);

  // Must construct absolute public URL: ${S3_PUBLIC_BASE_URL}/boards/<uuid>.<ext>
  assert.match(publicUrl, /^https:\/\/cdn\.canvasflow\.dev\/boards\/[0-9a-f-]+\.png$/);

  // Verify PutObjectCommand parameters sent to S3 client
  assert.ok(uploadedCommand, "PutObjectCommand must be sent to S3 client");
  const input = uploadedCommand.input;
  assert.equal(input.Bucket, "whiteboard-assets");
  assert.match(input.Key, /^boards\/[0-9a-f-]+\.png$/);
  assert.equal(input.ContentType, "image/png");
  assert.equal(input.CacheControl, "public, max-age=31536000, immutable");
  assert.ok(Buffer.isBuffer(input.Body), "Body must be a Buffer");

  // Reset test configuration
  setS3ConfigForTesting(null);
  setS3ClientForTesting(null);
});

test("storage: S3 publicBaseUrl trailing slash is normalized", async () => {
  let uploadedCommand: any = null;
  const mockS3Client = {
    send: async (command: any) => {
      uploadedCommand = command;
      return {};
    }
  };

  // publicBaseUrl with trailing slash
  setS3ConfigForTesting({
    bucket: "whiteboard-assets",
    publicBaseUrl: "https://pub-r2.canvasflow.dev/"
  });
  setS3ClientForTesting(mockS3Client);

  const publicUrl = await saveBase64Image(SAMPLE_SVG);
  assert.match(publicUrl, /^https:\/\/pub-r2\.canvasflow\.dev\/boards\/[0-9a-f-]+\.svg$/);
  assert.equal(uploadedCommand.input.ContentType, "image/svg+xml");

  // Reset
  setS3ConfigForTesting(null);
  setS3ClientForTesting(null);
});
