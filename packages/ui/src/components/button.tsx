import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  variant = "primary",
  size = "md",
  className = "",
  ...props
}: ButtonProps) {
  const base = "inline-flex items-center justify-center rounded-md font-medium transition-colors disabled:opacity-50";

  const variants = {
    primary: "bg-[#E9B44C] text-[#0B1623] hover:bg-[#C8922E]",
    secondary: "bg-[#16283F] text-[#EAF0FF] hover:bg-[#16283F]/80",
    danger: "bg-red-600 text-white hover:bg-red-700",
    ghost: "text-[#EAF0FF]/80 hover:bg-[#16283F]",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-5 py-2.5 text-base",
  };

  return (
    <button
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...props}
    />
  );
}
