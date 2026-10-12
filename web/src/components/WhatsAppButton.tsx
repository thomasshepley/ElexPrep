/** Converts a free-typed UK-style phone number into the digits-only, country-coded form wa.me
 * needs. Best-effort, not validation: a leading 0 becomes the UK country code (44), a leading +
 * is stripped, everything else that isn't a digit is dropped. Good enough for a "chat" shortcut,
 * not a substitute for real phone number parsing. */
function toWhatsAppDigits(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) return digits.slice(1);
  if (digits.startsWith('0')) return `44${digits.slice(1)}`;
  return digits;
}

/**
 * A "Chat on WhatsApp" deep link (wa.me) for a crew member's phone number - no WhatsApp
 * Business API integration, just opens a chat in the viewer's own WhatsApp. Renders nothing if
 * there's no phone number to link.
 */
export default function WhatsAppButton({ phone, label = 'Chat on WhatsApp' }: { phone: string | null | undefined; label?: string }) {
  if (!phone || !phone.trim()) return null;
  const digits = toWhatsAppDigits(phone);
  if (digits.length < 8) return null;

  return (
    <a
      className="whatsapp-button"
      href={`https://wa.me/${digits}`}
      target="_blank"
      rel="noreferrer"
      style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', textDecoration: 'none', borderRadius: 'var(--radius-sm)', padding: '0.5rem 0.9rem', fontWeight: 600, fontSize: 'var(--text-sm)' }}
    >
      {label}
    </a>
  );
}
