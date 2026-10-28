import * as React from 'react';
import { ImageOff } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface ImageWithFallbackProps
  extends React.ImgHTMLAttributes<HTMLImageElement> {
  /** Class for the fallback frame; defaults to className so the box stays stable. */
  fallbackClassName?: string;
}

/**
 * An <img> that degrades to a neutral placeholder frame when its source fails
 * to load (or is empty). The fallback keeps the same box as the image, so the
 * layout never shifts and no broken-image glyph is shown.
 */
const ImageWithFallback = React.forwardRef<HTMLImageElement, ImageWithFallbackProps>(
  ({ className, fallbackClassName, alt, src, onError, ...props }, ref) => {
    const [failed, setFailed] = React.useState(false);

    // A new source deserves a fresh attempt.
    React.useEffect(() => {
      setFailed(false);
    }, [src]);

    if (failed || !src) {
      return (
        <div
          role="img"
          aria-label={alt}
          className={cn(
            'flex items-center justify-center bg-muted text-muted-foreground',
            fallbackClassName ?? className,
          )}
        >
          <ImageOff className="h-6 w-6" aria-hidden="true" />
        </div>
      );
    }

    return (
      <img
        ref={ref}
        src={src}
        alt={alt}
        className={className}
        onError={(event) => {
          setFailed(true);
          onError?.(event);
        }}
        {...props}
      />
    );
  },
);
ImageWithFallback.displayName = 'ImageWithFallback';

export { ImageWithFallback };
