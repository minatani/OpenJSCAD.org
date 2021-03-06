const flatten = require('../../utils/flatten')
const areAllShapesTheSameType = require('../../utils/areAllShapesTheSameType')

const geom2 = require('../../geometry/geom2')
const geom3 = require('../../geometry/geom3')

const subtractGeom2 = require('./subtractGeom2')
const subtractGeom3 = require('./subtractGeom3')

/**
 * Return a new geometry representing space in the first geometry but
 * not in all subsequent geometries.
 * Note: None of the given geometries are modified.
 *
 * @param {...geometries} geometries - list of geometries
 * @returns {geom2|geom3} a new geometry
 *
 * @example
 * let myshape = subtract(cubiod({size: [5,5,5]}), cubiod({size: [5,5,5], center: [5,5,5]}))
 *
 * @example
 * +-------+            +-------+
 * |       |            |       |
 * |   A   |            |       |
 * |    +--+----+   =   |    +--+
 * +----+--+    |       +----+
 *      |   B   |
 *      |       |
 *      +-------+
 */
const subtract = (...geometries) => {
  geometries = flatten(geometries)
  if (geometries.length === 0) throw new Error('wrong number of arguments')

  if (!areAllShapesTheSameType(geometries)) {
    throw new Error('only subtract of the types are supported')
  }

  let geometry = geometries[0]
  // if (path.isA(geometry)) return pathsubtract(matrix, geometries)
  if (geom2.isA(geometry)) return subtractGeom2(geometries)
  if (geom3.isA(geometry)) return subtractGeom3(geometries)
  return geometry
}

module.exports = subtract
