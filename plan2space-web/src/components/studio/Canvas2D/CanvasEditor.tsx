import React, { useState, useRef, useEffect } from 'react'
import { Stage, Layer, Line, Text } from 'react-konva'
import { useMeasureTool } from './useMeasureTool'
import { CalibrationDialog } from './CalibrationDialog'
import { applyCalibration, retryUnderlayScale } from './applyCalibration'
import { WallLayer } from './WallLayer'
import { RoomLayer } from './RoomLayer'
import { OpeningLayer } from './OpeningLayer'
import { fitView, screenToPlan, toScreen } from './canvasTransform'
import { useWallTool } from './useWallTool'
import { useOpeningTool } from './useOpeningTool'
import { useGeometryStore } from '../../../stores/geometryStore'
import { useEditorStore } from '../../../stores/editorStore'
import { ZoomIn, ZoomOut, RotateCcw, Crosshair, Image as ImageIcon } from 'lucide-react'
import { useUnderlay } from './useUnderlay'
import { UnderlayLayer } from './UnderlayLayer'

export function CanvasEditor() {
  const containerRef = useRef<HTMLDivElement>(null)
  const [dimensions, setDimensions] = useState({ width: 600, height: 600 })
  const [stageScale, setStageScale] = useState(1)
  const [stagePos, setStagePos] = useState({ x: 80, y: 520 })
  const walls = useGeometryStore((s) => s.walls)
  const tool = useEditorStore((s) => s.tool)
  const wallTool = useWallTool()
  const measureTool = useMeasureTool()
  const [calibrationError, setCalibrationError] = useState<string | null>(null)
  const pendingUnderlayMpp = useEditorStore((s) => s.pendingUnderlayMpp)
  const openingTool = useOpeningTool()
  const underlay = useUnderlay()
  const underlayVisible = useEditorStore((s) => s.underlayVisible)
  const underlayOpacity = useEditorStore((s) => s.underlayOpacity)
  const setUnderlayVisible = useEditorStore((s) => s.setUnderlayVisible)
  const setUnderlayOpacity = useEditorStore((s) => s.setUnderlayOpacity)
  // A tool change (including Escape) abandons a wall in progress.
  useEffect(() => { wallTool.cancel(); measureTool.reset(); setCalibrationError(null) }, [tool])   // eslint-disable-line react-hooks/exhaustive-deps

  function planPointer(e: any) {
    const pos = e.target.getStage()?.getRelativePointerPosition()
    return pos ? screenToPlan(pos) : null
  }
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
        {underlay && (
          <>
            <div className="h-4 w-px bg-zinc-800 mx-0.5" />
            <button
              onClick={() => setUnderlayVisible(!underlayVisible)}
              aria-pressed={underlayVisible}
              className={`p-1.5 rounded hover:bg-zinc-800 transition ${underlayVisible ? 'text-blue-400' : 'text-zinc-400'}`}
              title="Show the imported image under the plan"
            >
              <ImageIcon className="w-4 h-4" />
            </button>
            <input
              type="range" min={0.1} max={1} step={0.05}
              value={underlayOpacity}
              onChange={(e) => setUnderlayOpacity(parseFloat(e.target.value))}
              aria-label="Image opacity"
              className="w-20"
              disabled={!underlayVisible}
            />
          </>
        )}
      </div>

      <div className="absolute bottom-4 left-4 z-10 pointer-events-none flex items-center gap-2 text-[11px] font-mono text-zinc-400 bg-zinc-950/80 px-2 py-1 rounded border border-zinc-800/80">
        <Crosshair className="w-3 h-3 text-blue-500" />
        <span>1m = 50px</span>
        <span>·</span>
        <span>{tool === 'wall' ? 'Drag to draw a wall · Esc to cancel' : tool === 'opening' ? 'Click a wall to place an opening' : tool === 'measure' ? 'Click two points of a known length' : 'Drag walls to move'}</span>
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
        onMouseDown={(e) => {
          const p = planPointer(e)
          if (p && tool === 'wall') wallTool.onPointerDown(p)
          else if (p && tool === 'opening') openingTool.onPointerDown(p)
          else if (p && tool === 'measure') measureTool.onPointerDown(p)
          else if (tool === 'select' && e.target === e.target.getStage()) useEditorStore.getState().select(null)
        }}
        onMouseMove={(e) => {
          const p = planPointer(e)
          if (p && tool === 'wall') wallTool.onPointerMove(p)
          if (p && tool === 'measure') measureTool.onPointerMove(p)
        }}
        onMouseUp={(e) => {
          const p = planPointer(e)
          if (p && tool === 'wall') wallTool.onPointerUp(p)
        }}
        onDragEnd={(e) => {
          if (e.target === e.target.getStage()) {
            setStagePos({ x: e.target.x(), y: e.target.y() })
          }
        }}
      >
        <Layer>
          {underlay && underlayVisible && (
            <UnderlayLayer underlay={underlay.underlay} image={underlay.image} opacity={underlayOpacity} />
          )}
          <RoomLayer />
          <WallLayer />
          <OpeningLayer />
          {wallTool.preview && (
            <Line
              points={wallTool.preview.flatMap((p) => { const s = toScreen(p); return [s.x, s.y] })}
              stroke="#60a5fa"
              strokeWidth={0.2 * 50}
              dash={[12, 6]}
              opacity={0.7}
              listening={false}
            />
          )}
          {measureTool.preview && (() => {
            const [a, b] = measureTool.preview.map(toScreen)
            const length = Math.hypot(measureTool.preview[1].x - measureTool.preview[0].x,
                                      measureTool.preview[1].y - measureTool.preview[0].y)
            return (
              <>
                <Line points={[a.x, a.y, b.x, b.y]} stroke="#facc15" strokeWidth={2} dash={[8, 4]} listening={false} />
                <Text x={(a.x + b.x) / 2 + 6} y={(a.y + b.y) / 2 - 18} text={`${length.toFixed(2)} m`}
                      fontSize={13} fill="#facc15" listening={false} />
              </>
            )
          })()}
        </Layer>
      </Stage>
      {tool === 'measure' && measureTool.measuredM !== null && (
        <CalibrationDialog
          measuredM={measureTool.measuredM}
          onApply={async (realM) => {
            const factor = realM / measureTool.measuredM!
            // The mapping, not the decoded image: the correction must not depend on the image having loaded.
            const error = await applyCalibration(factor, useEditorStore.getState().underlayMeta?.metresPerPixel ?? null)
            measureTool.reset()
            if (error) setCalibrationError(error)
            else useEditorStore.getState().setTool('select')
          }}
          onCancel={() => measureTool.reset()}
        />
      )}
      {calibrationError && (
        <div role="alert" className="absolute left-1/2 top-16 z-20 -translate-x-1/2 flex items-center gap-2 rounded bg-amber-950/90 px-3 py-2 text-xs text-amber-300">
          <span>{calibrationError}</span>
          {pendingUnderlayMpp !== null && (
            <button className="rounded bg-amber-700 px-2 py-0.5 text-white"
                    onClick={async () => setCalibrationError(await retryUnderlayScale())}>Retry</button>
          )}
        </div>
      )}
    </div>
  )
}
