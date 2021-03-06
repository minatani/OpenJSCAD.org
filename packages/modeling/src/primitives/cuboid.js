const geom3 = require('../geometry/geom3')
const poly3 = require('../geometry/poly3')

/**
 * Construct an axis-aligned solid cuboid.
 * @param {Object} [options] - options for construction
 * @param {Array} [options.size=[2,2,2]] - dimensions of cuboid; width, depth, height
 * @returns {geom3} new 3D geometry
 *
 * @example
 * let myshape = cuboid(size: [5, 10, 5]})
 */
const cuboid = (options) => {
  const defaults = {
    size: [2, 2, 2]
  }
  let center = [0,0,0];
  let {size} = Object.assign({}, defaults, options)

  if (!Array.isArray(size)) throw new Error('size must be an array')
  if (size.length < 3) throw new Error('size must contain width, depth and height values')

  let result = geom3.create(
    // adjust a basic shape to size
    [
      [ [0, 4, 6, 2], [-1, 0, 0] ],
      [ [1, 3, 7, 5], [+1, 0, 0] ],
      [ [0, 1, 5, 4], [0, -1, 0] ],
      [ [2, 6, 7, 3], [0, +1, 0] ],
      [ [0, 2, 3, 1], [0, 0, -1] ],
      [ [4, 5, 7, 6], [0, 0, +1] ]
    ].map((info) => {
      let points = info[0].map((i) => {
        let pos = [
          center[0] + (size[0] / 2) * (2 * !!(i & 1) - 1),
          center[1] + (size[1] / 2) * (2 * !!(i & 2) - 1),
          center[2] + (size[2] / 2) * (2 * !!(i & 4) - 1)
        ]
        return pos
      })
      return poly3.fromPoints(points)
    })
  )
  return result
}

/**
 * Construct an axis-aligned solid cube with six square faces.
 * @see {@link cuboid} for more options, as this is an alias to cuboid
 * @param {Object} [options] - options for construction
 * @param {Number} [options.size=2] - dimension of cube
 * @returns {geom3} new 3D geometry
 *
 * @example
 * let mycube = cube({size: 10})
 */
const cube = (options) => {
  const defaults = {
    size: 2
  }
  let {size} = Object.assign({}, defaults, options)

  size = [size, size, size]

  return cuboid({size: size})
}

module.exports = {
  cube,
  cuboid
}
