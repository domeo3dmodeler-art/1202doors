'use client';

import React, { useState, useEffect, useRef } from 'react';
import { enqueueImageLoad, isUploadsPath } from '@/lib/configurator/image-load-queue';

type ImgProps = React.ImgHTMLAttributes<HTMLImageElement>;

export function ThrottledImage({ src, onLoad, onError, ...props }: ImgProps) {
  const [effectiveSrc, setEffectiveSrc] = useState<string | undefined>(() =>
    !src || !isUploadsPath(src) ? (src || undefined) : undefined
  );
  const releaseRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    if (!src) {
      setEffectiveSrc(undefined);
      return;
    }
    if (!isUploadsPath(src)) {
      setEffectiveSrc(src);
      return;
    }

    let mounted = true;

    const cancel = enqueueImageLoad((release) => {
      if (!mounted) {
        release();
        return;
      }
      releaseRef.current = release;
      setEffectiveSrc(src);
    });

    return () => {
      mounted = false;
      cancel();
      if (releaseRef.current) {
        releaseRef.current();
        releaseRef.current = null;
      }
    };
  }, [src]);

  const handleLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    releaseRef.current?.();
    releaseRef.current = null;
    onLoad?.(e);
  };
  const handleError = (e: React.SyntheticEvent<HTMLImageElement>) => {
    releaseRef.current?.();
    releaseRef.current = null;
    onError?.(e);
  };

  return (
    <img
      {...props}
      src={effectiveSrc ?? undefined}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}
