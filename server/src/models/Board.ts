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
      enum: ["pencil", "rectangle", "circle", "line", "arrow", "text", "image", "sticky"],
      required: true
    },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    strokeColor: { type: String, required: true },
    strokeWidth: { type: Number, required: true },
    fillColor: { type: String, default: "transparent" },
    text: { type: String },
    fontSize: { type: Number },
    imageUrl: { type: String },
    opacity: { type: Number, default: 1 },
    isLocked: { type: Boolean, default: false },
    points: { type: [pointSchema], default: [] }
  },
  { _id: false, strict: "throw" }
);

const boardSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    version: { type: Number, default: 0, required: true },
    ownerId: { type: String },
    shareToken: { type: String },
    elements: { type: [elementSchema], default: [] }
  },
  {
    timestamps: true,
    strict: "throw"
  }
);

export const BoardModel = mongoose.models.Board || mongoose.model("Board", boardSchema);
