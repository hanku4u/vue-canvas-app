import type { GlobalThemeOverrides } from 'naive-ui'

/** Class toggled on <html> so the app's own CSS tokens (styles.css) follow dark mode. */
export const DARK_MODE_CLASS = 'app-dark'

const FONT =
  "'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

const shared: GlobalThemeOverrides['common'] = {
  fontFamily: FONT,
  fontSize: '14px',
  borderRadius: '6px',
}

/** Naive UI theme overrides: indigo primary, compact sizing. */
export const lightThemeOverrides: GlobalThemeOverrides = {
  common: {
    ...shared,
    primaryColor: '#4f46e5',
    primaryColorHover: '#6366f1',
    primaryColorPressed: '#4338ca',
    primaryColorSuppl: '#6366f1',
  },
}

export const darkThemeOverrides: GlobalThemeOverrides = {
  common: {
    ...shared,
    primaryColor: '#818cf8',
    primaryColorHover: '#a5b4fc',
    primaryColorPressed: '#6366f1',
    primaryColorSuppl: '#a5b4fc',
  },
}
