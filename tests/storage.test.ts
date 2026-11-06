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
  MAX_IMAGE_SIZE_BYTES,
  ImageSizeLimitError,
  ImageValidationError
} from "../server/src/utils/storage";
import { uploadImageController } from "../server/src/controllers/board.controller";

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

test("storage: decoded buffer size is correctly measured; 8 MB allowed and > 8 MB rejected", async () => {
  // 5 MB decoded buffer -> allowed
  const buf5Mb = Buffer.alloc(5 * 1024 * 1024);
  const dataUrl5Mb = `data:image/png;base64,${buf5Mb.toString("base64")}`;
  const parsed5Mb = parseAndValidateDataUrl(dataUrl5Mb);
  assert.equal(parsed5Mb.buffer.length, 5 * 1024 * 1024);

  // Exactly 8 MB decoded buffer -> allowed
  const buf8Mb = Buffer.alloc(MAX_IMAGE_SIZE_BYTES);
  const dataUrl8Mb = `data:image/png;base64,${buf8Mb.toString("base64")}`;
  const parsed8Mb = parseAndValidateDataUrl(dataUrl8Mb);
  assert.equal(parsed8Mb.buffer.length, MAX_IMAGE_SIZE_BYTES);

  // 8.5 MB decoded buffer -> rejected based on decoded size
  const buf8_5Mb = Buffer.alloc(8.5 * 1024 * 1024);
  const dataUrl8_5Mb = `data:image/png;base64,${buf8_5Mb.toString("base64")}`;

  assert.throws(
    () => parseAndValidateDataUrl(dataUrl8_5Mb),
    (err: any) => {
      assert.ok(err instanceof ImageSizeLimitError);
      assert.equal(err.statusCode, 413);
      assert.match(err.message, /exceeds maximum allowed size of 8 MB \(received 8\.50 MB\)/);
      return true;
    }
  );

  await assert.rejects(
    () => saveBase64Image(dataUrl8_5Mb),
    /exceeds maximum allowed size of 8 MB \(received 8\.50 MB\)/
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

test("storage: S3 PutObject failure falls back to local disk and preserves image", async () => {
  // S3 is configured, but PutObject throws
  setS3ConfigForTesting({
    bucket: "whiteboard-assets",
    region: "us-east-1",
    publicBaseUrl: "https://cdn.canvasflow.dev"
  });

  const mockFailingS3Client = {
    send: async () => {
      throw new Error("Network connection reset: S3 unreachable");
    }
  };
  setS3ClientForTesting(mockFailingS3Client);
  assert.equal(isS3Configured(), true);

  // Must fall back to local disk and return /uploads/ URL instead of throwing
  const fallbackUrl = await saveBase64Image(SAMPLE_1PX_PNG);
  assert.match(fallbackUrl, /^\/uploads\/[0-9a-f-]+\.png$/);

  const localFilename = path.basename(fallbackUrl);
  const fullPath = path.join(getUploadsDir(), localFilename);
  assert.ok(fs.existsSync(fullPath), "Fallen-back image must exist on local disk");

  // Clean up
  await fs.promises.unlink(fullPath);
  setS3ConfigForTesting(null);
  setS3ClientForTesting(null);
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

test("uploadImageController: maps validation, size, and storage errors to correct HTTP status codes", async () => {
  const createMockRes = () => {
    let statusCode = 200;
    let jsonBody: any = null;
    const res: any = {
      status(code: number) {
        statusCode = code;
        return res;
      },
      json(body: any) {
        jsonBody = body;
        return res;
      },
      get statusCode() {
        return statusCode;
      },
      get body() {
        return jsonBody;
      }
    };
    return res;
  };

  // 1. Missing imageBase64 -> 400
  {
    const req: any = { body: {} };
    const res = createMockRes();
    await uploadImageController(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "INVALID_REQUEST");
  }

  // 2. Unsupported image type (text/plain) -> 400
  {
    const req: any = {
      body: { imageBase64: "data:text/plain;base64,SGVsbG8gd29ybGQ=" }
    };
    const res = createMockRes();
    await uploadImageController(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.code, "UNSUPPORTED_IMAGE_TYPE");
    assert.match(res.body.error, /Unsupported image type/);
  }

  // 3. Oversized image (> 8 MB decoded) -> 413
  {
    const buf9Mb = Buffer.alloc(9 * 1024 * 1024);
    const req: any = {
      body: { imageBase64: `data:image/png;base64,${buf9Mb.toString("base64")}` }
    };
    const res = createMockRes();
    await uploadImageController(req, res);
    assert.equal(res.statusCode, 413);
    assert.equal(res.body.code, "PAYLOAD_TOO_LARGE");
    assert.match(res.body.error, /exceeds maximum allowed size of 8 MB/);
  }

  // 4. Valid image (1px PNG) -> 200
  {
    const req: any = { body: { imageBase64: SAMPLE_1PX_PNG } };
    const res = createMockRes();
    await uploadImageController(req, res);
    assert.equal(res.statusCode, 200);
    assert.match(res.body.url, /^\/uploads\/[0-9a-f-]+\.png$/);
    const filename = path.basename(res.body.url);
    await fs.promises.unlink(path.join(getUploadsDir(), filename));
  }
});
