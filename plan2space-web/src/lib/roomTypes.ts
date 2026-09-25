export type RoomType = 'bedroom' | 'living' | 'dining' | 'kitchen' | 'bathroom'

export const ROOM_TYPES: { type: RoomType; label: string }[] = [
  { type: 'bedroom', label: 'Phòng ngủ' },
  { type: 'living', label: 'Phòng khách' },
  { type: 'dining', label: 'Phòng ăn' },
  { type: 'kitchen', label: 'Bếp' },
  { type: 'bathroom', label: 'WC' },
]

const KEYWORDS: [RoomType, string[]][] = [
  ['bedroom', ['ngu', 'bedroom']],
  ['living', ['khach', 'living']],
  ['dining', ['phong an', 'dining']],
  ['kitchen', ['bep', 'kitchen']],
  ['bathroom', ['wc', 'tam', 've sinh', 'bath', 'toilet']],
]

function normalise(label: string): string {
  return label.replace(/đ/g, 'd').replace(/Đ/g, 'D').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim()
}

// Rooms from the pipeline are "Room N"; a type exists only once the user has chosen one.
export function roomTypeOf(label: string): RoomType | null {
  const text = normalise(label)
  for (const [type, words] of KEYWORDS) if (words.some((w) => text.includes(w))) return type
  return null
}

export function labelFor(type: RoomType): string {
  return ROOM_TYPES.find((t) => t.type === type)!.label
}
