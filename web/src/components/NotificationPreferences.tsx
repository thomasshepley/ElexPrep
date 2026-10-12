import { useState } from 'react';
import { NOTIFICATION_CATEGORIES, NOTIFICATION_CATEGORY_LABELS, type NotificationCategory } from '@elexprep/shared';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthContext';

/**
 * Per-category notification opt-out, shared by the staff My Preferences page and the crew
 * portal's My Account page - both read/write the same User.prefs.notifications JSON (see
 * server/src/notifications.ts's isCategoryEnabled), so one component serves both without
 * needing to know which shell it's in. Showing all four categories to everyone is deliberately
 * simple: a category that can never fire for a given role (e.g. "New crew applications" for a
 * crew account) is just never going to notify them regardless of this setting.
 */
export default function NotificationPreferences() {
  const { user, setUser } = useAuth();
  const [saved, setSaved] = useState(false);
  if (!user) return null;

  const stored = (user.prefs?.notifications as Partial<Record<NotificationCategory, boolean>>) ?? {};

  const toggle = async (category: NotificationCategory, enabled: boolean) => {
    setSaved(false);
    const nextNotifications = { ...stored, [category]: enabled };
    const updated = await api.auth.updateMe({ prefs: { ...user.prefs, notifications: nextNotifications } });
    setUser(updated);
    setSaved(true);
  };

  return (
    <div>
      {NOTIFICATION_CATEGORIES.map((category) => (
        <label key={category} className="switch" style={{ display: 'flex', marginBottom: '0.6rem' }}>
          <input type="checkbox" checked={stored[category] !== false} onChange={(e) => toggle(category, e.target.checked)} />
          <span className="switch-track" />
          {NOTIFICATION_CATEGORY_LABELS[category]}
        </label>
      ))}
      {saved && <p className="muted">Saved ✓</p>}
    </div>
  );
}
