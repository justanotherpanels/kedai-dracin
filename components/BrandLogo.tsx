import Image from "next/image";

type BrandLogoProps = {
  variant?: "full" | "mark";
  className?: string;
  priority?: boolean;
};

export function BrandLogo({
  variant = "full",
  className = "",
  priority = false,
}: BrandLogoProps) {
  if (variant === "mark") {
    return (
      <Image
        src="/favicon.png"
        alt="Kedai Dracin"
        width={40}
        height={40}
        priority={priority}
        className={`h-10 w-10 object-contain ${className}`}
      />
    );
  }

  return (
    <Image
      src="/logo.png"
      alt="Kedai Dracin — Platform Drama Terlengkap"
      width={280}
      height={72}
      priority={priority}
      className={`h-auto w-[min(100%,220px)] object-contain object-left ${className}`}
    />
  );
}
