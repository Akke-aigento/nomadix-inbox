import { useCallback, useEffect, useRef, useState } from "react";
import { dampen, isHorizontal, resolveSwipe, type SwipeAction } from "@/lib/swipe";

/** Breedte van het knoppenvlak dat na een korte veeg naar links blijft staan. */
export const SWIPE_OPEN_WIDTH = 144;

interface Options {
  enabled: boolean;
  /** Blijft het knoppenvlak open staan? Wordt van buiten bestuurd, zodat er
   *  altijd maar één rij tegelijk openstaat. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDelete: () => void;
  onToggleRead: () => void;
}

/** Vegen op een rij. De verschuiving zit op de rij-inhoud, niet op de
 *  container: de virtualisatie van de lijst blijft zo ongemoeid. */
export function useSwipeRow({ enabled, open, onOpenChange, onDelete, onToggleRead }: Options) {
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; width: number } | null>(null);
  const axis = useRef<"none" | "x" | "y">("none");
  const lastAction = useRef<SwipeAction | null>(null);

  const base = open ? -SWIPE_OPEN_WIDTH : 0;

  // Sluit het knoppenvlak zodra iets anders de rij dichtklapt.
  useEffect(() => {
    if (!open) setDrag(0);
  }, [open]);

  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      if (!enabled || e.touches.length !== 1) return;
      const touch = e.touches[0];
      start.current = {
        x: touch.clientX,
        y: touch.clientY,
        width: (e.currentTarget as HTMLElement).offsetWidth || window.innerWidth,
      };
      axis.current = "none";
      lastAction.current = null;
    },
    [enabled],
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const s = start.current;
      if (!s || !enabled) return;
      const touch = e.touches[0];
      const dx = touch.clientX - s.x;
      const dy = touch.clientY - s.y;

      if (axis.current === "none") {
        if (isHorizontal(dx, dy)) {
          axis.current = "x";
          setDragging(true);
        } else if (Math.abs(dy) > 8) {
          axis.current = "y"; // verticaal scrollen wint
        }
      }
      if (axis.current !== "x") return;

      const total = dampen(base + dx, s.width);
      const action = resolveSwipe(total, s.width);
      // Eén tikje op het moment dat de veeg iets gaat betekenen.
      if (action !== lastAction.current) {
        if (action) navigator.vibrate?.(10);
        lastAction.current = action;
      }
      setDrag(total - base);
    },
    [base, enabled],
  );

  const finish = useCallback(() => {
    const s = start.current;
    start.current = null;
    if (axis.current !== "x" || !s) {
      axis.current = "none";
      return;
    }
    axis.current = "none";
    setDragging(false);
    const action = resolveSwipe(base + drag, s.width);
    setDrag(0);
    if (action === "delete") {
      onOpenChange(false);
      onDelete();
    } else if (action === "toggleRead") {
      onOpenChange(false);
      onToggleRead();
    } else if (action === "actions") {
      onOpenChange(true);
    } else {
      onOpenChange(false);
    }
  }, [base, drag, onDelete, onOpenChange, onToggleRead]);

  const offset = enabled ? base + drag : 0;

  return {
    offset,
    dragging,
    /** Wat er nú zou gebeuren — stuurt de achtergrond tijdens het slepen. */
    pending: dragging ? resolveSwipe(offset, start.current?.width ?? window.innerWidth) : null,
    bind: {
      onTouchStart,
      onTouchMove,
      onTouchEnd: finish,
      onTouchCancel: finish,
    },
  };
}
