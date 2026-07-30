// Hypatia V3 — Tailwind theme extension.
// Merge into tailwind.config `theme.extend`. Mirrors design-tokens.css;
// if the two ever disagree, design-tokens.css wins.

export const hypatiaTheme = {
    colors: {
        ink: '#0d0d0f',
        surface: '#ffffff',
        stone: '#fafafa',
        page: '#fbfbfc',
        border: '#e7e7e9',
        accent: '#0051a5',          // RBC blue — the only saturated color
        'accent-bright': '#1a66ff', // WebGL / glow only
        gold: '#e8a821',            // details only: rails, badges, hot ticks
        success: '#10a37f',
        danger: '#f87171',
    },
    fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        serif: ['Playfair Display', 'Georgia', 'serif'],
        mono: ['JetBrains Mono', 'monospace'],
    },
    borderRadius: {
        panel: '22px',
        control: '12px',
        chip: '10px',
    },
    boxShadow: {
        subtle: '0 4px 20px rgba(13, 13, 15, 0.04)',
        panel: '0 12px 40px rgba(13, 13, 15, 0.05)',
        hover: '0 20px 50px rgba(13, 13, 15, 0.08)',
    },
    transitionTimingFunction: {
        hy: 'cubic-bezier(0.2, 0.8, 0.2, 1)',
    },
};
