import mongoose from "mongoose";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, "../.env") });

const SHA256_HEX = /^[0-9a-f]{64}$/;

export async function runMigration({
  apply = false,
  mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/whiteboard",
  quiet = false
} = {}) {
  let connectedHere = false;
  if (mongoose.connection.readyState !== 1) {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    connectedHere = true;
  }

  const collection = mongoose.connection.collection("boards");
  const cursor = collection.find({
    ownerId: { $exists: true, $ne: null }
  });

  let scanned = 0;
  let legacyFound = 0;
  let updatedCount = 0;
  const legacyBoards = [];

  for await (const doc of cursor) {
    scanned++;
    const rawOwner = doc.ownerId;
    if (typeof rawOwner === "string" && rawOwner.trim() && !SHA256_HEX.test(rawOwner.trim())) {
      legacyFound++;
      legacyBoards.push({ id: doc.id, ownerId: rawOwner });
      if (!quiet) {
        console.log(`[${apply ? "APPLY" : "DRY-RUN"}] Found legacy board: id=${doc.id}, ownerId=${rawOwner}`);
      }
      if (apply) {
        await collection.updateOne({ _id: doc._id }, { $set: { ownerId: null } });
        updatedCount++;
      }
    }
  }

  if (!quiet) {
    console.log(`\nMigration summary:`);
    console.log(`  Scanned: ${scanned}`);
    console.log(`  Legacy boards found: ${legacyFound}`);
    console.log(`  Updated: ${updatedCount}`);
    if (!apply && legacyFound > 0) {
      console.log(`  (Dry run only: no documents modified. Run with --apply to null legacy ownerIds.)`);
    }
  }

  if (connectedHere) {
    await mongoose.disconnect();
  }

  return { scanned, legacyFound, updatedCount, legacyBoards };
}

// Direct execution from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const apply = process.argv.includes("--apply");
  runMigration({ apply })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Migration failed:", err);
      process.exit(1);
    });
}
