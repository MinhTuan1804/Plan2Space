import React from 'react'
import { Image as KonvaImage } from 'react-konva'
import { Underlay } from '../../../services/underlayService'
import { underlayRect } from './canvasTransform'

export function UnderlayLayer({ underlay, image, opacity }: { underlay: Underlay; image: HTMLImageElement; opacity: number }) {
  const rect = underlayRect(underlay)
  return <KonvaImage image={image} {...rect} opacity={opacity} listening={false} />
}
