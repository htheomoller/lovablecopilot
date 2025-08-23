/**
 * Utility functions for iframe detection and navigation
 * Used to handle OAuth flows in Lovable editor preview
 */

/**
 * Check if the current window is running inside an iframe
 * @returns true if window is framed, false otherwise
 */
export const isFramed = (): boolean => {
  return window.self !== window.top;
};

/**
 * Open a URL in the top-level window (breaks out of iframe)
 * @param url - The URL to navigate to
 */
export const openTop = (url: string): void => {
  if (window.top) {
    window.top.location.href = url;
  }
};