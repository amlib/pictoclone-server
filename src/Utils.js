const { randomInt } = await import('crypto');

const getPngDimensions = function (uint8png) {
  const view = new DataView(uint8png.buffer, uint8png.byteOffset)
  const magicA = view.getUint32(0)
  const magicB = view.getUint32(4)
  if (magicA  !== 0x89504E47 || magicB !== 0x0D0A1A0A) {
    return null
  }

  const chunkLength = view.getUint32(8, false)
  const chunkType = view.getUint32(12, false)
  if (chunkType !== 0x49484452 || chunkLength !== 0x0000000D) {
    return null
  }

  const width = view.getUint32(16, false)
  const height = view.getUint32(20, false)
  if (width <= 0 || height <= 0) {
    return null
  }

  return {
    width,
    height
  }
}

const generateUniqueId = function () {
  return randomInt(0, 2**48 - 1) + randomInt(0, 2**4)
}

export { getPngDimensions, generateUniqueId }