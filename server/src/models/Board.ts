import mongoose, { Schema } from "mongoose";

const pointSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  { _id: false, strict: "throw" }
);

const elementSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["pencil", "rectangle", "diamond", "circle", "ellipse", "line", "arrow", "text", "image", "sticky"],
      required: true
    },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    strokeColor: { type: String, required: true },
    strokeWidth: { type: Number, required: true },
    strokeStyle: { type: String, default: "solid" },
    fillColor: { type: String, default: "transparent" },
    fillStyle: { type: String, default: "transparent" },
    roughness: { type: Number, default: 0 },
    roundness: { type: Schema.Types.Mixed, default: false },
    text: { type: String, default: "" },
    fontSize: { type: Number, default: 24 },
    imageUrl: { type: String, default: "" },
    opacity: { type: Number, default: 1 },
    isLocked: { type: Boolean, default: false },
    startBinding: { type: Schema.Types.Mixed },
    endBinding: { type: Schema.Types.Mixed },
    points: { type: [pointSchema], default: [] }
  },
  { _id: false, strict: false }
);

const boardSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    version: { type: Number, default: 0, required: true },
    title: { type: String, default: "Untitled Board" },
    ownerId: { type: String },
    shareToken: { type: String },
    backgroundColor: { type: String, default: "" },
    elements: { type: [elementSchema], default: [] }
  },
  {
    timestamps: true,
    strict: false
  }
);

export const BoardModel = mongoose.models.Board || mongoose.model("Board", boardSchema);
