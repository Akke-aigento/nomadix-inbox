import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { useEffect, useRef } from "react";
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Quote, Strikethrough } from "lucide-react";
import { cn } from "@/lib/utils";
import { useT } from "@/i18n";

interface Props {
  initialHtml: string;
  /** `userEdit` is false for programmatic updates (tiptap v3 emits onUpdate on setContent). */
  onChange: (html: string, meta: { userEdit: boolean }) => void;
  /** Standaard: t("inbox.editor.placeholder") */
  placeholder?: string;
  minHeight?: number;
  /** Put the caret at the start when the editor mounts (composer opened). */
  autoFocus?: boolean;
  /** ⌘↩ / Ctrl+↩ */
  onSubmit?: () => void;
  /** Vult de beschikbare hoogte; het schrijfvlak scrollt zelf. Voor de
   *  schermvullende opsteller op een telefoon. */
  fill?: boolean;
}

export function ComposeEditor({
  initialHtml,
  onChange,
  placeholder,
  minHeight = 200,
  autoFocus = false,
  onSubmit,
  fill = false,
}: Props) {
  const t = useT();
  const onSubmitRef = useRef(onSubmit);
  onSubmitRef.current = onSubmit;

  /** Whether the user has typed anything themselves (user-edit) since mount. */
  const hasUserEditedRef = useRef(false);

  const editor = useEditor({
    autofocus: autoFocus ? "start" : false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { rel: "noopener noreferrer", target: "_blank" },
      }),
      Placeholder.configure({ placeholder: placeholder ?? t("inbox.editor.placeholder") }),
    ],
    content: initialHtml,
    editorProps: {
      attributes: {
        // text-base onder md: Safari zoomt in op een veld kleiner dan 16px.
        class:
          "prose prose-sm prose-invert max-w-none focus:outline-none px-4 py-3 text-base md:text-sm",
        style: `min-height:${minHeight}px`,
      },
      handleKeyDown: (_view, event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && onSubmitRef.current) {
          event.preventDefault();
          onSubmitRef.current();
          return true;
        }
        return false;
      },
    },
    onUpdate: ({ editor }) => {
      if (editor.isFocused) hasUserEditedRef.current = true;
      onChange(editor.getHTML(), { userEdit: editor.isFocused });
    },
  });

  // If initialHtml changes externally (e.g. switch reply mode), reset content
  useEffect(() => {
    if (!editor) return;
    if (editor.getHTML() !== initialHtml) {
      // Programmatic (signature / AI seed): must not look like a user edit.
      editor.commands.setContent(initialHtml, { emitUpdate: false });
      // The signature loads async after mount; setContent moves the caret to the
      // end (below signature/quote). Put it back at the start — but never yank
      // the caret away from a user who is already typing.
      if (autoFocus && !hasUserEditedRef.current) {
        editor.commands.focus("start");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialHtml]);

  if (!editor) return null;

  const ToolbarBtn = ({
    onClick,
    active,
    children,
    title,
  }: {
    onClick: () => void;
    active?: boolean;
    children: React.ReactNode;
    title: string;
  }) => (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className={cn(
        "rounded-md p-1.5 text-muted-foreground transition hover:bg-muted hover:text-foreground",
        active && "bg-muted text-foreground",
      )}
    >
      {children}
    </button>
  );

  const handleLink = () => {
    const previous = editor.getAttributes("link").href ?? "";
    const url = window.prompt(t("inbox.editor.linkPrompt"), previous);
    if (url === null) return;
    if (url === "") {
      editor.chain().focus().extendMarkRange("link").unsetLink().run();
      return;
    }
    editor.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
  };

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card",
        fill && "flex h-full min-h-0 flex-col",
      )}
    >
      <div className="flex flex-none flex-wrap items-center gap-0.5 border-b border-border px-2 py-1.5">
        <ToolbarBtn title={t("inbox.editor.bold")} onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")}>
          <Bold className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t("inbox.editor.italic")} onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")}>
          <Italic className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t("inbox.editor.strike")} onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")}>
          <Strikethrough className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarBtn title={t("inbox.editor.bulletList")} onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")}>
          <List className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t("inbox.editor.orderedList")} onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")}>
          <ListOrdered className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <ToolbarBtn title={t("inbox.editor.quote")} onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive("blockquote")}>
          <Quote className="h-3.5 w-3.5" />
        </ToolbarBtn>
        <span className="mx-1 h-4 w-px bg-border" />
        <ToolbarBtn title={t("inbox.editor.link")} onClick={handleLink} active={editor.isActive("link")}>
          <LinkIcon className="h-3.5 w-3.5" />
        </ToolbarBtn>
      </div>
      <EditorContent
        editor={editor}
        className={cn(fill && "min-h-0 flex-1 overflow-y-auto")}
      />
    </div>
  );
}
