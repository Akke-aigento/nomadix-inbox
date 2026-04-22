import DOMPurify from "dompurify";

/**
 * Sanitize untrusted signature/email HTML before rendering with
 * dangerouslySetInnerHTML. Allows the tags/attributes typically used
 * in email signatures (including tables and inline `cid:` images)
 * while stripping scripts, event handlers, and dangerous URIs.
 */
export function sanitizeSignature(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "a", "img", "span", "div",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "small", "b", "i",
      "table", "thead", "tbody", "tr", "td", "th",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "style", "target", "rel", "class",
      "width", "height",
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|cid):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
  });
}

/** Backwards-compatible alias matching the more descriptive name. */
export const sanitizeSignatureHtml = sanitizeSignature;

/**
 * Sanitize full email message HTML. More permissive than signatures —
 * allows blockquotes, pre, code, hr, and a wider attribute set typical of
 * marketing/transactional emails. Still strips scripts and dangerous URIs.
 */
export function sanitizeEmailHtml(html: string | null | undefined): string {
  if (!html) return "";
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [
      "p", "br", "strong", "em", "u", "a", "img", "span", "div",
      "ul", "ol", "li", "h1", "h2", "h3", "h4", "h5", "h6",
      "small", "b", "i", "s", "sub", "sup", "blockquote",
      "pre", "code", "hr", "figure", "figcaption", "center",
      "table", "thead", "tbody", "tfoot", "tr", "td", "th", "caption", "colgroup", "col",
    ],
    ALLOWED_ATTR: [
      "href", "src", "alt", "title", "style", "target", "rel", "class",
      "width", "height", "align", "valign", "bgcolor", "color",
      "cellpadding", "cellspacing", "border",
      "colspan", "rowspan", "id", "name",
    ],
    ALLOWED_URI_REGEXP:
      /^(?:(?:https?|mailto|cid|tel|data):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    ADD_ATTR: ["target"],
  });
}
