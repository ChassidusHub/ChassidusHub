import type { Advisor, Mailer } from '@chassidushub/core';

/**
 * The API's outside helpers, each off until it is set up
 * (docs/accounts.md, docs/deploy.md):
 *
 *   Email       sign-in links, notifications, takedown receipts: through
 *               Cloudflare's Email Service (the EMAIL binding, from an
 *               address on a domain onboarded to Email Sending), or else
 *               through Resend (RESEND_API_KEY); from EMAIL_FROM
 *   Workers AI  writes the reviewer's advice on a suggestion
 *               (CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_AI_TOKEN)
 */

export const DEFAULT_EMAIL_FROM = 'ChassidusHub <no-reply@chassidushub.org>';

/** The part of Cloudflare's send_email binding the API uses. */
export interface SendEmailBinding {
  send(message: {
    from: string | { email: string; name: string };
    to: string;
    subject: string;
    text: string;
    html?: string;
    headers?: Record<string, string>;
  }): Promise<unknown>;
}

/** `Name <address>` as the binding takes it; a bare address stays as it is. */
export function emailAddress(from: string): string | { email: string; name: string } {
  const named = /^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/.exec(from);
  return named && named[1] ? { name: named[1], email: named[2]!.trim() } : from.trim();
}

/** Email through Cloudflare's Email Service: no key to keep, the Worker's own binding sends it. */
export function cloudflareMailer(input: { binding: SendEmailBinding; from?: string }): Mailer {
  return {
    async send(message) {
      try {
        await input.binding.send({ from: emailAddress(input.from ?? DEFAULT_EMAIL_FROM), to: message.to, subject: message.subject, text: message.text, html: message.html, headers: message.headers });
      } catch (error) {
        const { code, message: text } = error as { code?: string; message?: string };
        throw new Error(`Cloudflare email: ${[code, (text ?? String(error)).slice(0, 300)].filter(Boolean).join(' ')}`);
      }
    },
  };
}

/** Email through Resend's HTTP API. */
export function resendMailer(input: { apiKey: string; from?: string; fetch?: typeof fetch }): Mailer {
  return {
    async send(message) {
      const response = await (input.fetch ?? fetch)('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: input.from ?? DEFAULT_EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text, html: message.html, headers: message.headers }),
      });
      if (!response.ok) throw new Error(`Resend: ${response.status} ${(await response.text().catch(() => '')).slice(0, 300)}`);
    },
  };
}

export const DEFAULT_ADVICE_MODEL = '@cf/meta/llama-3.3-70b-instruct-fp8-fast';

/** A chat model on Cloudflare Workers AI, through its REST API. */
export function workersAiAdvisor(input: { accountId: string; token: string; model?: string; fetch?: typeof fetch }): Advisor {
  const model = input.model ?? DEFAULT_ADVICE_MODEL;
  return {
    model: model.replace(/^@cf\//, ''),
    async complete(system, user) {
      const response = await (input.fetch ?? fetch)(`https://api.cloudflare.com/client/v4/accounts/${input.accountId}/ai/run/${model}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${input.token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'system', content: system }, { role: 'user', content: user }], max_tokens: 400, temperature: 0.2 }),
      });
      const body = (await response.json().catch(() => ({}))) as { success?: boolean; errors?: unknown; result?: { response?: string } };
      if (!response.ok || !body.success) throw new Error(`Workers AI: ${response.status} ${JSON.stringify(body.errors ?? body).slice(0, 300)}`);
      return body.result?.response ?? '';
    },
  };
}
