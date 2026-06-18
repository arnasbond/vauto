/** SVG logo matching mockup — speech-bubble with stylized V */
export function VautoLogo({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <svg
        width="36"
        height="36"
        viewBox="0 0 36 36"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <circle cx="18" cy="16" r="14" fill="white" fillOpacity="0.95" />
        <path
          d="M10 28 L14 22 L10 22 Z"
          fill="white"
          fillOpacity="0.95"
        />
        <text
          x="18"
          y="21"
          textAnchor="middle"
          fill="#2979ff"
          fontSize="16"
          fontWeight="700"
          fontFamily="system-ui, sans-serif"
        >
          V
        </text>
      </svg>
      <span className="text-xl font-bold tracking-tight text-white">auto</span>
    </div>
  );
}
