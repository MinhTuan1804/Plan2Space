export type RoomType = 'bedroom' | 'living' | 'dining' | 'kitchen' | 'bathroom'
  | 'altar' | 'garage' | 'courtyard' | 'balcony' | 'storage'

export const ROOM_TYPES: { type: RoomType; label: string }[] = [
  { type: 'bedroom', label: 'Phòng ngủ' },
  { type: 'living', label: 'Phòng khách' },
  { type: 'dining', label: 'Phòng ăn' },
  { type: 'kitchen', label: 'Bếp' },
  { type: 'bathroom', label: 'WC' },
  { type: 'altar', label: 'Phòng thờ' },
  { type: 'garage', label: 'Gara' },
  { type: 'courtyard', label: 'Giếng trời / sân' },
  { type: 'balcony', label: 'Ban công' },
  { type: 'storage', label: 'Kho' },
]

// First match wins: a combined name ("KITCHEN + DINING / PANTRY", "ALTAR STORE") takes its main room.
const KEYWORDS: [RoomType, string[]][] = [
  ['altar', ['tho', 'altar']],
  ['kitchen', ['bep', 'kitchen']],
  ['bathroom', ['wc', 'tam', 've sinh', 'bath', 'toilet']],
  ['garage', ['gara']],
  ['balcony', ['ban cong', 'balcony']],
  ['courtyard', ['gieng troi', 'san phoi', 'light well', 'yard']],
  ['storage', ['kho', 'store', 'storage', 'laundry']],
  ['bedroom', ['ngu', 'bedroom', 'pn']],
  ['living', ['khach', 'living', 'sinh hoat', 'family']],
  ['dining', ['phong an', 'dining']],
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
