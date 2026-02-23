"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useTranslations } from "next-intl";
import Image from "next/image";

const MAX_IMAGES = 3;

type ExpenseImageUploadProps = {
  imageUrls: string[];
  onChange: (urls: string[]) => void;
  disabled?: boolean;
};

export default function ExpenseImageUpload({
  imageUrls,
  onChange,
  disabled = false,
}: ExpenseImageUploadProps) {
  const t = useTranslations("modals");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (disabled || uploading) return;

      const remaining = MAX_IMAGES - imageUrls.length;
      const filesToUpload = files.slice(0, remaining);
      if (filesToUpload.length === 0) return;

      setUploading(true);
      try {
        const uploadPromises = filesToUpload.map(async (file) => {
          const formData = new FormData();
          formData.append("file", file);

          const res = await fetch("/api/upload?purpose=expense", {
            method: "POST",
            body: formData,
          });

          if (!res.ok) throw new Error("Upload failed");
          const data = await res.json();
          return data.imageUrl as string;
        });

        const newUrls = await Promise.all(uploadPromises);
        onChange([...imageUrls, ...newUrls]);
      } catch {
        // Silently fail individual uploads
      } finally {
        setUploading(false);
      }
    },
    [imageUrls, onChange, disabled, uploading]
  );

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    processFiles(Array.from(files));
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const removeImage = (index: number) => {
    onChange(imageUrls.filter((_, i) => i !== index));
  };

  // Paste support
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      const imageFiles: File[] = [];
      for (const item of items) {
        if (item.type.startsWith("image/")) {
          e.preventDefault();
          const file = item.getAsFile();
          if (file) imageFiles.push(file);
        }
      }

      if (imageFiles.length > 0) processFiles(imageFiles);
    };

    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [processFiles]);

  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1.5">
        {t("attachPhotos")}
        <span className="text-slate-400 font-normal ml-1">
          ({imageUrls.length}/{MAX_IMAGES})
        </span>
      </label>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={handleFileSelect}
        className="hidden"
      />

      {/* Preview grid */}
      {imageUrls.length > 0 && (
        <div className="grid grid-cols-3 gap-2 mb-2">
          {imageUrls.map((url, index) => (
            <div key={index} className="relative aspect-square">
              <div className="relative w-full h-full rounded-lg overflow-hidden border border-slate-200">
                <Image
                  src={url}
                  alt={`Photo ${index + 1}`}
                  fill
                  className="object-cover"
                />
              </div>
              <button
                type="button"
                onClick={() => removeImage(index)}
                className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red-500 text-white flex items-center justify-center hover:bg-red-600 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Upload button */}
      {imageUrls.length < MAX_IMAGES && (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          className="w-full p-3 rounded-lg border-2 border-dashed border-slate-300 hover:border-slate-400 transition-colors flex items-center justify-center gap-2 text-slate-500 hover:text-slate-600 disabled:opacity-50"
        >
          {uploading ? (
            <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          )}
          <span className="text-sm">
            {uploading
              ? t("uploading")
              : imageUrls.length === 0
                ? t("addPhoto")
                : t("addMorePhotos")}
          </span>
        </button>
      )}
    </div>
  );
}
