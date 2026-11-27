"use client";

import { useState, useEffect, useRef } from "react";
import { X, Loader2 } from "lucide-react";
import { generateAiImage, getAiCapabilities, type AiAvailability, type AiCapabilities, type GenerateAiImageResult } from "@/lib/api";
import styles from "./AiImageModal.module.css";

type AiImageModalProps = {
  isOpen: boolean;
  onClose: () => void;
  initialPrompt?: string;
  sketchBase64?: string;
  isClusterUsed?: boolean;
  onGenerate: (imageUrl: string, width: number, height: number) => void;
};

const AI_IMAGE_STYLES = [
  ["digital", "Digital art"], ["photo", "Photorealistic"], ["3d", "3D render"],
  ["anime", "Anime"], ["cyberpunk", "Cyberpunk"], ["watercolor", "Watercolor"], ["vector", "Vector"]
] as const;

const availabilityMessage: Record<NonNullable<AiAvailability>, string> = {
  not_configured: "Image generation needs a provider key on this server.",
  credit: "The configured image providers are out of generation credit. Contact the site owner.",
  key: "The image provider rejected this server’s key. Contact the site owner.",
  permission: "This server’s key needs permission to generate images.",
  unreachable: "Could not reach the image service. Close and reopen the studio to retry."
};

export function AiImageModal({
  isOpen,
  onClose,
  initialPrompt = "",
  sketchBase64,
  isClusterUsed = false,
  onGenerate
}: AiImageModalProps) {
  const [prompt, setPrompt] = useState("");
  const [styleId, setStyleId] = useState<string>(AI_IMAGE_STYLES[0][0]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [activeSketch, setActiveSketch] = useState<string | undefined>(undefined);
  const [clusterNotice, setClusterNotice] = useState(false);
  const [capabilities, setCapabilities] = useState<AiCapabilities | null>(null);
  const [generatedResult, setGeneratedResult] = useState<GenerateAiImageResult | null>(null);
  const [naturalDimensions, setNaturalDimensions] = useState<{ width: number; height: number } | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevIsOpenRef = useRef(false);

  // Capture sketch and initialize state ONCE when modal opens (2.3)
  useEffect(() => {
    if (isOpen && !prevIsOpenRef.current) {
      setPrompt(initialPrompt || "");
      setError(null);
      setProgress(0);
      setIsGenerating(false);
      setGeneratedResult(null);
      setNaturalDimensions(null);
      setCapabilities(null);
      setActiveSketch(sketchBase64 || undefined);
      setClusterNotice(Boolean(isClusterUsed));

      getAiCapabilities().then((caps) => {
        setCapabilities(caps);
      });

      if (window.matchMedia("(pointer: fine) and (min-width: 700px)").matches) {
        setTimeout(() => inputRef.current?.focus({ preventScroll: true }), 60);
      }
    }
    prevIsOpenRef.current = isOpen;
  }, [isOpen, initialPrompt, sketchBase64, isClusterUsed]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isGenerating) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isGenerating, onClose]);

  if (!isOpen) return null;

  const hasSketch = Boolean(activeSketch);
  const useSketch = hasSketch && Boolean(capabilities?.sketch);
  const canGenerate = useSketch || Boolean(capabilities?.text);
  const canSubmit = canGenerate && !isGenerating && Boolean(prompt.trim());
  const buttonLabel = useSketch ? "Generate from sketch" : "Generate from text";

  const handleGenerate = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const cleanPrompt = prompt.trim();
    if (!cleanPrompt) {
      setError("Please describe what image you want to create.");
      return;
    }
    if (!canSubmit) return;

    setIsGenerating(true);
    setProgress(15);
    setError(null);
    setGeneratedResult(null);
    setNaturalDimensions(null);

    try {
      const res = await generateAiImage(
        {
          imageBase64: useSketch ? activeSketch : undefined,
          prompt: cleanPrompt,
          styleId,
          allowTextOnly: !useSketch
        },
        (p) => setProgress(Math.max(15, p))
      );

      setProgress(100);
      setGeneratedResult(res);
    } catch (err: any) {
      if (["SKETCH_UNAVAILABLE", "AI_NOT_CONFIGURED", "IMAGE_CREDIT", "IMAGE_ACCESS"].includes(err?.code)) {
        setCapabilities(await getAiCapabilities());
      }
      setError(err?.message || "Image service unavailable. Try again.");
    } finally {
      setIsGenerating(false);
    }
  };

  const handleInsert = () => {
    if (generatedResult?.imageUrl && naturalDimensions) {
      onGenerate(generatedResult.imageUrl, naturalDimensions.width, naturalDimensions.height);
      onClose();
    }
  };

  const resultCaption = generatedResult ? [
    generatedResult.provider,
    generatedResult.sketchGuided ? "Sketch-guided" : "Generated from text"
  ].filter(Boolean).join(" · ") : "";

  return (
    <div className={styles.backdrop} onClick={() => !isGenerating && onClose()}>
      <section className={`editor-dialog ${styles.dialog}`} role="dialog" aria-modal="true"
        aria-label="AI Image Studio" onClick={(event) => event.stopPropagation()}>
        <header className={styles.header}>
          <h2>Generate image</h2>
          <button className={styles.close} type="button" onClick={onClose} disabled={isGenerating} aria-label="Close modal">
            <X size={19} />
          </button>
        </header>

        {generatedResult ? (
          <div className={styles.result}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={styles.preview} src={generatedResult.imageUrl} alt={prompt}
              onLoad={({ currentTarget }) => setNaturalDimensions({ width: currentTarget.naturalWidth, height: currentTarget.naturalHeight })}
              onError={() => {
                setGeneratedResult(null);
                setError("Could not load the generated image. Try again.");
              }} />
            <p className={styles.detail}>{resultCaption}</p>
            <div className={styles.actions}>
              <button className={styles.secondary} type="button" onClick={() => setGeneratedResult(null)}>Edit prompt</button>
              <button className={styles.primary} type="button" disabled={!naturalDimensions} onClick={handleInsert}>Add to Canvas</button>
            </div>
          </div>
        ) : (
          <form className={styles.form} onSubmit={handleGenerate}>
            {hasSketch && (
              <div className={styles.sketch}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={activeSketch} alt="Sketch thumbnail" />
                <div>
                  <strong>{useSketch ? clusterNotice ? "Recent drawing" : "Selected drawing" : "Sketch unavailable"}</strong>
                  {!useSketch && capabilities?.text && <p className={styles.detail}>Generate from the prompt below.</p>}
                </div>
                <button className={styles.secondary} type="button" disabled={isGenerating}
                  onClick={() => setActiveSketch(undefined)}>Use text only</button>
              </div>
            )}
            {capabilities?.textReason && !useSketch && (
              <p role="status" className={styles.notice}>{availabilityMessage[capabilities.textReason]}</p>
            )}

            <label className={styles.field}>
              <span>Prompt <small>{prompt.length}/300</small></span>
              <textarea ref={inputRef} aria-label="Image prompt description" rows={3}
                maxLength={300} disabled={isGenerating} value={prompt}
                placeholder="Describe the image you want to add"
                onChange={(event) => {
                  setPrompt(event.currentTarget.value);
                  if (error) setError(null);
                }} />
            </label>

            <label className={styles.field}>
              <span>Style</span>
              <select value={styleId} disabled={isGenerating} onChange={(event) => setStyleId(event.currentTarget.value)}>
                {AI_IMAGE_STYLES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
              </select>
            </label>

            {error && <p className={styles.notice} role="alert">{error}</p>}
            {isGenerating && <progress className={styles.progress} aria-label="Image generation progress" max={100} value={progress} />}
            <div className={styles.actions}>
              <button className={styles.primary} type="submit" disabled={!canSubmit}>
                {isGenerating && <Loader2 size={16} className={styles.spinner} />}
                {isGenerating ? "Generating…" : capabilities ? buttonLabel : "Checking image service…"}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
