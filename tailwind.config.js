/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  // No celular, :hover "gruda" após o toque — hover só vale em aparelhos com mouse.
  future: { hoverOnlyWhenSupported: true },
  theme: {
    extend: {
      fontFamily: { sans: ['Inter', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef4ff', 100: '#dbe7ff', 500: '#2f6bf0', 600: '#2457d6', 700: '#1d45ad' },
        income: { DEFAULT: '#12a150', soft: '#e6f6ec', dark: '#22c36b' },
        expense: { DEFAULT: '#e5484d', soft: '#fdecec', dark: '#ff6b6f' },
        ink: { 950: '#0b0d12', 900: '#11141b', 800: '#181c25', 700: '#232835', 600: '#323848' },
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,.04), 0 4px 16px rgba(16,24,40,.06)',
        float: '0 8px 24px rgba(47,107,240,.35)',
      },
      borderRadius: { '2xl': '1.125rem', '3xl': '1.5rem' },
      keyframes: {
        'slide-up': { from: { transform: 'translateY(100%)' }, to: { transform: 'translateY(0)' } },
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'pop-in': { from: { opacity: 0, transform: 'translateY(8px) scale(.98)' }, to: { opacity: 1, transform: 'none' } },
        'fade-out': { from: { opacity: 1 }, to: { opacity: 0 } },
        'slide-down': { from: { transform: 'translateY(0)' }, to: { transform: 'translateY(100%)' } },
        'pop-out': { from: { opacity: 1, transform: 'none' }, to: { opacity: 0, transform: 'translateY(8px) scale(.98)' } },
      },
      animation: {
        'slide-up': 'slide-up .28s cubic-bezier(.2,.8,.2,1)',
        'fade-in': 'fade-in .2s ease-out',
        'pop-in': 'pop-in .22s cubic-bezier(.2,.8,.2,1)',
        'fade-out': 'fade-out .19s ease-in forwards',
        'slide-down': 'slide-down .19s ease-in forwards',
        'pop-out': 'pop-out .17s ease-in forwards',
      },
    },
  },
  plugins: [
    // "press:" = efeito de pressionar só com mouse. No toque, o retorno visual vem do CSS global com
    // um pequeno atraso, para não "selecionar" itens ao encostar o dedo só para rolar a tela.
    ({ addVariant }) => addVariant('press', '@media (hover: hover) and (pointer: fine) { &:active }'),
  ],
};
