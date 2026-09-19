import type { SVGProps } from 'react'

type P = SVGProps<SVGSVGElement>

const base = (props: P) => ({
  width: 20,
  height: 20,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  ...props,
})

export const IconDashboard = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="3" width="7" height="8" rx="2" />
    <rect x="14" y="3" width="7" height="5" rx="2" />
    <rect x="14" y="11" width="7" height="10" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
  </svg>
)

export const IconList = (p: P) => (
  <svg {...base(p)}>
    <path d="M8 6h13M8 12h13M8 18h13M3.5 6h.01M3.5 12h.01M3.5 18h.01" />
  </svg>
)

export const IconReceipt = (p: P) => (
  <svg {...base(p)}>
    <path d="M6 2.5h12a1 1 0 0 1 1 1v17.2a.5.5 0 0 1-.76.43L16 19.8l-2.24 1.34a.5.5 0 0 1-.52 0L11 19.8l-2.24 1.34a.5.5 0 0 1-.52 0L6 19.8l-2.24 1.33A.5.5 0 0 1 3 20.7V3.5a1 1 0 0 1 1-1Z" />
    <path d="M7.5 8h9M7.5 12h6" />
  </svg>
)

export const IconTags = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H11l8 8-5.5 5.5-8-8V7.5Z" />
    <circle cx="8" cy="9.5" r="1.4" />
  </svg>
)

export const IconGallery = (p: P) => (
  <svg {...base(p)}>
    <rect x="3" y="4" width="18" height="16" rx="3" />
    <circle cx="8.5" cy="9.5" r="1.8" />
    <path d="m4 17 4.5-4.2a2 2 0 0 1 2.7 0L20 20" />
  </svg>
)

export const IconChat = (p: P) => (
  <svg {...base(p)}>
    <path d="M21 12a8 8 0 0 1-8 8H7l-4 2.5V12a8 8 0 0 1 8-8h2a8 8 0 0 1 8 8Z" />
    <path d="M9 11h6M9 15h4" />
  </svg>
)

export const IconSettings = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1.05-1.47 1.6 1.6 0 0 0-1.77.32l-.06.06A2 2 0 1 1 4.44 17l.06-.06a1.6 1.6 0 0 0 .32-1.77A1.6 1.6 0 0 0 3.35 14.2H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.47-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06A2 2 0 1 1 7.02 4.5l.06.06a1.6 1.6 0 0 0 1.77.32H9a1.6 1.6 0 0 0 .96-1.47V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06A2 2 0 1 1 19.56 7l-.06.06a1.6 1.6 0 0 0-.32 1.77V9c.25.6.83 1 1.47 1.05H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.47.97Z" />
  </svg>
)

export const IconPlus = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const IconSearch = (p: P) => (
  <svg {...base(p)}>
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.2-3.2" />
  </svg>
)

export const IconFilter = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 5h18l-7 8v6l-4 2v-8L3 5Z" />
  </svg>
)

export const IconTrash = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 7h16M10 11v6M14 11v6M5.5 7l1 13h11l1-13M9 7V4.5h6V7" />
  </svg>
)

export const IconEdit = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0-3-3L5 17v3Z" />
    <path d="m15 6 3 3" />
  </svg>
)

export const IconClose = (p: P) => (
  <svg {...base(p)}>
    <path d="m6 6 12 12M18 6 6 18" />
  </svg>
)

export const IconUpload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5" />
    <path d="M4 15v3a3 3 0 0 0 3 3h10a3 3 0 0 0 3-3v-3" />
  </svg>
)

export const IconCamera = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 8h2.6l1.4-2.2h8l1.4 2.2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2Z" />
    <circle cx="12" cy="13.5" r="3.4" />
  </svg>
)

export const IconSparkles = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9 12 3.5Z" />
    <path d="M18.5 3v3M20 4.5h-3M5.5 16v3M7 17.5H4" />
  </svg>
)

export const IconCheck = (p: P) => (
  <svg {...base(p)}>
    <path d="m4.5 12.5 5 5 10-11" />
  </svg>
)

export const IconAlert = (p: P) => (
  <svg {...base(p)}>
    <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0Z" />
    <path d="M12 9v4.5M12 17h.01" />
  </svg>
)

export const IconInfo = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 7.8h.01" />
  </svg>
)

export const IconSun = (p: P) => (
  <svg {...base(p)}>
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
  </svg>
)

export const IconMoon = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />
  </svg>
)

export const IconDownload = (p: P) => (
  <svg {...base(p)}>
    <path d="M12 4v12m0 0 4.5-4.5M12 16l-4.5-4.5" />
    <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
  </svg>
)

export const IconSend = (p: P) => (
  <svg {...base(p)}>
    <path d="M20.5 3.5 3 10.2l6.6 2.4M20.5 3.5 14 20.5l-4.4-7.9M20.5 3.5 9.6 12.6" />
  </svg>
)

export const IconChart = (p: P) => (
  <svg {...base(p)}>
    <path d="M4 20V10M10 20V4M16 20v-7M22 20H2" />
  </svg>
)

export const IconWallet = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v1" />
    <path d="M3 8v9a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-2M21 9v3h-4a1.5 1.5 0 0 1 0-3h4Z" />
  </svg>
)

export const IconMenu = (p: P) => (
  <svg {...base(p)}>
    <path d="M3 6h18M3 12h18M3 18h18" />
  </svg>
)

export const IconChevron = (p: P) => (
  <svg {...base(p)}>
    <path d="m9 6 6 6-6 6" />
  </svg>
)

export const IconRefresh = (p: P) => (
  <svg {...base(p)}>
    <path d="M20 11a8 8 0 1 0-.9 4.6" />
    <path d="M20 4v7h-7" />
  </svg>
)

export const IconLink = (p: P) => (
  <svg {...base(p)}>
    <path d="M10 13.5a4 4 0 0 0 5.7.4l2.6-2.6a4 4 0 1 0-5.7-5.7l-1.3 1.3" />
    <path d="M14 10.5a4 4 0 0 0-5.7-.4L5.7 12.7a4 4 0 1 0 5.7 5.7l1.3-1.3" />
  </svg>
)
