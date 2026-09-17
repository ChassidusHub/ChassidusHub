import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const START_PAUSE_MS = 1000;
const SCROLL_PX_PER_SECOND = 28;
const MIN_SCROLL_MS = 2500;
const RESET_BUFFER_MS = 80;

interface Props {
  className?: string;
  text: string;
}

export function OverflowMarquee({ className, text }: Props) {
  const outerRef = useRef<HTMLSpanElement>(null);
  const innerRef = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(0);
  const [offset, setOffset] = useState(0);
  const [transitionMs, setTransitionMs] = useState(0);

  useLayoutEffect(() => {
    function measure() {
      const outer = outerRef.current;
      const inner = innerRef.current;
      if (!outer || !inner) return;
      setOverflow(Math.max(inner.scrollWidth - outer.clientWidth, 0));
    }

    const outer = outerRef.current;
    const inner = innerRef.current;
    if (!outer || !inner) return;

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(outer);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [text]);

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer || overflow <= 0) {
      setOffset(0);
      setTransitionMs(0);
      return;
    }

    let cancelled = false;
    let pauseTimer = 0;
    let resetTimer = 0;
    const direction = getComputedStyle(outer).direction === 'rtl' ? 1 : -1;
    const scrollMs = Math.max((overflow / SCROLL_PX_PER_SECOND) * 1000, MIN_SCROLL_MS);

    function queueCycle() {
      setOffset(0);
      setTransitionMs(0);
      pauseTimer = window.setTimeout(() => {
        if (cancelled) return;
        setTransitionMs(scrollMs);
        setOffset(direction * overflow);
        resetTimer = window.setTimeout(() => {
          if (cancelled) return;
          queueCycle();
        }, scrollMs + RESET_BUFFER_MS);
      }, START_PAUSE_MS);
    }

    queueCycle();

    return () => {
      cancelled = true;
      window.clearTimeout(pauseTimer);
      window.clearTimeout(resetTimer);
    };
  }, [overflow]);

  return (
    <span ref={outerRef} className={className}>
      <span
        ref={innerRef}
        className="overflow-marquee-content"
        style={{
          transform: `translateX(${offset}px)`,
          transitionDuration: `${transitionMs}ms`,
        }}
      >
        {text}
      </span>
    </span>
  );
}
