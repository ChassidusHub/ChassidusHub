import type { Config } from '@react-router/dev/config';

// Every page is rendered on the server: slow phones and search engines get the
// whole page at once, and it reads before any JavaScript has arrived.
export default {
  appDirectory: 'app',
  ssr: true,
} satisfies Config;
