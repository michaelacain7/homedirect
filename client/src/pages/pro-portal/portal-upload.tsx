import { useState, useCallback, useRef } from "react";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Upload, CheckCircle, Loader2, FileText, X } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

const API_BASE = "__PORT_5000__".startsWith("__") ? "" : "__PORT_5000__";

interface PortalUploadProps {
  token: string;
  docType: string;
  label: string;
  accept?: string;
  multiple?: boolean;
  onUpload?: (url: string, doc: any) => void;
}

export default function PortalUpload({
  token,
  docType,
  label,
  accept = ".pdf,image/*",
  multiple = false,
  onUpload,
}: PortalUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<Array<{ name: string; url: string }>>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const qc = useQueryClient();

  const uploadFile = async (file: File) => {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("docType", docType);
    formData.append("docName", file.name);

    const res = await fetch(`${API_BASE}/api/pro/${token}/upload`, {
      method: "POST",
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ message: "Upload failed" }));
      throw new Error(err.message || "Upload failed");
    }
    return res.json();
  };

  const [uploading, setUploading] = useState(false);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    const fileArray = Array.from(files);
    for (const file of fileArray) {
      try {
        const result = await uploadFile(file);
        setUploadedFiles(prev => [...prev, { name: file.name, url: result.url }]);
        qc.invalidateQueries({ queryKey: [`/api/pro/${token}/documents`] });
        if (onUpload) onUpload(result.url, result.document);
        toast({ title: "Uploaded", description: `${file.name} uploaded successfully.` });
      } catch (err: any) {
        toast({ title: "Upload Failed", description: err.message, variant: "destructive" });
      }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    handleFiles(e.dataTransfer.files);
  }, [token, docType]);

  return (
    <div className="space-y-3">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onClick={() => inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-all
          ${isDragging
            ? "border-green-500 bg-green-50 dark:bg-green-900/20"
            : "border-gray-300 dark:border-gray-700 hover:border-green-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          }
        `}
      >
        {uploading ? (
          <div className="flex flex-col items-center gap-2">
            <Loader2 className="w-8 h-8 animate-spin text-green-600" />
            <p className="text-sm text-gray-600 dark:text-gray-400">Uploading...</p>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-2">
            <Upload className="w-8 h-8 text-gray-400" />
            <p className="font-medium text-gray-700 dark:text-gray-300 text-sm">{label}</p>
            <p className="text-xs text-gray-500 dark:text-gray-500">
              Drag & drop or click to browse
            </p>
          </div>
        )}
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />

      {/* Uploaded files */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-2">
          {uploadedFiles.map((f, i) => (
            <div
              key={i}
              className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800"
            >
              <CheckCircle className="w-4 h-4 text-green-600 shrink-0" />
              <span className="text-sm text-gray-700 dark:text-gray-300 truncate flex-1">{f.name}</span>
              <a
                href={f.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-blue-500 hover:underline shrink-0"
              >
                View
              </a>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
