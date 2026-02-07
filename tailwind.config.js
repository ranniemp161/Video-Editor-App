/** @type {import('tailwindcss').Config} */
export default {
    prefix: 'tw-',  // Namespace all Tailwind classes to prevent conflicts
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            // Future: Add custom design tokens here to match existing design system
        },
    },
    corePlugins: {
        preflight: false,  // CRITICAL: Prevents Tailwind's CSS reset from affecting existing styles
    },
}
