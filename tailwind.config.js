/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,jsx}',
    './components/**/*.{js,jsx}',
  ],
  theme: {
    extend: {
      colors: {
        kpr: {
          burgundy: '#4c1918',
          'burgundy-dark': '#3a1311',
          green: '#43512d',
          'green-light': '#526b38',
          'green-muted': '#6b7f52',
          gold: '#c9a96b',
          cream: '#f5f0e8',
        },
        portal: {
          bg: '#f0f2ec',
          surface: '#ffffff',
          'surface-muted': '#f8faf6',
          border: '#e2e8dc',
          text: '#1f2933',
          'text-muted': '#64748b',
          danger: '#b42318',
        },
      },
      boxShadow: {
        portal: '0 4px 18px rgba(31, 41, 51, 0.08)',
        'portal-lg': '0 12px 40px rgba(31, 41, 51, 0.12)',
      },
      borderRadius: {
        portal: '10px',
        'portal-lg': '14px',
      },
      fontFamily: {
        portal: ['Segoe UI', 'system-ui', '-apple-system', 'Roboto', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
