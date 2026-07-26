type Props = {
  name: string;
  avatarUrl?: string | null;
  size?: "sm" | "md" | "lg";
};

export default function UserAvatar({ name, avatarUrl, size = "md" }: Props) {
  const sizeClass = {
    sm: "h-8 w-8 text-sm",
    md: "h-10 w-10 text-base",
    lg: "h-24 w-24 text-3xl",
  }[size];
  const initial = name.trim().charAt(0).toLocaleUpperCase("lv-LV") || "?";

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={`${sizeClass} shrink-0 rounded-full object-cover`}
      />
    );
  }

  return (
    <div className={`${sizeClass} flex shrink-0 items-center justify-center rounded-full bg-blue-600 font-bold text-white`}>
      {initial}
    </div>
  );
}
