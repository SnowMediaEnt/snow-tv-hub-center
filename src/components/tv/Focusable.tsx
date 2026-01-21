import React, { useRef, useEffect, forwardRef, useImperativeHandle } from 'react';
import { useFocusContext } from '@/contexts/FocusContext';
import { cn } from '@/lib/utils';

interface FocusableProps {
  focusId: string;
  section?: string;
  row?: number;
  col?: number;
  disabled?: boolean;
  onFocus?: () => void;
  onSelect?: () => void;
  onClick?: () => void;
  className?: string;
  focusClassName?: string;
  children: React.ReactNode;
}

export interface FocusableRef {
  focus: () => void;
  element: HTMLElement | null;
}

export const Focusable = forwardRef<FocusableRef, FocusableProps>(({
  focusId,
  section,
  row,
  col,
  disabled = false,
  onFocus,
  onSelect,
  onClick,
  className,
  focusClassName = 'ring-4 ring-brand-ice scale-105 z-10',
  children,
}, ref) => {
  const elementRef = useRef<HTMLDivElement>(null);
  const { currentFocusId, registerFocusable, unregisterFocusable, setFocus } = useFocusContext();
  
  const isFocused = currentFocusId === focusId;

  // Register with focus manager
  useEffect(() => {
    if (disabled) return;
    
    registerFocusable({
      id: focusId,
      ref: elementRef as React.RefObject<HTMLElement>,
      section,
      row,
      col,
    });

    return () => {
      unregisterFocusable(focusId);
    };
  }, [focusId, section, row, col, disabled, registerFocusable, unregisterFocusable]);

  // Call onFocus when this element becomes focused
  useEffect(() => {
    if (isFocused && onFocus) {
      onFocus();
    }
  }, [isFocused, onFocus]);

  // Expose imperative handle
  useImperativeHandle(ref, () => ({
    focus: () => setFocus(focusId),
    element: elementRef.current,
  }), [focusId, setFocus]);

  const handleClick = () => {
    setFocus(focusId);
    onSelect?.();
    onClick?.();
  };

  return (
    <div
      ref={elementRef}
      data-focus-id={focusId}
      data-focused={isFocused}
      tabIndex={disabled ? -1 : 0}
      onClick={handleClick}
      className={cn(
        'outline-none transition-all duration-200 cursor-pointer',
        isFocused && focusClassName,
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      aria-disabled={disabled}
    >
      {children}
    </div>
  );
});

Focusable.displayName = 'Focusable';

// Utility hook for checking if an element is focused
export const useFocusState = (focusId: string) => {
  const { currentFocusId } = useFocusContext();
  return currentFocusId === focusId;
};

// Focusable button variant
interface FocusableButtonProps extends FocusableProps {
  variant?: 'default' | 'gold' | 'outline';
}

export const FocusableButton = forwardRef<FocusableRef, FocusableButtonProps>((props, ref) => {
  const { variant = 'default', className, ...rest } = props;
  
  const variantClasses = {
    default: 'bg-primary text-primary-foreground hover:bg-primary/90 px-4 py-2 rounded-md',
    gold: 'bg-brand-gold text-brand-charcoal hover:opacity-90 px-4 py-2 rounded-md',
    outline: 'border border-input bg-background hover:bg-accent px-4 py-2 rounded-md',
  };

  return (
    <Focusable
      ref={ref}
      className={cn(variantClasses[variant], className)}
      {...rest}
    />
  );
});

FocusableButton.displayName = 'FocusableButton';
