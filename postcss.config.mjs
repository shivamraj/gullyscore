// Runs Tailwind CSS v4 when Next.js builds our CSS.
// Tailwind v4 needs no tailwind.config file: theme settings live in src/app/globals.css.
const config = {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};

export default config;
