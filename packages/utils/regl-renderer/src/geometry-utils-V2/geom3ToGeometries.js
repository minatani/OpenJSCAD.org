const vec3 = require('gl-vec3')

const { toArray } = require('@jscad/array-utils')

/**
 * Convert a list of geom3 objects to an array of geometries with positions, normals, colors & indices
 * Typically used for displaying the geometric data in a webgl wiever
 * @param {Array} listofgeom3 single or an array of geom3 object(s)
 * @param {Object} options options hash
 * @param {Boolean} options.smoothLighting=false set to true if we want to use interpolated vertex normals
 * this creates nice round spheres but does not represent the shape of the actual model
 * @param {Float} options.normalThreshold=0.349066 threshold beyond which to split normals // 20 deg
 * @param {String} options.color=[1, 0.4, 0, 1] default color of given geometry
 * @returns {Object} [{indices, positions, normals, colors}, ...]
 */
function geom3ToGeometries (listofgeom3, options) {
  const defaults = {
    smoothLighting: false,
    normalThreshold: 0.349066,
    color: [1, 0.4, 0, 1]
  }
  const { smoothLighting, normalThreshold, color } = Object.assign({}, defaults, options)

  let meshColor = color ? normalizedColor(color) : undefined

  listofgeom3 = toArray(listofgeom3)
  const listofgeometries = listofgeom3.map((geometry) => convert({ meshColor, smoothLighting, normalThreshold }, geometry))

  return listofgeometries
}

/*
 * Convert the given geometry using the given options (see above for options)
 * @returns {Object} [{indices, positions, normals, colors}, ...]
 */
const convert = (options, geometry) => {
  let color = options.meshColor
  let geometries = []

  let positions = []
  let colors = []
  let normals = []
  let indices = []

  if ('color' in geometry) color = geometry.color

  // flag for transparency
  let isTransparent = false

  const polygons = geometry.polygons

  let normalPositionLookup = []
  normalPositionLookup = {}
  let tupplesIndex = 0

  // FIXME this isn't going to work if the polygons are > 65000 (see below)

  for (let i = 0; i < polygons.length; i++) {
    const polygon = polygons[i]

    const faceColor = polygonColor(polygon, color)
    const rawNormal = polygon.plane
    const normal = [rawNormal[0], rawNormal[1], rawNormal[2]]

    if (faceColor && faceColor[3] !== 1) {
      isTransparent = true
    }

    const polygonIndices = []
    // we need unique tupples of normal + position , that gives us a specific index (indices)
    // if the angle between a given normal and another normal is less than X they are considered the same
    for (let j = 0; j < polygon.vertices.length; j++) {
      let index

      const vertex = polygon.vertices[j]
      const position = [vertex[0], vertex[1], vertex[2]]

      if (options.smoothLighting) {
        const candidateTupple = { normal, position }
        const existingTupple = fuzyNormalAndPositionLookup(normalPositionLookup, candidateTupple, options.normalThreshold)
        if (!existingTupple) {
          const existingPositing = normalPositionLookup[candidateTupple.position]
          const itemToAdd = [{ normal: candidateTupple.normal, index: tupplesIndex }]
          if (!existingPositing) {
            normalPositionLookup[candidateTupple.position] = itemToAdd
          } else {
            normalPositionLookup[candidateTupple.position] = normalPositionLookup[candidateTupple.position]
              .concat(itemToAdd)
          }
          index = tupplesIndex
          // normalPositionLookup.push(candidateTupple)
          // index = normalPositionLookup.length - 1
          if (faceColor) {
            colors.push(faceColor)
          }
          normals.push(normal)
          positions.push(position)
          tupplesIndex += 1
        } else {
          index = existingTupple.index
        }
      } else {
        if (faceColor) {
          colors.push(faceColor)
        }
        normals.push(normal)
        positions.push(position)
        index = positions.length - 1
      }

      polygonIndices.push(index)
    }

    for (let j = 2; j < polygonIndices.length; j++) {
      indices.push([polygonIndices[0], polygonIndices[j - 1], polygonIndices[j]])
    }

    // if too many vertices or we are at the end, start a new geometry
    if (positions.length > 65000 || i === polygons.length - 1) {
      // special case to deal with face color SPECICIALLY SET TO UNDEFINED
      if (faceColor === undefined) {
        geometries.push({
          indices,
          positions,
          normals,
          color,
          isTransparent
        })
      } else {
        geometries.push({
          indices,
          positions,
          normals,
          colors,
          isTransparent
        })
      }
    }
  }
  return geometries
}

/** determine if input is a hex (color) or not
 * @param  {Object} object a string, array, object , whatever
 * @returns {Boolean} wether the input is a hex string or not
 */
function isHexColor (object) {
  if (typeof sNum !== 'string') {
    return false
  }
  return /(^#[0-9A-F]{6}$)|(^#[0-9A-F]{3}$)/i.test(object)
}

// modified from https://stackoverflow.com/questions/21646738/convert-hex-to-rgba
function hexToRgbNormalized (hex, alpha) {
  hex = hex.replace('#', '')
  const r = parseInt(hex.length === 3 ? hex.slice(0, 1).repeat(2) : hex.slice(0, 2), 16)
  const g = parseInt(hex.length === 3 ? hex.slice(1, 2).repeat(2) : hex.slice(2, 4), 16)
  const b = parseInt(hex.length === 3 ? hex.slice(2, 3).repeat(2) : hex.slice(4, 6), 16)
  return (alpha ? [r, g, b, alpha] : [r, g, b, 255]).map(x => x / 255)
}

/** outputs a normalized [0...1] range, 4 component array color
 * @param  {} input
 */
function normalizedColor (input) {
  if (isHexColor(input)) {
    return hexToRgbNormalized(input)
  } else if (Array.isArray(input) && input.length >= 3) {
    input = input.length < 4 ? [input[0], input[1], input[2], 1] : input.slice(0, 4)
    if (input[0] > 1 || input[1] > 1 || input[2] > 1) {
      return input.map(x => x / 255)
    }
    return input
  }
}

/**
 * return the color information of a polygon
 * @param {Object} polygon a polygon
 * @param {Object} color a default color
 * @returns {Array}  `[r, g, b, a]`
 */
function polygonColor (polygon, color) {
  let faceColor = color

  if (polygon.color) {
    faceColor = polygon.color
  }
  // opaque is default
  if (faceColor && faceColor.length < 4) {
    faceColor.push(1.0)
  }
  return faceColor
}

/**
 * determine if the two given normals are 'similar' ie if the distance/angle between the
 * two is less than the given threshold
 * @param {Array} normal a 3 component array normal
 * @param {Array} otherNormal another 3 component array normal
 * @returns {Boolean} true if the two normals are similar
 */
function areNormalsSimilar (normal, otherNormal, threshold) {
  return vec3.distance(normal, otherNormal) <= threshold
  // angle computation is too slow but actually precise
  // return vec3.angle(normal, otherNormal) <= threshold
}

function fuzyNormalAndPositionLookup (normalPositionLookup, toCompare, normalThreshold) {
  const normalsCandidates = normalPositionLookup[toCompare.position]
  if (normalsCandidates) {
    // normalPositionLookup[toCompare.position] = normalPositionLookup[toCompare.position].concat([toCompare.normal])
    // get array of normals with same position
    for (let i = 0; i < normalsCandidates.length; i++) {
      const normal = normalsCandidates[i].normal
      const similarNormal = areNormalsSimilar(normal, toCompare.normal, normalThreshold)
      const similar = similarNormal
      if (similar) {
        return { tupple: { position: toCompare.position, normal }, index: normalsCandidates[i].index }
      }
    }
  }
  return undefined
}

module.exports = geom3ToGeometries
