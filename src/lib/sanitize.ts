import DOMPurify from "dompurify";

/**
 * Sanitize untrusted signature/email HTML before rendering with
 * dangerouslySetInnerHTML. Allows the tags/attributes typically used
 * in email signatures while stripping scripts, event handlers, etc.
 */
export function sanitizeSignature(html: string): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p",
      "br",
      "strong",
      "em",
      "u",
      "a",
      "img",
      "span",
      "div",
      "ul",
      "ol",
      "li",
      "h1",
      "h2",
      "h3",
      "small",
      "b",
      "i",
    ],
    ALLOWED_ATTR: ["href", "src", "alt", "style", "target", "rel", "class"],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}
