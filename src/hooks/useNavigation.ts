import { useState, useEffect, useCallback } from 'react';

interface NavigationState {
  currentView: string;
  previousView: string | null;
  navigationStack: string[];
}

export const useNavigation = (initialView: string = 'home') => {
  const [navigationState, setNavigationState] = useState<NavigationState>({
    currentView: initialView,
    previousView: null,
    navigationStack: [initialView]
  });

  const [backPressCount, setBackPressCount] = useState(0);
  const [lastBackPressTime, setLastBackPressTime] = useState(0);

  const navigateTo = useCallback((view: string) => {
    setNavigationState(prev => ({
      currentView: view,
      previousView: prev.currentView,
      navigationStack: [...prev.navigationStack, view]
    }));
  }, []);

  const goBack = useCallback(() => {
    setNavigationState(prev => {
      if (prev.navigationStack.length <= 1) {
        // We're at the root (home), handle double-press to exit
        if (prev.currentView === 'home') {
          const now = Date.now();
          if (now - lastBackPressTime < 1000) {
            // Double press detected within 1 second
            try {
              if (window.navigator && 'app' in window.navigator) {
                // For mobile apps
                (window.navigator as any).app.exitApp();
              } else if ((window as any).Android && (window as any).Android.exitApp) {
                // For Android WebView
                (window as any).Android.exitApp();
              } else {
                // For web/desktop
                window.close();
              }
            } catch (error) {
              console.log('Exit app failed:', error);
            }
            return prev;
          } else {
            setLastBackPressTime(now);
            setBackPressCount(1);
            return prev;
          }
        }
        return prev;
      }

      const newStack = [...prev.navigationStack];
      newStack.pop(); // Remove current view
      const previousView = newStack[newStack.length - 1];

      return {
        currentView: previousView,
        previousView: prev.currentView,
        navigationStack: newStack
      };
    });
  }, [lastBackPressTime]);

  const resetNavigation = useCallback(() => {
    setNavigationState({
      currentView: initialView,
      previousView: null,
      navigationStack: [initialView]
    });
    setBackPressCount(0);
    setLastBackPressTime(0);
  }, [initialView]);

  // Reset back press count after timeout
  useEffect(() => {
    if (backPressCount > 0) {
      const timeout = setTimeout(() => {
        setBackPressCount(0);
      }, 1000);
      return () => clearTimeout(timeout);
    }
  }, [backPressCount]);

  return {
    currentView: navigationState.currentView,
    previousView: navigationState.previousView,
    navigationStack: navigationState.navigationStack,
    backPressCount,
    navigateTo,
    goBack,
    resetNavigation,
    canGoBack: navigationState.navigationStack.length > 1
  };
};