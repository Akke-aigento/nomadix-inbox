import { describe, expect, it, vi, beforeAll, afterEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { I18nProvider } from "@/i18n";
import { ThreadRowItem } from "../ThreadRow";
import type { ThreadRow } from "@/hooks/useThreadsQuery";

const WIDTH = 390;

const thread: ThreadRow = {
  id: "t1",
  subject: "Factuur september",
  preview: "Beste Akke,",
  last_message_at: "2026-09-24T08:00:00.000Z",
  is_archived: false,
  is_starred: false,
  is_muted: false,
  snoozed_until: null,
  has_attachments: false,
  unread_count: 1,
  message_count: 1,
  brand_id: null,
  participants: [],
  brand: null,
  latest_message: null,
};

beforeAll(() => {
  // jsdom geeft elk element breedte 0; de veegdrempels rekenen met de rij.
  Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
    configurable: true,
    value: WIDTH,
  });
});

afterEach(cleanup);

function setup(props: Partial<React.ComponentProps<typeof ThreadRowItem>> = {}) {
  const handlers = {
    onClick: vi.fn(),
    onToggleSelect: vi.fn(),
    onArchive: vi.fn(),
    onToggleRead: vi.fn(),
    onMore: vi.fn(),
    onLongPress: vi.fn(),
    onSwipeOpenChange: vi.fn(),
  };
  const utils = render(
    <I18nProvider>
      <ThreadRowItem
        thread={thread}
        density="comfortable"
        selected={false}
        focused={false}
        active={false}
        isUnread
        touch
        {...handlers}
        {...props}
      />
    </I18nProvider>,
  );
  const row = screen.getByText("Factuur september").closest("div[style]") as HTMLElement;
  return { ...utils, ...handlers, row };
}

function swipe(el: HTMLElement, dx: number) {
  fireEvent.touchStart(el, { touches: [{ clientX: 200, clientY: 100 }] });
  fireEvent.touchMove(el, { touches: [{ clientX: 200 + dx, clientY: 100 }] });
  fireEvent.touchEnd(el, { changedTouches: [{ clientX: 200 + dx, clientY: 100 }] });
}

describe("ThreadRowItem — vegen", () => {
  it("archiveert bij een veeg ver naar links", () => {
    const { row, onArchive, onSwipeOpenChange } = setup();
    swipe(row, -250);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onSwipeOpenChange).toHaveBeenLastCalledWith(false);
  });

  it("zet de knoppen open bij een korte veeg naar links", () => {
    const { row, onArchive, onSwipeOpenChange } = setup();
    swipe(row, -100);
    expect(onArchive).not.toHaveBeenCalled();
    expect(onSwipeOpenChange).toHaveBeenLastCalledWith(true);
  });

  it("wisselt gelezen/ongelezen bij een veeg naar rechts", () => {
    const { row, onToggleRead } = setup();
    swipe(row, 120);
    expect(onToggleRead).toHaveBeenCalledTimes(1);
  });

  it("doet niets bij verticaal scrollen", () => {
    const { row, onArchive, onToggleRead, onSwipeOpenChange } = setup();
    fireEvent.touchStart(row, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 190, clientY: 240 }] });
    fireEvent.touchEnd(row, { changedTouches: [{ clientX: 190, clientY: 240 }] });
    expect(onArchive).not.toHaveBeenCalled();
    expect(onToggleRead).not.toHaveBeenCalled();
    expect(onSwipeOpenChange).not.toHaveBeenCalled();
  });

  it("opent het gesprek niet zolang de knoppen openstaan", () => {
    const { row, onClick, onSwipeOpenChange } = setup({ swipeOpen: true });
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
    expect(onSwipeOpenChange).toHaveBeenCalledWith(false);
  });

  it("selecteert in plaats van openen zodra de selectiemodus aan staat", () => {
    const { row, onClick, onToggleSelect } = setup({ selectionMode: true });
    fireEvent.click(row);
    expect(onClick).not.toHaveBeenCalled();
    expect(onToggleSelect).toHaveBeenCalledTimes(1);
  });

  it("veegt niet op desktop", () => {
    const { row, onArchive } = setup({ touch: false });
    swipe(row, -250);
    expect(onArchive).not.toHaveBeenCalled();
  });
});

describe("ThreadRowItem — lang indrukken", () => {
  it("start de selectiemodus na het vasthouden", () => {
    vi.useFakeTimers();
    const { row, onLongPress } = setup();
    fireEvent.touchStart(row, { touches: [{ clientX: 200, clientY: 100 }] });
    vi.advanceTimersByTime(500);
    expect(onLongPress).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("stopt zodra de vinger beweegt", () => {
    vi.useFakeTimers();
    const { row, onLongPress } = setup();
    fireEvent.touchStart(row, { touches: [{ clientX: 200, clientY: 100 }] });
    fireEvent.touchMove(row, { touches: [{ clientX: 160, clientY: 100 }] });
    vi.advanceTimersByTime(500);
    expect(onLongPress).not.toHaveBeenCalled();
    vi.useRealTimers();
  });
});
