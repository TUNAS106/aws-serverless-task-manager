const paths = {
  book: 'M4 4h6a3 3 0 0 1 3 3v14a4 4 0 0 0-4-2H4zm18 0h-6a3 3 0 0 0-3 3v14a4 4 0 0 1 4-2h5z',
  grid: 'M3 3h7v7H3zm11 0h7v7h-7zM3 14h7v7H3zm11 0h7v7h-7z',
  clock: 'M12 8v4l3 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  check: 'm5 12 4 4L19 6',
  plus: 'M12 5v14M5 12h14',
  search: 'm21 21-5-5M18 10a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  arrow: 'M5 12h14m-5-5 5 5-5 5',
  edit: 'm14 5 5 5M4 20l4-1L21 6l-4-4L4 15z',
  trash: 'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
  close: 'm6 6 12 12M6 18 18 6',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M9 21h6',
  flag: 'M5 22V3m0 1c5-4 9 4 14 0v11c-5 4-9-4-14 0',
  logout: 'M9 4H4v16h5m5-13 5 5-5 5m-6-5h13',
  help: 'M9 8a3 3 0 1 1 5 2c-2 1-2 2-2 4m0 3h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
  refresh: 'M20 7a9 9 0 1 0 1 10M20 2v6h-6',
  sun: 'M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',
  shield: 'M12 2 3 6v6c0 5 9 10 9 10s9-5 9-10V6zM8 11l3 3 5-6',
}
export default function Icon({ name, size = 20, ...props }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      <path d={paths[name] || paths.book} />
    </svg>
  )
}
