import React from 'react';
import { useSpatialNavigation, getFocusClasses } from '@/hooks/useSpatialNavigation';

interface TVNavigationWrapperProps {
  children: React.ReactNode;
  onBack?: () => void;
  className?: string;
  initialFocusId?: string;
}

/**
 * Wrapper component that provides TV D-pad navigation for its children.
 * Uses spatial navigation with nearest-neighbor algorithm.
 * 
 * Children should use data-focus-id attribute to be focusable.
 * 
 * Example:
 * ```tsx
 * <TVNavigationWrapper onBack={handleBack}>
 *   <button data-focus-id="btn-1">Button 1</button>
 *   <button data-focus-id="btn-2">Button 2</button>
 * </TVNavigationWrapper>
 * ```
 */
export const TVNavigationWrapper: React.FC<TVNavigationWrapperProps> = ({
  children,
  onBack,
  className = '',
  initialFocusId,
}) => {
  const { containerRef } = useSpatialNavigation({
    enabled: true,
    onBack,
    initialFocusId,
  });

  return (
    <div ref={containerRef} className={className}>
      {children}
    </div>
  );
};

/**
 * Hook to apply focus styles based on data-focused attribute
 */
export const useTVFocusStyles = (focusId: string) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const ref = React.useRef<HTMLElement>(null);

  React.useEffect(() => {
    const observer = new MutationObserver(() => {
      if (ref.current) {
        setIsFocused(ref.current.getAttribute('data-focused') === 'true');
      }
    });

    if (ref.current) {
      observer.observe(ref.current, { attributes: true, attributeFilter: ['data-focused'] });
      setIsFocused(ref.current.getAttribute('data-focused') === 'true');
    }

    return () => observer.disconnect();
  }, []);

  return { ref, isFocused, focusClasses: getFocusClasses(isFocused) };
};

export { getFocusClasses };
