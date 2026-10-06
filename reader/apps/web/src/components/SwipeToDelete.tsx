import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Trash2 } from 'lucide-react';

interface Props {
  onDelete: () => void;
  children: ReactNode;
}

/** How far (px) the user must drag before releasing counts as "delete". */
const DELETE_THRESHOLD = 80;

/**
 * Wraps `children` in a swipe-to-delete container. Dragging the row in
 * either direction reveals a red backing with a trash icon on the side
 * the user is swiping toward; releasing past DELETE_THRESHOLD commits the
 * deletion, releasing before it snaps the row back. Mouse drag is also
 * supported for desktop testing.
 */
export function SwipeToDelete({ onDelete, children }: Props) {
  const [offset, setOffset] = useState(0);
  const [transitioning, setTransitioning] = useState(false);
  const startX = useRef<number | null>(null);
  const startOffset = useRef(0);

  // 'left' = user dragged left (trash icon on right side), 'right' = vice versa
  const direction = offset < 0 ? 'left' : 'right';

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
      setOffset(offset < 0 ? -1000 : 1000);
      setTimeout(onDelete, 250);
    } else {
      setOffset(0);
    }
  }

  return (
    <div className="swipe-to-delete-wrapper">
      {offset !== 0 && (
        <span
          className={`swipe-to-delete-backing swipe-to-delete-backing--${direction}`}
          aria-hidden
        >
          <Trash2 size={20} />
        </span>
      )}
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
