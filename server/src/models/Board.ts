import mongoose, { Schema } from "mongoose";

const pointSchema = new Schema(
  {
    x: { type: Number, required: true },
    y: { type: Number, required: true }
  },
  { _id: false }
);

const elementSchema = new Schema(
  {
    id: { type: String, required: true },
    type: {
      type: String,
      enum: ["pencil", "rectangle", "circle", "line", "arrow"],
      required: true
    },
    x: { type: Number, required: true },
    y: { type: Number, required: true },
    width: { type: Number, required: true },
    height: { type: Number, required: true },
    strokeColor: { type: String, required: true },
    strokeWidth: { type: Number, required: true },
    points: { type: [pointSchema], default: [] }
  },
  { _id: false }
);

const boardSchema = new Schema(
  {
    id: { type: String, required: true, unique: true, index: true },
    elements: { type: [elementSchema], default: [] }
  },
  {
    timestamps: true
  }
);

export const BoardModel = mongoose.models.Board || mongoose.model("Board", boardSchema);
