type BadgeNavigator = Navigator & {
  setAppBadge?: (count?: number) => Promise<void>;
  clearAppBadge?: () => Promise<void>;
};

export async function updateAppBadge(count: number) {
  if (typeof navigator === "undefined") return;

  const badgeNavigator = navigator as BadgeNavigator;
  try {
    if (count > 0) {
      await badgeNavigator.setAppBadge?.(count);
    } else {
      await badgeNavigator.clearAppBadge?.();
    }
  } catch {
    // Ne visas ierīces un pārlūki atbalsta PWA ikonas skaitītāju.
  }
}
