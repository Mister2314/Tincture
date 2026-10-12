/**
 * Applies the active theme to the document.
 *
 * Kept as its own component so the theme is written in one place. It reads the selected
 * theme (or the preview, when the theme view is open) and hands it to `applyTheme`, which
 * is the only function that touches the DOM with theme data.
 */

import { useEffect } from 'react';

import { applyTheme } from '../theme/apply';
import { findTheme } from '../theme/registry';
import { useStore } from './state/store';

export function ThemeRoot() {
  const { state } = useStore();
  const id = state.previewThemeId ?? state.settings.themeId;

  const theme = findTheme(id, state.customThemes);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  // A theme that asks for no motion should win over the OS preference, and vice versa.
  // The attribute is read by `styles/app.css`.
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(state.settings.reduceMotion);
  }, [state.settings.reduceMotion]);

  return null;
}
