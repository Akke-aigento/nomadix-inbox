import { useState } from "react";
import { File, FileText, Image as ImageIcon, Download, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// Configure PDF.js worker via CDN to avoid Vite worker bundling pain.
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;

export interface AttachmentRow {
  id: string;
  filename: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  is_inline: boolean;
}

function formatBytes(b: number | null) {
  if (!b) return "";
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

async function getSignedUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage
    .from("message-attachments")
    .createSignedUrl(path, 3600);
  return data?.signedUrl ?? null;
}

export function AttachmentList({ attachments }: { attachments: AttachmentRow[] }) {
  const [open, setOpen] = useState<AttachmentRow | null>(null);
  const visible = attachments.filter((a) => !a.is_inline);
  if (!visible.length) return null;

  return (
    <>
      <div className="mt-3 flex flex-wrap gap-2">
        {visible.map((a) => {
          const isImage = a.mime_type?.startsWith("image/");
          const isPdf = a.mime_type === "application/pdf";
          const Icon = isImage ? ImageIcon : isPdf ? FileText : File;
          return (
            <button
              key={a.id}
              onClick={() => setOpen(a)}
              className="flex max-w-[260px] items-center gap-2 rounded-md border border-border bg-muted/30 px-2.5 py-1.5 text-left text-xs hover:bg-muted/60"
            >
              <Icon className="h-4 w-4 flex-none text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="truncate">{a.filename}</div>
                <div className="text-[10px] text-muted-foreground">{formatBytes(a.size_bytes)}</div>
              </div>
            </button>
          );
        })}
      </div>
      <AttachmentPreviewDialog att={open} onClose={() => setOpen(null)} />
    </>
  );
}

function AttachmentPreviewDialog({ att, onClose }: { att: AttachmentRow | null; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);
  const [numPages, setNumPages] = useState<number | null>(null);

  useState(() => {
    if (!att?.storage_path) return;
    getSignedUrl(att.storage_path).then(setUrl);
  });

  // re-fetch when att changes
  if (att && url === null) {
    if (att.storage_path) getSignedUrl(att.storage_path).then(setUrl);
  }
  if (!att && url !== null) {
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    setUrl;
  }

  const isImage = att?.mime_type?.startsWith("image/");
  const isPdf = att?.mime_type === "application/pdf";

  return (
    <Dialog open={!!att} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-hidden p-0">
        <div className="flex items-center justify-between border-b border-border px-4 py-2">
          <div className="truncate text-sm font-medium">{att?.filename}</div>
          <div className="flex items-center gap-1">
            {url && (
              <a href={url} download={att?.filename}>
                <Button variant="ghost" size="icon" className="h-7 w-7">
                  <Download className="h-4 w-4" />
                </Button>
              </a>
            )}
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
              <X className="h-4 w-4" />
            </Button>
          </div>
        </div>
        <div className="max-h-[80vh] overflow-auto p-4">
          {!url ? (
            <div className="py-12 text-center text-sm text-muted-foreground">Loading…</div>
          ) : isImage ? (
            <img src={url} alt={att?.filename} className="mx-auto max-h-[75vh]" />
          ) : isPdf ? (
            <Document
              file={url}
              onLoadSuccess={({ numPages: n }) => setNumPages(n)}
              loading={<div className="py-12 text-center text-sm text-muted-foreground">Loading PDF…</div>}
              error={<div className="py-12 text-center text-sm text-destructive">Failed to load PDF.</div>}
            >
              {Array.from({ length: numPages || 0 }).map((_, i) => (
                <Page key={i} pageNumber={i + 1} width={760} className="mb-3 shadow" />
              ))}
            </Document>
          ) : (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No preview available. Use the download button.
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
