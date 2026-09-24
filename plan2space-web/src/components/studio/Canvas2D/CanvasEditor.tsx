import React, { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Line } from 'react-konva'
import { WallLayer } from './WallLayer'
import { RoomLayer } from './RoomLayer'
import { OpeningLayer } from './OpeningLayer'
import { fitView } from './canvasTransform'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { ZoomIn, ZoomOut, RotateCcw, Crosshair } from 'lucide-react'

export function CanvasEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 })
  const [stageScale, setStageScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 80, y: 520 })
  const walls = useGeometryStore((s) => s.walls)
  const tool = useEditorStore((s) => s.tool)
  const hasFitted = useRef(false)

  function applyFit() {
    const view = fitView(useGeometryStore.getState().walls, dimensions)
    setStageScale(view.scale)
    setStagePos({ x: view.x, y: view.y })
  }

  // Frame the plan when geometry first appears (project load / AI import); keep the user's view afterwards.
  useEffect(() => {
    if (walls.length === 0) {
      hasFitted.current = false
    } else if (!hasFitted.current) {
      hasFitted.current = true
      applyFit()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [walls.length, dimensions.width, dimensions.height])

  useEffect(() => {
    function updateDimensions() {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.offsetWidth || 600,
          height: containerRef.current.offsetHeight || 600,
        })
      } else {
        setDimensions({
          width: typeof window !== 'undefined' ? window.innerWidth / 2 : 600,
          height: typeof window !== 'undefined' ? window.innerHeight : 600,
        })
      }
    }
    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  function handleWheel(e: any) {
    e.evt.preventDefault()
    const scaleBy = 1.05
    const stage = e.target.getStage()
    const oldScale = stage.scaleX()
    const pointer = stage.getPointerPosition()

    if (!pointer) return

    const mousePointTo = {
      x: (pointer.x - stage.x()) / oldScale,
      y: (pointer.y - stage.y()) / oldScale,
    }

    const newScale = e.evt.deltaY < 0 ? oldScale * scaleBy : oldScale / scaleBy
    const clampedScale = Math.max(0.2, Math.min(newScale, 5))

    setStageScale(clampedScale)
    setStagePos({
      x: pointer.x - mousePointTo.x * clampedScale,
      y: pointer.y - mousePointTo.y * clampedScale,
    })
  }

  function handleResetView() {
    applyFit()
  }

  return (
    <div ref={containerRef} className="w-full h-full relative overflow-hidden bg-[#0d0d10]">
      {/* 2D CAD Grid background */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          backgroundImage: 'linear-gradient(to right, #27272a 1px, transparent 1px), linear-gradient(to bottom, #27272a 1px, transparent 1px)',
          backgroundSize: `${25 * stageScale}px ${25 * stageScale}px`,
          backgroundPosition: `${stagePos.x}px ${stagePos.y}px`
        }}
      />

      {/* Floating Canvas Controls */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-1 bg-[#121215]/90 border border-zinc-800 p-1 rounded-lg backdrop-blur shadow-md">
        <button
          onClick={() => setStageScale((s) => Math.min(s * 1.2, 5))}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          title="Zoom In"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => setStageScale((s) => Math.max(s / 1.2, 0.2))}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          title="Zoom Out"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <button
          onClick={handleResetView}
          className="p-1.5 rounded hover:bg-zinc-800 text-zinc-400 hover:text-white transition"
          title="Reset View"
        >
          <RotateCcw className="w-4 h-4" />
        </button>
        <div className="h-4 w-px bg-zinc-800 mx-0.5" />
        <span className="text-[11px] font-mono text-zinc-400 px-1.5">
          {Math.round(stageScale * 100)}%
        </span>
      </div>

      <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center gap-2 text-[11px] font-mono text-zinc-400 bg-zinc-950/80 px-2 py-1 rounded border border-zinc-800/80">
        <Crosshair className="w-3 h-3 text-blue-500" />
        <span>1m = 50px</span>
        <span>·</span>
        <span>Drag walls to move</span>
      </div>

      <Stage
        width={dimensions.width}
        height={dimensions.height}
        scaleX={stageScale}
        scaleY={stageScale}
        x={stagePos.x}
        y={stagePos.y}
        // A drag with the wall tool draws a wall; only the select tool pans.
        draggable={tool === 'select'}
        onWheel={handleWheel}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() })
          }
        }}
      >
        <Layer>
          <RoomLayer />
          <WallLayer />
          <OpeningLayer />
        </Layer>
      </Stage>
    </div>
  )
}
