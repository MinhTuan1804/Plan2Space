import '@testing-library/jest-dom/vitest'

if (typeof window !== 'undefined') {
  const context2dMock = {
    fillRect: () => {},
    clearRect: () => {},
    getImageData: (_x: number, _y: number, w: number, h: number) => ({ data: new Array(w * h * 4) }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    fill: () => {},
    measureText: () => ({ width: 0 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
  }

  HTMLCanvasElement.prototype.getContext = function (type: string) {
    if (type === '2d') {
      return {
        ...context2dMock,
        canvas: this,
      } as any
    }
    return null
  }
}
