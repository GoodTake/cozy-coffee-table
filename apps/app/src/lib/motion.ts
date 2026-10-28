// Platform-injected motion primitives. Refreshed on every preview start — edits here are
// overwritten. Build page-specific motion in your own components using these as the base.
//
// Two distinct scales live here, and mixing them up is the most common way a site ends up
// feeling dead: CONTENT ENTRANCES are large and slow (48px / 0.7s) so they read as content
// arriving while the visitor scrolls; UI FEEDBACK is small and fast (0.2s) so it reads as a
// response to input. A 16px/0.3s entrance is a UI tick — it vanishes mid-scroll.
import { useEffect, useRef } from 'react';
import {
  useMotionValue,
  useReducedMotion,
  useScroll,
  useSpring,
  useTransform,
  type Variants,
} from 'framer-motion';

const EASE = [0.16, 1, 0.3, 1];
const REVEAL_DISTANCE = 48;
const REVEAL_DURATION = 0.7;
const FEEDBACK_DURATION = 0.2;
const STAGGER = 0.08;
const REDUCED_DURATION = 0.1;

const SPRING = { type: 'spring' as const, stiffness: 380, damping: 22, mass: 0.7 };

/**
 * Always pair a scroll entrance with this. `amount: 0.25` waits until a quarter of the
 * element is visible, so the reveal happens where the visitor is looking rather than the
 * instant its top edge clips the fold.
 */
export const revealViewport = { once: true, amount: 0.25 } as const;

/** Wraps each word of a text reveal. Required — without it the words have nothing to slide out of. */
export const textRevealMask = {
  display: 'inline-block',
  overflow: 'hidden',
  verticalAlign: 'bottom',
} as const;

export interface MotionPrimitives {
  /** Content entrance. `initial="hidden" whileInView="visible" viewport={revealViewport}`. */
  fadeInUp: Variants;
  /** Content entrance for media and emphasis moments. */
  scaleIn: Variants;
  /**
   * Parent of a list or grid. Children MUST use `staggerItem` or nothing staggers, and the
   * container MUST be driven by `whileInView` — never `animate`. A list rendered from async
   * data mounts after its parent's own entrance has finished, and the variant never reaches
   * the children, leaving every row stuck at `hidden` and invisible.
   */
  staggerContainer: Variants;
  /** Child of a `staggerContainer`. */
  staggerItem: Variants;
  /** Same pair, grouped so it is harder to ship a container with no items. */
  stagger: { container: Variants; item: Variants };
  /** Per-word headline reveal. Wrap every word in a span styled with `textRevealMask`. */
  textReveal: { container: Variants; word: Variants };
  /** Spread onto a route-level wrapper. */
  pageTransition: {
    initial: Record<string, number>;
    animate: Record<string, number>;
    exit: Record<string, number>;
    transition: { duration: number; ease: number[] };
  };
  /** Spread onto an interactive card or button. Springs, so it has weight. */
  hoverLift: {
    whileHover: Record<string, number>;
    whileTap: Record<string, number>;
    transition: typeof SPRING;
  };
}

const full: MotionPrimitives = {
  fadeInUp: {
    hidden: { opacity: 0, y: REVEAL_DISTANCE },
    visible: { opacity: 1, y: 0, transition: { duration: REVEAL_DURATION, ease: EASE } },
  },
  scaleIn: {
    hidden: { opacity: 0, scale: 0.94 },
    visible: { opacity: 1, scale: 1, transition: { duration: REVEAL_DURATION, ease: EASE } },
  },
  staggerContainer: {
    hidden: {},
    visible: { transition: { staggerChildren: STAGGER, delayChildren: 0.05 } },
  },
  staggerItem: {
    hidden: { opacity: 0, y: 32 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
  },
  stagger: { container: {}, item: {} },
  textReveal: {
    container: {
      hidden: {},
      visible: { transition: { staggerChildren: 0.07 } },
    },
    word: {
      hidden: { y: '110%' },
      visible: { y: '0%', transition: { duration: 0.8, ease: EASE } },
    },
  },
  pageTransition: {
    initial: { opacity: 0, y: 12 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: -12 },
    transition: { duration: 0.35, ease: EASE },
  },
  hoverLift: {
    whileHover: { y: -6, scale: 1.02 },
    whileTap: { scale: 0.98 },
    transition: SPRING,
  },
};
full.stagger = { container: full.staggerContainer, item: full.staggerItem };

const reducedTransition = { duration: REDUCED_DURATION };

const reduced: MotionPrimitives = {
  fadeInUp: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: reducedTransition },
  },
  scaleIn: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: reducedTransition },
  },
  staggerContainer: {
    hidden: {},
    visible: { transition: { staggerChildren: 0, delayChildren: 0 } },
  },
  staggerItem: {
    hidden: { opacity: 0 },
    visible: { opacity: 1, transition: reducedTransition },
  },
  stagger: { container: {}, item: {} },
  textReveal: {
    container: { hidden: {}, visible: { transition: { staggerChildren: 0 } } },
    word: { hidden: { opacity: 0 }, visible: { opacity: 1, transition: reducedTransition } },
  },
  pageTransition: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
    transition: { duration: REDUCED_DURATION, ease: EASE },
  },
  hoverLift: {
    whileHover: {},
    whileTap: {},
    transition: SPRING,
  },
};
reduced.stagger = { container: reduced.staggerContainer, item: reduced.staggerItem };

/**
 * Motion primitives honouring the visitor's reduced-motion preference. Always call this
 * rather than importing variants directly.
 *
 * ```tsx
 * const m = useMotionPrimitives();
 *
 * // Every section below the fold — never `animate`, or it plays before it is seen.
 * <motion.section variants={m.fadeInUp} initial="hidden" whileInView="visible" viewport={revealViewport} />
 *
 * // Headline, one word at a time.
 * <motion.h1 variants={m.textReveal.container} initial="hidden" whileInView="visible" viewport={revealViewport}>
 *   {'Coffee has roots.'.split(' ').map((w, i) => (
 *     <span key={i} style={textRevealMask}>
 *       <motion.span style={{ display: 'inline-block' }} variants={m.textReveal.word}>{w}&nbsp;</motion.span>
 *     </span>
 *   ))}
 * </motion.h1>
 *
 * // A grid: container and item must both be present.
 * <motion.ul variants={m.stagger.container} initial="hidden" whileInView="visible" viewport={revealViewport}>
 *   {items.map((it) => <motion.li key={it.id} variants={m.stagger.item} />)}
 * </motion.ul>
 * ```
 */
export function useMotionPrimitives(): MotionPrimitives {
  return useReducedMotion() ? reduced : full;
}

/**
 * Scroll-linked parallax. Attach `ref` to the element and spread `style` onto a
 * `motion.*` node; it drifts as the element crosses the viewport, giving the page depth.
 * Returns a static style under reduced motion.
 *
 * ```tsx
 * const hero = useParallax(80);
 * <div ref={hero.ref}><motion.img style={hero.style} /></div>
 * ```
 */
export function useParallax(distance = 60) {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });
  const y = useTransform(scrollYProgress, [0, 1], [distance, -distance]);
  return { ref, style: reduce ? {} : { y } };
}

/**
 * Cursor-reactive tilt for cards. Spread `handlers` and `style` onto a `motion.*` node.
 * Inert under reduced motion.
 *
 * ```tsx
 * const tilt = useTilt();
 * <motion.article {...tilt.handlers} style={tilt.style} />
 * ```
 */
export function useTilt(strength = 12) {
  const reduce = useReducedMotion();
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotateY = useSpring(useTransform(x, [-0.5, 0.5], [-strength, strength]), SPRING);
  const rotateX = useSpring(useTransform(y, [-0.5, 0.5], [strength, -strength]), SPRING);

  function onMouseMove(event: React.MouseEvent<HTMLElement>) {
    if (reduce) return;
    const rect = event.currentTarget.getBoundingClientRect();
    x.set((event.clientX - rect.left) / rect.width - 0.5);
    y.set((event.clientY - rect.top) / rect.height - 0.5);
  }

  function onMouseLeave() {
    x.set(0);
    y.set(0);
  }

  return {
    handlers: { onMouseMove, onMouseLeave },
    style: reduce ? {} : { rotateX, rotateY, transformPerspective: 600 },
  };
}

/**
 * Inertial smooth scrolling for the whole site. Call once in `RootLayout` — it is the
 * single change that alters how every page feels. No-op under reduced motion.
 *
 * Because it drives scroll itself, use `scrollTo` from here for in-page anchors rather
 * than `window.scrollTo` or `scrollIntoView`.
 */
export function useSmoothScroll() {
  const reduce = useReducedMotion();
  const instance = useRef<{ raf: (time: number) => void; destroy: () => void } | null>(null);

  useEffect(() => {
    if (reduce) return;
    let frame = 0;
    let cancelled = false;

    import('lenis')
      .then(({ default: Lenis }) => {
        if (cancelled) return;
        const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
        instance.current = lenis;
        const raf = (time: number) => {
          lenis.raf(time);
          frame = requestAnimationFrame(raf);
        };
        frame = requestAnimationFrame(raf);
      })
      // Projects scaffolded before lenis was a dependency still receive this file. Fall back
      // to native scrolling rather than breaking the page, and say why.
      .catch(() => {
        console.warn('[motion] smooth scrolling is off: run `npm install lenis` to enable it.');
      });

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      instance.current?.destroy();
      instance.current = null;
    };
  }, [reduce]);
}
