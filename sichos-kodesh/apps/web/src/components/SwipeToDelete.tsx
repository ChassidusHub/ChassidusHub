import { useRef, useState } from 'react';
import type { ReactNode } from 'react';

interface Props {
  onDelete: () => void;
  /** Label for the revealed delete action - shown on both sides. */
  deleteLabel: string;
  children: ReactNode;
}

/** How far (px) the user must drag before releasing counts as "delete". */
const DELETE_THRESHOLD = 80;

/**
 * Wraps `children` in a swipe-to-delete container. Dragging the row in
 * either direction reveals a red "Delete" backing; releasing past
 * DELETE_THRESHOLD commits the deletion, releasing before it snaps the row
 * back. Mouse drag is also supported for desktop testing.
 */
export function SwipeToDelete({ onDelete, deleteLabel, children }: Props) {
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const startX = useRef<number | null>(null);
  const startOffset = useRef(0);

  function begin(clientX: number) {
    startX.current = clientX;
    startOffset.current = offset;
    setTransitioning(false);
  }

  function move(clientX: number) {
    if (startX.current === null) return;
    const delta = clientX - startX.current;
    setOffset(startOffset.current + delta);
  }

  function end() {
    if (startX.current === null) return;
    startX.current = null;
    setTransitioning(true);
    if (Math.abs(offset) >= DELETE_THRESHOLD) {
      // Slide fully off in the direction of the swipe then call onDelete.
      setOffset(offset < 0 ? -1000 : 1000);
      setTimeout(onDelete, 250);
    } else {
      setOffset(0);
    }
  }

  return (
    <div className="swipe-to-delete-wrapper">
      {/* Red backing revealed on either side as the row slides away */}
      <span className="swipe-to-delete-backing" aria-hidden>
        {deleteLabel}
      </span>
      {/* The actual row content */}
      <div
        className="swipe-to-delete-row"
        style={{
          transform: `translateX(${offset}px)`,
          transition: transitioning ? 'transform 0.25s ease' : 'none',
        }}
        onTouchStart={(e) => begin(e.touches[0]!.clientX)}
        onTouchMove={(e) => move(e.touches[0]!.clientX)}
        onTouchEnd={end}
        onMouseDown={(e) => begin(e.clientX)}
        onMouseMove={(e) => { if (startX.current !== null) move(e.clientX); }}
        onMouseUp={end}
        onMouseLeave={end}
      >
        {children}
      </div>
    </div>
  );
}
