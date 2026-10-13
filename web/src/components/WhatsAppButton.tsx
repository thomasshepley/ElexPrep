/** Converts a free-typed UK-style phone number into the digits-only, country-coded form wa.me
 * needs. Best-effort, not validation: "+44 (0)7700…" and "0044…" both become 447700…, a leading
 * 0 becomes the UK country code (44), and anything that isn't a digit is dropped. */
export function toWhatsAppDigits(phone: string): string {
  // "(0)" is the trunk prefix written alongside a country code - never dialled internationally.
  let digits = phone.replace(/\(\s*0\s*\)/g, '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.startsWith('0')) digits = `44${digits.slice(1)}`;
  // "+44 07700…" (trunk zero kept after the country code) is a common way of writing it too.
  if (digits.startsWith('440')) digits = `44${digits.slice(3)}`;
  return digits;
}

function ChatIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M21 11.5a8.4 8.4 0 0 1-12.4 7.4L3 21l2.1-5.4A8.4 8.4 0 1 1 21 11.5z" />
    </svg>
  );
}

/**
 * A "Chat on WhatsApp" deep link (wa.me) for a phone number - no WhatsApp Business API
 * integration, just opens a chat in the viewer's own WhatsApp. Renders nothing if there's no
 * usable number. `compact` is an icon-only version for dense tables.
 */
export default function WhatsAppButton({
  phone,
  label = 'Chat on WhatsApp',
  compact = false,
}: {
  phone: string | null | undefined;
  label?: string;
  compact?: boolean;
}) {
  if (!phone || !phone.trim()) return null;
  const digits = toWhatsAppDigits(phone);
  if (digits.length < 8) return null;

  return (
    <a
      className={compact ? 'whatsapp-button whatsapp-button-compact' : 'whatsapp-button'}
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noreferrer"
      aria-label={compact ? `${label} (${phone})` : undefined}
      title={compact ? label : undefined}
    >
      <ChatIcon />
      {!compact && label}
    </a>
  );
}
